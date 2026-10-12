// ============================================
// GymMaster — Authentication controller
// Handles the HTTP requests for auth
// ============================================

import * as authService from '../services/autenticazione.service.js';
import * as passkeyService from '../services/passkey.service.js';
import logger from '../utils/logger.js';
import { descriviDispositivo } from '../utils/dispositivo.js';
import { t } from '../i18n/index.js';

/**
 * The refresh token travels in an HttpOnly cookie limited to the /auth routes:
 * JavaScript cannot read it, and the other routes do not receive it.
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
 * Registers a new user (active; email verification if Resend is configured).
 */
export async function registrazione(req, res, next) {
  try {
    const utente = await authService.registraUtente(req.body);

    res.status(201).json({
      successo: true,
      messaggio: utente.richiedeVerificaEmail
        ? t('autenticazioneController.registrazioneVerificaEmail')
        : t('autenticazioneController.registrazioneCompletata'),
      dati: utente
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * GET /api/v1/auth/verifica-email?token=...
 * Confirms the email address with the token received by email.
 */
export async function verificaEmail(req, res, next) {
  try {
    const esito = await authService.verificaEmailToken(req.query?.token);
    res.json({
      successo: true,
      messaggio: esito.giaVerificata ? t('autenticazioneController.emailGiaVerificata') : t('autenticazioneController.emailVerificata'),
      dati: esito
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/reinvia-verifica { email }
 * Resends the verification email (generic answer, so as not to reveal whether the account exists).
 */
export async function reinviaVerifica(req, res, next) {
  try {
    await authService.reinviaVerifica(req.body?.email);
    res.json({
      successo: true,
      messaggio: t('autenticazioneController.verificaReinviata')
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/richiedi-reset { email }
 * Sends (if the email exists) the link to reset the password.
 */
export async function richiediReset(req, res, next) {
  try {
    await authService.richiediResetPassword(req.body?.email);
    res.json({
      successo: true,
      messaggio: t('autenticazioneController.resetRichiesto')
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/reimposta-password { token, password }
 * Sets a new password with the token received by email.
 */
export async function reimpostaPassword(req, res, next) {
  try {
    await authService.reimpostaPasswordConToken(req.body?.token, req.body?.password);
    res.json({ successo: true, messaggio: t('autenticazioneController.passwordReimpostata') });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/login
 * Logs in and returns the tokens.
 */
export async function login(req, res, next) {
  try {
    const risultato = await authService.loginUtente(req.body, {
      dispositivo: descriviDispositivo(req.headers['user-agent'])
    });

    // Same cookie lifetime as the refresh token (7 days, 30 with "remember device")
    impostaCookieRefresh(req, res, risultato.refreshToken, risultato.durataGiorni);

    res.json({
      successo: true,
      messaggio: t('autenticazioneController.loginEffettuato'),
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
 * Renews the access token using the refresh token from the cookie.
 */
export async function refresh(req, res, next) {
  try {
    const tokenRefresh = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!tokenRefresh) {
      return res.status(401).json({
        successo: false,
        messaggio: t('autenticazioneController.refreshTokenMancante')
      });
    }

    const risultato = await authService.rinnovaToken(tokenRefresh);

    // Update the cookie with the new refresh token, keeping the original lifetime
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
 * Revokes the refresh token and clears the cookie.
 */
export async function logout(req, res, next) {
  try {
    const tokenRefresh = req.cookies?.refreshToken || req.body?.refreshToken;

    await authService.logoutUtente(tokenRefresh);

    // Clear the cookie
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'strict',
      path: '/api/v1/auth'
    });

    res.json({
      successo: true,
      messaggio: t('autenticazioneController.logoutEffettuato')
    });
  } catch (errore) {
    next(errore);
  }
}

/**
 * GET /api/v1/auth/sessioni
 * The devices linked to the account, the one making the request first.
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
 * Signs out another device: it stops working right away.
 */
export async function chiudiSessione(req, res, next) {
  try {
    await authService.chiudiSessione(req.utente.id, req.params.famiglia);
    res.json({ successo: true, messaggio: t('autenticazioneController.dispositivoScollegato') });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/sessioni/chiudi-altre
 * Signs out all devices except this one.
 */
export async function chiudiAltreSessioni(req, res, next) {
  try {
    await authService.chiudiAltreSessioni(req.utente.id, req.utente.famiglia);
    res.json({ successo: true, messaggio: t('autenticazioneController.altriDispositiviScollegati') });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/passkey/accesso/opzioni
 * The challenge for a passkey to sign, to log in without a password.
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
 * The passkey's signature: if it is valid, same as a login with a password.
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
      messaggio: t('autenticazioneController.loginEffettuato'),
      dati: { accessToken: risultato.accessToken, utente: risultato.utente }
    });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/auth/passkey — The user's passkeys */
export async function passkeyElenco(req, res, next) {
  try {
    res.json({ successo: true, dati: await passkeyService.elencaPasskey(req.utente.id) });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/auth/passkey/registrazione/opzioni { password }
 * Adding a passkey requires the password, the session alone is not enough.
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
    res.status(201).json({ successo: true, messaggio: t('autenticazioneController.passkeyAggiunta'), dati: passkey });
  } catch (errore) {
    next(errore);
  }
}

/** DELETE /api/v1/auth/passkey/:id */
export async function passkeyElimina(req, res, next) {
  try {
    await passkeyService.eliminaPasskey(req.utente.id, req.params.id);
    res.json({ successo: true, messaggio: t('autenticazioneController.passkeyEliminata') });
  } catch (errore) {
    next(errore);
  }
}
