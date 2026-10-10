// ============================================
// GymMaster — Controller Autenticazione
// Gestisce le richieste HTTP per auth
// ============================================

import * as authService from '../services/autenticazione.service.js';
import * as passkeyService from '../services/passkey.service.js';
import logger from '../utils/logger.js';
import { descriviDispositivo } from '../utils/dispositivo.js';

/**
 * Il refresh token viaggia in un cookie HttpOnly limitato alle rotte /auth:
 * JavaScript non lo legge, e le altre rotte non lo ricevono.
 */
function impostaCookieRefresh(req, res, token, durataGiorni) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    maxAge: durataGiorni * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth'
  });
}

/**
 * POST /api/v1/auth/registrazione
 * Registra un nuovo utente (attivo; verifica email se Resend è configurato).
 */
export async function registrazione(req, res, next) {
  try {
    const utente = await authService.registraUtente(req.body);

    res.status(201).json({
      successo: true,
      messaggio: utente.richiedeVerificaEmail
        ? 'Registrazione avvenuta. Controlla la tua email per verificare l\'account.'
        : 'Registrazione avvenuta con successo.',
      dati: utente
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * GET /api/v1/auth/verifica-email?token=...
 * Conferma l'indirizzo email tramite il token ricevuto via email.
 */
export async function verificaEmail(req, res, next) {
  try {
    const esito = await authService.verificaEmailToken(req.query?.token);
    res.json({
      successo: true,
      messaggio: esito.giaVerificata ? 'Email già verificata.' : 'Email verificata con successo!',
      dati: esito
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/reinvia-verifica { email }
 * Reinvia l'email di verifica (risposta generica per non rivelare l'esistenza dell'account).
 */
export async function reinviaVerifica(req, res, next) {
  try {
    await authService.reinviaVerifica(req.body?.email);
    res.json({
      successo: true,
      messaggio: 'Se l\'indirizzo è registrato e non ancora verificato, ti abbiamo inviato una nuova email.'
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/richiedi-reset { email }
 * Invia (se l'email esiste) il link per reimpostare la password.
 */
export async function richiediReset(req, res, next) {
  try {
    await authService.richiediResetPassword(req.body?.email);
    res.json({
      successo: true,
      messaggio: 'Se l\'indirizzo è registrato, ti abbiamo inviato un link per reimpostare la password.'
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/reimposta-password { token, password }
 * Imposta una nuova password tramite il token ricevuto via email.
 */
export async function reimpostaPassword(req, res, next) {
  try {
    await authService.reimpostaPasswordConToken(req.body?.token, req.body?.password);
    res.json({ successo: true, messaggio: 'Password reimpostata con successo. Ora puoi accedere.' });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/login
 * Effettua il login e restituisce i token.
 */
export async function login(req, res, next) {
  try {
    const risultato = await authService.loginUtente(req.body, {
      dispositivo: descriviDispositivo(req.headers['user-agent'])
    });

    // Durata del cookie come quella del refresh token (7 giorni, 30 con "ricorda dispositivo")
    impostaCookieRefresh(req, res, risultato.refreshToken, risultato.durataGiorni);

    res.json({
      successo: true,
      messaggio: 'Login effettuato con successo',
      dati: {
        accessToken: risultato.accessToken,
        utente: risultato.utente
      }
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Rinnova l'access token usando il refresh token dal cookie.
 */
export async function refresh(req, res, next) {
  try {
    const tokenRefresh = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!tokenRefresh) {
      return res.status(401).json({
        successo: false,
        messaggio: 'Refresh token mancante'
      });
    }

    const risultato = await authService.rinnovaToken(tokenRefresh);

    // Aggiorna il cookie con il nuovo refresh token, con la durata originale
    impostaCookieRefresh(req, res, risultato.refreshToken, risultato.durataGiorni || 7);

    res.json({
      successo: true,
      dati: {
        accessToken: risultato.accessToken
      }
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/logout
 * Revoca il refresh token e cancella il cookie.
 */
export async function logout(req, res, next) {
  try {
    const tokenRefresh = req.cookies?.refreshToken || req.body?.refreshToken;

    await authService.logoutUtente(tokenRefresh);

    // Cancella il cookie
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'strict',
      path: '/api/v1/auth'
    });

    res.json({
      successo: true,
      messaggio: 'Logout effettuato con successo'
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * GET /api/v1/auth/sessioni
 * I dispositivi collegati all'account, quello della richiesta per primo.
 */
export async function sessioni(req, res, next) {
  try {
    const elenco = await authService.elencaSessioni(req.utente.id, req.utente.famiglia);
    res.json({ successo: true, dati: elenco });
  } catch (errore) {
    next(errore);
  }
}

/**
 * DELETE /api/v1/auth/sessioni/:famiglia
 * Scollega un altro dispositivo: smette subito di funzionare.
 */
export async function chiudiSessione(req, res, next) {
  try {
    await authService.chiudiSessione(req.utente.id, req.params.famiglia);
    res.json({ successo: true, messaggio: 'Dispositivo scollegato' });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/sessioni/chiudi-altre
 * Scollega tutti i dispositivi tranne questo.
 */
export async function chiudiAltreSessioni(req, res, next) {
  try {
    await authService.chiudiAltreSessioni(req.utente.id, req.utente.famiglia);
    res.json({ successo: true, messaggio: 'Gli altri dispositivi sono stati scollegati' });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/passkey/accesso/opzioni
 * La sfida da far firmare a una passkey, per entrare senza password.
 */
export async function passkeyAccessoOpzioni(req, res, next) {
  try {
    res.json({ successo: true, dati: await passkeyService.opzioniAccesso() });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/passkey/accesso/verifica { id, risposta, ricordaDispositivo }
 * La firma della passkey: se e' buona, come un login con password.
 */
export async function passkeyAccessoVerifica(req, res, next) {
  try {
    const { id, risposta, ricordaDispositivo } = req.body || {};
    const risultato = await passkeyService.verificaAccesso(id, risposta, {
      ricordaDispositivo: ricordaDispositivo === true,
      dispositivo: descriviDispositivo(req.headers['user-agent'])
    });
    impostaCookieRefresh(req, res, risultato.refreshToken, risultato.durataGiorni);
    res.json({
      successo: true,
      messaggio: 'Login effettuato con successo',
      dati: { accessToken: risultato.accessToken, utente: risultato.utente }
    });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/auth/passkey — Le passkey dell'utente */
export async function passkeyElenco(req, res, next) {
  try {
    res.json({ successo: true, dati: await passkeyService.elencaPasskey(req.utente.id) });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/passkey/registrazione/opzioni { password }
 * Per aggiungere una passkey serve la password, non basta la sessione.
 */
export async function passkeyRegistrazioneOpzioni(req, res, next) {
  try {
    res.json({ successo: true, dati: await passkeyService.opzioniRegistrazione(req.utente.id, req.body?.password) });
  } catch (errore) {
    next(errore);
  }
}

/** POST /api/v1/auth/passkey/registrazione/verifica { id, risposta } */
export async function passkeyRegistrazioneVerifica(req, res, next) {
  try {
    const { id, risposta } = req.body || {};
    const passkey = await passkeyService.verificaRegistrazione(
      req.utente.id, id, risposta, descriviDispositivo(req.headers['user-agent'])
    );
    res.status(201).json({ successo: true, messaggio: 'Passkey aggiunta', dati: passkey });
  } catch (errore) {
    next(errore);
  }
}

/** DELETE /api/v1/auth/passkey/:id */
export async function passkeyElimina(req, res, next) {
  try {
    await passkeyService.eliminaPasskey(req.utente.id, req.params.id);
    res.json({ successo: true, messaggio: 'Passkey eliminata' });
  } catch (errore) {
    next(errore);
  }
}
