// ============================================
// GymMaster — Service Autenticazione
// Logica di business per login, registrazione, token
// ============================================

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { ErroreConflitto, ErroreNonAutenticato, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { emailConfigurata, inviaEmailVerifica, inviaEmailReset } from './email.service.js';

// Configurazione Argon2id
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4
};

/**
 * Registra un nuovo utente nel sistema.
 * L'utente viene creato con stato ATTIVO (accesso immediato, nessun attrito).
 * Il ruolo Personal Trainer resta soggetto ad approvazione admin (ruoloRichiesto).
 */
export async function registraUtente({ email, password, nome, palestraId }) {
  // Verifica se l'email esiste già
  const utenteEsistente = await prisma.utente.findUnique({
    where: { email }
  });

  if (utenteEsistente) {
    throw new ErroreConflitto('Un account con questa email esiste già');
  }

  // Hash della password con Argon2id
  const passwordHash = await argon2.hash(password, ARGON2_CONFIG);

  // Verifica email: attiva solo se l'invio email (Resend) è configurato
  const verificaAttiva = emailConfigurata();
  const tokenVerifica = verificaAttiva ? crypto.randomBytes(32).toString('hex') : null;
  const scadenzaVerifica = verificaAttiva ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

  // Crea l'utente
  const nuovoUtente = await prisma.utente.create({
    data: {
      email,
      passwordHash,
      nome,
      palestraId: palestraId || null,
      ruolo: 'UTENTE',
      stato: 'ATTIVO',
      emailVerificata: !verificaAttiva, // se la verifica è attiva, parte da non-verificata
      tokenVerificaEmail: tokenVerifica,
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

  // Invia l'email di verifica (un fallimento non blocca la registrazione: si può reinviare)
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
 * Verifica un token email: marca l'email come verificata se il token è valido e non scaduto.
 */
export async function verificaEmailToken(token) {
  if (!token) throw new ErroreValidazione('Token mancante');
  const utente = await prisma.utente.findFirst({
    where: { tokenVerificaEmail: token },
    select: { id: true, emailVerificata: true, tokenVerificaScadenza: true }
  });
  if (!utente) throw new ErroreValidazione('Link di verifica non valido');
  if (utente.emailVerificata) return { giaVerificata: true };
  if (utente.tokenVerificaScadenza && utente.tokenVerificaScadenza < new Date()) {
    throw new ErroreValidazione('Link di verifica scaduto. Richiedine uno nuovo dalla pagina di accesso.');
  }
  await prisma.utente.update({
    where: { id: utente.id },
    data: { emailVerificata: true, tokenVerificaEmail: null, tokenVerificaScadenza: null }
  });
  logger.info({ utenteId: utente.id }, 'Email verificata');
  return { giaVerificata: false };
}

/**
 * Reinvia l'email di verifica. Risposta sempre generica (non rivela se l'email esiste).
 */
export async function reinviaVerifica(email) {
  if (!emailConfigurata() || !email) return;
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { id: true, email: true, nome: true, emailVerificata: true }
  });
  if (!utente || utente.emailVerificata) return; // niente da fare (non rivelare l'esistenza)
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.utente.update({
    where: { id: utente.id },
    data: { tokenVerificaEmail: token, tokenVerificaScadenza: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  });
  try {
    await inviaEmailVerifica(utente, token);
  } catch (errore) {
    logger.error({ utenteId: utente.id, err: errore.message }, 'Reinvio email di verifica fallito');
  }
}

/**
 * Richiede il reset della password: genera un token e invia l'email con il link.
 * Risposta sempre generica (non rivela se l'email esiste).
 */
export async function richiediResetPassword(email) {
  if (!emailConfigurata() || !email) return;
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { id: true, email: true, nome: true }
  });
  if (!utente) return; // non rivelare l'esistenza dell'account
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.utente.update({
    where: { id: utente.id },
    data: { tokenResetPassword: token, tokenResetScadenza: new Date(Date.now() + 60 * 60 * 1000) } // 1 ora
  });
  try {
    await inviaEmailReset(utente, token);
  } catch (errore) {
    logger.error({ utenteId: utente.id, err: errore.message }, 'Invio email di reset fallito');
  }
}

/**
 * Reimposta la password tramite token valido e non scaduto.
 */
export async function reimpostaPasswordConToken(token, nuovaPassword) {
  if (!token) throw new ErroreValidazione('Token mancante');
  if (!nuovaPassword || !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(nuovaPassword)) {
    throw new ErroreValidazione('La password deve avere almeno 8 caratteri, una maiuscola e un numero');
  }
  const utente = await prisma.utente.findFirst({
    where: { tokenResetPassword: token },
    select: { id: true, tokenResetScadenza: true }
  });
  if (!utente) throw new ErroreValidazione('Link di reset non valido');
  if (utente.tokenResetScadenza && utente.tokenResetScadenza < new Date()) {
    throw new ErroreValidazione('Link di reset scaduto. Richiedine uno nuovo.');
  }
  const passwordHash = await argon2.hash(nuovaPassword, ARGON2_CONFIG);
  await prisma.utente.update({
    where: { id: utente.id },
    data: { passwordHash, tokenResetPassword: null, tokenResetScadenza: null }
  });
  // Invalida le sessioni esistenti per sicurezza
  await prisma.refreshToken.deleteMany({ where: { utenteId: utente.id } }).catch(() => {});
  logger.info({ utenteId: utente.id }, 'Password reimpostata via email');
}

/**
 * Effettua il login e restituisce access token + refresh token.
 */
export async function loginUtente({ email, password, ricordaDispositivo = false }) {
  // Cerca l'utente
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      nome: true,
      ruolo: true,
      stato: true,
      passwordHash: true,
      palestraId: true,
      profiloCompletato: true,
      ruoloRichiesto: true,
      emailVerificata: true
    }
  });

  if (!utente) {
    // Messaggio generico per sicurezza (non rivela se l'email esiste)
    throw new ErroreNonAutenticato('Credenziali non valide');
  }

  // Verifica lo stato dell'account
  if (utente.stato === 'BANNATO') {
    throw new ErroreNonAutenticato('Il tuo account è stato sospeso');
  }

  if (utente.stato === 'IN_ATTESA') {
    throw new ErroreNonAutenticato('Il tuo account è in attesa di approvazione da parte dell\'amministratore');
  }

  // Verifica la password
  const passwordValida = await argon2.verify(utente.passwordHash, password);

  if (!passwordValida) {
    throw new ErroreNonAutenticato('Credenziali non valide');
  }

  // Email non verificata (solo se la verifica è attiva): blocca l'accesso
  if (utente.emailVerificata === false) {
    throw new ErroreNonAutenticato('Verifica la tua email prima di accedere. Controlla la posta (anche lo spam).');
  }

  // Genera i token — durata estesa se "ricorda dispositivo" attivo
  const durataGiorni = ricordaDispositivo ? 30 : (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);
  const accessToken = generaAccessToken(utente);
  const refreshToken = await generaRefreshToken(utente.id, durataGiorni);

  logger.info({ utenteId: utente.id, ricordaDispositivo }, 'Login effettuato');

  return {
    accessToken,
    refreshToken,
    durataGiorni, // Propagato al controller per impostare maxAge cookie
    utente: {
      id: utente.id,
      email: utente.email,
      nome: utente.nome,
      ruolo: utente.ruolo,
      palestraId: utente.palestraId,
      profiloCompletato: utente.profiloCompletato,
      ruoloRichiesto: utente.ruoloRichiesto
    }
  };
}

/**
 * Rinnova l'access token usando un refresh token valido.
 */
export async function rinnovaToken(tokenRefresh) {
  // Cerca il refresh token nel database
  const tokenSalvato = await prisma.refreshToken.findUnique({
    where: { token: tokenRefresh },
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
    throw new ErroreNonAutenticato('Refresh token non valido');
  }

  if (tokenSalvato.revocato) {
    // Grace period: se token revocato ma ancora nel grace period, accettare
    const ora = new Date();
    if (tokenSalvato.revocoEffettivoDopo && tokenSalvato.revocoEffettivoDopo > ora) {
      // Token nel grace period — cercare il token sostitutivo più recente
      const tokenSostitutivo = await prisma.refreshToken.findFirst({
        where: {
          utenteId: tokenSalvato.utenteId,
          revocato: false,
          scadenza: { gt: ora },
          creato: { gt: tokenSalvato.creato }
        },
        orderBy: { creato: 'desc' }
      });

      if (tokenSostitutivo) {
        // Restituire nuovo access token + il token sostitutivo esistente
        const nuovoAccessToken = generaAccessToken(tokenSalvato.utente);
        return {
          accessToken: nuovoAccessToken,
          refreshToken: tokenSostitutivo.token,
          durataGiorni: tokenSostitutivo.durataGiorni
        };
      }
    }

    // Fuori grace period: possibile furto, revoca tutti
    await prisma.refreshToken.updateMany({
      where: { utenteId: tokenSalvato.utenteId },
      data: { revocato: true, revocoEffettivoDopo: null }
    });
    logger.warn({ utenteId: tokenSalvato.utenteId }, 'Tentativo di riutilizzo refresh token revocato — tutti i token revocati');
    throw new ErroreNonAutenticato('Token di sicurezza compromesso, effettua nuovamente il login');
  }

  if (tokenSalvato.scadenza < new Date()) {
    throw new ErroreNonAutenticato('Refresh token scaduto');
  }

  if (tokenSalvato.utente.stato !== 'ATTIVO') {
    throw new ErroreNonAutenticato('Account non attivo');
  }

  // Rotazione con grace period: vecchio token marcato revocato
  // ma ancora accettato per 40 secondi (rete instabile mobile)
  const gracePeriod = new Date(Date.now() + 40 * 1000); // 40 secondi
  await prisma.refreshToken.update({
    where: { id: tokenSalvato.id },
    data: { revocato: true, revocoEffettivoDopo: gracePeriod }
  });

  // Propaga durata originale del token
  const durataGiorni = tokenSalvato.durataGiorni || (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);

  const nuovoAccessToken = generaAccessToken(tokenSalvato.utente);
  const nuovoRefreshToken = await generaRefreshToken(tokenSalvato.utenteId, durataGiorni);

  return {
    accessToken: nuovoAccessToken,
    refreshToken: nuovoRefreshToken,
    durataGiorni
  };
}

/**
 * Revoca un refresh token (logout).
 */
export async function logoutUtente(tokenRefresh) {
  if (!tokenRefresh) return;

  await prisma.refreshToken.updateMany({
    where: { token: tokenRefresh, revocato: false },
    data: { revocato: true }
  });
}

// --- Funzioni Helper ---

function generaAccessToken(utente) {
  return jwt.sign(
    {
      utenteId: utente.id,
      email: utente.email,
      ruolo: utente.ruolo
    },
    process.env.JWT_SEGRETO_ACCESS,
    { expiresIn: process.env.JWT_SCADENZA_ACCESS || '15m' }
  );
}

async function generaRefreshToken(utenteId, durataGiorni = null) {
  const token = crypto.randomBytes(40).toString('hex');

  // Calcola scadenza — usa durata custom o default da env
  const giorniEffettivi = durataGiorni || parseInt(process.env.JWT_SCADENZA_REFRESH) || 7;
  const scadenza = new Date();
  scadenza.setDate(scadenza.getDate() + giorniEffettivi);

  await prisma.refreshToken.create({
    data: {
      token,
      utenteId,
      scadenza,
      durataGiorni: giorniEffettivi
    }
  });

  // Pulizia: elimina i refresh token scaduti o revocati (grace period scaduto) dell'utente
  await prisma.refreshToken.deleteMany({
    where: {
      utenteId,
      OR: [
        { scadenza: { lt: new Date() } },
        {
          revocato: true,
          revocoEffettivoDopo: { lt: new Date() }, // Grace period scaduto
          creato: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        {
          revocato: true,
          revocoEffettivoDopo: null, // Token revocati senza grace period (vecchi)
          creato: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      ]
    }
  });

  return token;
}
