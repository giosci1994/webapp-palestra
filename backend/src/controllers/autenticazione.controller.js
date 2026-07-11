// ============================================
// GymMaster — Controller Autenticazione
// Gestisce le richieste HTTP per auth
// ============================================

import * as authService from '../services/autenticazione.service.js';
import logger from '../utils/logger.js';

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
    const risultato = await authService.loginUtente(req.body);

    // Imposta il refresh token come cookie HttpOnly
    // Durata cookie coerente con durata refresh token (7gg o 30gg se "ricorda dispositivo")
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const maxAgeCookie = risultato.durataGiorni * 24 * 60 * 60 * 1000;
    res.cookie('refreshToken', risultato.refreshToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'strict',
      maxAge: maxAgeCookie,
      path: '/api/v1/auth'
    });

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

    // Aggiorna il cookie con il nuovo refresh token
    // Propaga durata originale (7gg o 30gg) dal ciclo di token
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const maxAgeCookie = (risultato.durataGiorni || 7) * 24 * 60 * 60 * 1000;
    res.cookie('refreshToken', risultato.refreshToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'strict',
      maxAge: maxAgeCookie,
      path: '/api/v1/auth'
    });

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
