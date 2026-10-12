// ============================================
// GymMaster — Authentication service
// Business logic for login, sign-up and tokens
// ============================================
//
// Opaque tokens (refresh, email verification, password reset) reach the client
// in plain text, while the database keeps only their fingerprint (utils/token.js).
//
// Every login opens a family of refresh tokens: the tokens born from that
// login, rotation after rotation. For the user it is "a connected device"; its
// id also travels in the access token, so closing a session immediately stops
// that device's requests too (middleware/autenticazione.js).

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { ErroreConflitto, ErroreNonAutenticato, ErroreNonTrovato, ErroreTroppeRichieste, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { emailConfigurata, inviaEmailVerifica, inviaEmailReset } from './email.service.js';
import { nuovoToken, improntaToken, tokenSuccessivo } from '../utils/token.js';
import { attesaPer, registraErrore, azzeraTentativi } from '../utils/tentativiAccesso.js';

// Argon2id configuration
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4
};

// A refresh token renewed less than this long ago does not rotate: only a new
// access token is issued. Used by rinnovaToken: Chromium browsers save cookies
// to disk about every 30 seconds, and with rotations at least 5 minutes apart
// the saved cookie can fall behind by one rotation at most.
const ROTAZIONE_MINIMA_MS = 5 * 60 * 1000;

/**
 * Registers a new user in the system.
 * The user is created with status ATTIVO (immediate access, no friction).
 * The personal trainer role still needs admin approval (ruoloRichiesto).
 */
export async function registraUtente({ email, password, nome, palestraId }) {
  // Check whether the email already exists
  const utenteEsistente = await prisma.utente.findUnique({
    where: { email }
  });

  if (utenteEsistente) {
    throw new ErroreConflitto(t('autenticazioneService.emailGiaRegistrata'));
  }

  // Hash the password with Argon2id
  const passwordHash = await argon2.hash(password, ARGON2_CONFIG);

  // Email verification: on only if email sending (Resend) is configured
  const verificaAttiva = emailConfigurata();
  const tokenVerifica = verificaAttiva ? nuovoToken() : null;
  const scadenzaVerifica = verificaAttiva ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

  // Create the user
  const nuovoUtente = await prisma.utente.create({
    data: {
      email,
      passwordHash,
      nome,
      palestraId: palestraId || null,
      ruolo: 'UTENTE',
      stato: 'ATTIVO',
      emailVerificata: !verificaAttiva, // if verification is on, it starts as not verified
      tokenVerificaEmail: tokenVerifica && improntaToken(tokenVerifica),
      tokenVerificaScadenza: scadenzaVerifica
    },
    select: {
      id: true,
      email: true,
      nome: true,
      ruolo: true,
      stato: true,
      emailVerificata: true,
      dataRegistrazione: true
    }
  });

  // Send the verification email (a failure does not block sign-up: it can be resent)
  if (verificaAttiva) {
    try {
      await inviaEmailVerifica(nuovoUtente, tokenVerifica);
    } catch (errore) {
      logger.error({ utenteId: nuovoUtente.id, err: errore.message }, 'Invio email di verifica fallito');
    }
  }

  logger.info({ utenteId: nuovoUtente.id, email, verificaAttiva }, 'Nuovo utente registrato');

  return { ...nuovoUtente, richiedeVerificaEmail: verificaAttiva };
}

/**
 * Checks an email token: marks the email as verified if the token is valid and not expired.
 */
export async function verificaEmailToken(token) {
  if (!token) throw new ErroreValidazione(t('autenticazioneService.tokenMancante'));
  const utente = await prisma.utente.findFirst({
    where: { tokenVerificaEmail: improntaToken(token) },
    select: { id: true, emailVerificata: true, tokenVerificaScadenza: true }
  });
  if (!utente) throw new ErroreValidazione(t('autenticazioneService.linkVerificaNonValido'));
  if (utente.emailVerificata) return { giaVerificata: true };
  if (utente.tokenVerificaScadenza && utente.tokenVerificaScadenza < new Date()) {
    throw new ErroreValidazione(t('autenticazioneService.linkVerificaScaduto'));
  }
  await prisma.utente.update({
    where: { id: utente.id },
    data: { emailVerificata: true, tokenVerificaEmail: null, tokenVerificaScadenza: null }
  });
  logger.info({ utenteId: utente.id }, 'Email verificata');
  return { giaVerificata: false };
}

/**
 * Resends the verification email. The answer is always generic (it does not reveal whether the email exists).
 */
export async function reinviaVerifica(email) {
  if (!emailConfigurata() || !email) return;
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { id: true, email: true, nome: true, emailVerificata: true }
  });
  if (!utente || utente.emailVerificata) return; // nothing to do (do not reveal that it exists)
  const token = nuovoToken();
  await prisma.utente.update({
    where: { id: utente.id },
    data: { tokenVerificaEmail: improntaToken(token), tokenVerificaScadenza: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  });
  try {
    await inviaEmailVerifica(utente, token);
  } catch (errore) {
    logger.error({ utenteId: utente.id, err: errore.message }, 'Reinvio email di verifica fallito');
  }
}

/**
 * Requests a password reset: generates a token and sends the email with the link.
 * The answer is always generic (it does not reveal whether the email exists).
 */
export async function richiediResetPassword(email) {
  if (!emailConfigurata() || !email) return;
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { id: true, email: true, nome: true }
  });
  if (!utente) return; // do not reveal that the account exists
  const token = nuovoToken();
  await prisma.utente.update({
    where: { id: utente.id },
    data: { tokenResetPassword: improntaToken(token), tokenResetScadenza: new Date(Date.now() + 60 * 60 * 1000) } // 1 hour
  });
  try {
    await inviaEmailReset(utente, token);
  } catch (errore) {
    logger.error({ utenteId: utente.id, err: errore.message }, 'Invio email di reset fallito');
  }
}

/**
 * Resets the password with a valid, unexpired token.
 */
export async function reimpostaPasswordConToken(token, nuovaPassword) {
  if (!token) throw new ErroreValidazione(t('autenticazioneService.tokenMancante'));
  if (!nuovaPassword || !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(nuovaPassword)) {
    throw new ErroreValidazione(t('autenticazioneService.passwordDebole'));
  }
  const utente = await prisma.utente.findFirst({
    where: { tokenResetPassword: improntaToken(token) },
    select: { id: true, email: true, tokenResetScadenza: true }
  });
  if (!utente) throw new ErroreValidazione(t('autenticazioneService.linkResetNonValido'));
  if (utente.tokenResetScadenza && utente.tokenResetScadenza < new Date()) {
    throw new ErroreValidazione(t('autenticazioneService.linkResetScaduto'));
  }
  const passwordHash = await argon2.hash(nuovaPassword, ARGON2_CONFIG);
  await prisma.utente.update({
    where: { id: utente.id },
    data: { passwordHash, tokenResetPassword: null, tokenResetScadenza: null }
  });
  // Invalidate the existing sessions for safety, and the failed attempts of
  // someone who forgot the password no longer keep them locked out
  await prisma.refreshToken.deleteMany({ where: { utenteId: utente.id } }).catch(() => {});
  azzeraTentativi(utente.email);
  logger.info({ utenteId: utente.id }, 'Password reimpostata via email');
}

// The user fields needed to open a session
export const CAMPI_ACCESSO = {
  id: true,
  email: true,
  nome: true,
  ruolo: true,
  stato: true,
  palestraId: true,
  profiloCompletato: true,
  ruoloRichiesto: true,
  emailVerificata: true,
  lingua: true
};

/**
 * Logs in and returns access token + refresh token.
 * @param {{ dispositivo?: string|null }} [contesto] - where the login comes from
 */
export async function loginUtente({ email, password, ricordaDispositivo = false }, { dispositivo = null } = {}) {
  // Too many failures in a row on this email: wait, even with the right password
  controllaTentativi(email);

  // Find the user
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { ...CAMPI_ACCESSO, passwordHash: true }
  });

  if (!utente) {
    // Count unknown emails too: counting only members' emails would reveal them
    registraErrore(email);
    // Generic message for safety (does not reveal whether the email exists)
    throw new ErroreNonAutenticato(t('autenticazioneService.credenzialiNonValide'));
  }

  // Check the password
  const passwordValida = await argon2.verify(utente.passwordHash, password);

  if (!passwordValida) {
    registraErrore(email);
    throw new ErroreNonAutenticato(t('autenticazioneService.credenzialiNonValide'));
  }
  azzeraTentativi(email);

  const { passwordHash, ...datiUtente } = utente;
  const sessione = await apriSessione(datiUtente, { ricordaDispositivo, dispositivo });
  logger.info({ utenteId: utente.id, ricordaDispositivo, dispositivo }, 'Login effettuato');
  return sessione;
}

/** 429 if the email is locked after too many failures (utils/tentativiAccesso.js) */
export function controllaTentativi(email) {
  const attesa = attesaPer(email);
  if (attesa > 0) {
    const minuti = Math.ceil(attesa / 60000);
    throw new ErroreTroppeRichieste(t('autenticazioneService.troppiTentativi', { count: minuti }));
  }
}

/**
 * Opens a session for a user already recognized (password or passkey):
 * checks that they may sign in, then creates the refresh token family and
 * the access token.
 * @param {object} utente - with the fields of CAMPI_ACCESSO
 */
export async function apriSessione(utente, { ricordaDispositivo = false, dispositivo = null } = {}) {
  // Check the account status
  if (utente.stato === 'BANNATO') {
    throw new ErroreNonAutenticato(t('autenticazioneService.accountSospeso'));
  }

  if (utente.stato === 'IN_ATTESA') {
    throw new ErroreNonAutenticato(t('autenticazioneService.accountInAttesa'));
  }

  // Email not verified (only if verification is on): block access
  if (utente.emailVerificata === false) {
    throw new ErroreNonAutenticato(t('autenticazioneService.emailNonVerificata'), 'EMAIL_NON_VERIFICATA');
  }

  // Generate the tokens — longer lifetime if "remember device" is on
  const durataGiorni = ricordaDispositivo ? 30 : (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);
  const famiglia = crypto.randomUUID();
  const refreshToken = nuovoToken(40);
  await creaRefreshToken({ token: refreshToken, utenteId: utente.id, durataGiorni, famiglia, dispositivo, iniziataIl: new Date() });
  const accessToken = generaAccessToken(utente, famiglia);

  return {
    accessToken,
    refreshToken,
    durataGiorni, // Passed on to the controller to set the cookie maxAge
    utente: {
      id: utente.id,
      email: utente.email,
      nome: utente.nome,
      ruolo: utente.ruolo,
      palestraId: utente.palestraId,
      profiloCompletato: utente.profiloCompletato,
      ruoloRichiesto: utente.ruoloRichiesto,
      lingua: utente.lingua ?? null
    }
  };
}

/**
 * Renews the access token using a valid refresh token.
 *
 * The refresh token rotates at every renewal (except within
 * ROTAZIONE_MINIMA_MS): the replacement is derived from the presented token
 * (tokenSuccessivo). A token that was already replaced can come back for two
 * reasons:
 * - the device fell behind by one rotation: the response got lost, two tabs
 *   renewed at the same time, or the browser was closed before saving the
 *   new cookie to disk. The replacement was never used: it is given back,
 *   recomputed, even days later;
 * - someone else is using the same session: the replacement was already used
 *   in turn, and a device does not fall behind by two rotations. All the
 *   user's sessions are closed.
 */
export async function rinnovaToken(tokenRefresh) {
  // Find the refresh token in the database
  const tokenSalvato = await prisma.refreshToken.findUnique({
    where: { token: improntaToken(tokenRefresh) },
    include: {
      utente: {
        select: {
          id: true,
          email: true,
          nome: true,
          ruolo: true,
          stato: true,
          palestraId: true
        }
      }
    }
  });

  if (!tokenSalvato) {
    throw new ErroreNonAutenticato(t('autenticazioneService.refreshTokenNonValido'));
  }

  const successivo = tokenSuccessivo(tokenRefresh);

  if (tokenSalvato.revocato) {
    // One rotation behind: the replacement, never used, is still active
    const sostituto = await prisma.refreshToken.findUnique({ where: { token: improntaToken(successivo) } });
    if (sostituto && !sostituto.revocato && sostituto.scadenza > new Date()) {
      if (tokenSalvato.utente.stato !== 'ATTIVO') throw new ErroreNonAutenticato(t('autenticazioneService.accountNonAttivo'));
      return {
        accessToken: generaAccessToken(tokenSalvato.utente, tokenSalvato.famiglia),
        refreshToken: successivo,
        durataGiorni: sostituto.durataGiorni
      };
    }

    // Two behind: someone else is using the session too, revoke everything
    await prisma.refreshToken.updateMany({
      where: { utenteId: tokenSalvato.utenteId },
      data: { revocato: true }
    });
    logger.warn({ utenteId: tokenSalvato.utenteId }, 'Tentativo di riutilizzo refresh token revocato — tutti i token revocati');
    throw new ErroreNonAutenticato(t('autenticazioneService.sessioneCompromessa'));
  }

  if (tokenSalvato.scadenza < new Date()) {
    throw new ErroreNonAutenticato(t('autenticazioneService.refreshTokenScaduto'));
  }

  if (tokenSalvato.utente.stato !== 'ATTIVO') {
    throw new ErroreNonAutenticato(t('autenticazioneService.accountNonAttivo'));
  }

  // Carry over the token's original lifetime
  const durataGiorni = tokenSalvato.durataGiorni || (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);
  const { famiglia, dispositivo, iniziataIl } = tokenSalvato;

  // Renewed recently: no rotation, the client keeps its token
  if (Date.now() - tokenSalvato.creato.getTime() < ROTAZIONE_MINIMA_MS) {
    return {
      accessToken: generaAccessToken(tokenSalvato.utente, famiglia),
      refreshToken: tokenRefresh,
      durataGiorni
    };
  }

  // Rotation: the presented token is replaced by its successor
  await prisma.refreshToken.update({
    where: { id: tokenSalvato.id },
    data: { revocato: true }
  });

  try {
    await creaRefreshToken({ token: successivo, utenteId: tokenSalvato.utenteId, durataGiorni, famiglia, dispositivo, iniziataIl });
  } catch (errore) {
    // Two simultaneous renewals with the same token: the other one already
    // created the replacement, which is the same
    if (errore.code !== 'P2002') throw errore;
  }

  return {
    accessToken: generaAccessToken(tokenSalvato.utente, famiglia),
    refreshToken: successivo,
    durataGiorni
  };
}

/**
 * Logout: closes this device's session. The family disappears entirely, so
 * any token stolen from that session also stops working.
 */
export async function logoutUtente(tokenRefresh) {
  if (!tokenRefresh) return;

  const tokenSalvato = await prisma.refreshToken.findUnique({
    where: { token: improntaToken(tokenRefresh) },
    select: { utenteId: true, famiglia: true }
  });
  if (!tokenSalvato) return;

  await prisma.refreshToken.deleteMany({
    where: { utenteId: tokenSalvato.utenteId, famiglia: tokenSalvato.famiglia }
  });
}

/**
 * The user's open sessions, one per device, with the current one first.
 * @param {string|null} famigliaCorrente - from the request's access token
 */
export async function elencaSessioni(utenteId, famigliaCorrente) {
  const attivi = await prisma.refreshToken.findMany({
    where: { utenteId, revocato: false, scadenza: { gt: new Date() } },
    orderBy: { creato: 'desc' },
    select: { famiglia: true, dispositivo: true, iniziataIl: true, creato: true, scadenza: true }
  });

  // Two simultaneous renewals can leave two active tokens in the same
  // family: keep the most recent one
  const viste = new Set();
  return attivi
    .filter(r => !viste.has(r.famiglia) && viste.add(r.famiglia))
    .map(r => ({
      famiglia: r.famiglia,
      dispositivo: r.dispositivo,
      iniziataIl: r.iniziataIl,
      ultimoUso: r.creato,
      scadenza: r.scadenza,
      corrente: r.famiglia === famigliaCorrente
    }))
    .sort((a, b) => b.corrente - a.corrente);
}

/** Closes the session of another of the user's devices */
export async function chiudiSessione(utenteId, famiglia) {
  const { count } = await prisma.refreshToken.deleteMany({ where: { utenteId, famiglia: String(famiglia) } });
  if (count === 0) throw new ErroreNonTrovato(t('autenticazioneService.sessioneNonTrovata'));
  logger.info({ utenteId }, 'Sessione chiusa da un altro dispositivo');
}

/**
 * Closes all of the user's sessions except the current one. Without a
 * current session (an access token from before families) it closes them all.
 * @returns {Promise<number>} how many rows were removed
 */
export async function chiudiAltreSessioni(utenteId, famigliaCorrente) {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { utenteId, ...(famigliaCorrente && { famiglia: { not: famigliaCorrente } }) }
  });
  logger.info({ utenteId, righe: count }, 'Chiuse le sessioni degli altri dispositivi');
  return count;
}

// --- Helper functions ---

function generaAccessToken(utente, famiglia) {
  return jwt.sign(
    {
      utenteId: utente.id,
      email: utente.email,
      ruolo: utente.ruolo,
      famiglia
    },
    process.env.JWT_SEGRETO_ACCESS,
    { expiresIn: process.env.JWT_SCADENZA_ACCESS || '15m' }
  );
}

/** Saves a refresh token's fingerprint and cleans up the user's old ones */
async function creaRefreshToken({ token, utenteId, durataGiorni, famiglia, dispositivo, iniziataIl }) {
  const scadenza = new Date();
  scadenza.setDate(scadenza.getDate() + durataGiorni);

  await prisma.refreshToken.create({
    data: {
      token: improntaToken(token),
      utenteId,
      scadenza,
      durataGiorni,
      famiglia,
      dispositivo,
      iniziataIl
    }
  });

  // Clean up the user's tokens: the expired ones, and the replaced ones of
  // sessions already closed. In open sessions the replaced tokens stay until
  // they expire: they tell apart who fell behind by one rotation and who by
  // two (rinnovaToken).
  const sessioniAperte = await prisma.refreshToken.findMany({
    where: { utenteId, revocato: false },
    distinct: ['famiglia'],
    select: { famiglia: true }
  });
  await prisma.refreshToken.deleteMany({
    where: {
      utenteId,
      OR: [
        { scadenza: { lt: new Date() } },
        { revocato: true, famiglia: { notIn: sessioniAperte.map(r => r.famiglia) } }
      ]
    }
  });
}
