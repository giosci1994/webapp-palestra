// ============================================
// GymMaster — Service Autenticazione
// Logica di business per login, registrazione, token
// ============================================
//
// I token opachi (refresh, verifica email, reset password) arrivano al client
// in chiaro e nel database restano solo come impronta (utils/token.js).
//
// Ogni login apre una famiglia di refresh token: i token nati da quel login,
// rotazione dopo rotazione. Per l'utente e' "un dispositivo collegato"; il suo
// identificativo viaggia anche nell'access token, cosi' chiudere una sessione
// ferma subito anche le richieste di quel dispositivo (middleware/autenticazione.js).

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { ErroreConflitto, ErroreNonAutenticato, ErroreNonTrovato, ErroreTroppeRichieste, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { emailConfigurata, inviaEmailVerifica, inviaEmailReset } from './email.service.js';
import { nuovoToken, improntaToken, tokenSuccessivo } from '../utils/token.js';
import { attesaPer, registraErrore, azzeraTentativi } from '../utils/tentativiAccesso.js';

// Configurazione Argon2id
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4
};

// Un refresh token rinnovato da meno di cosi' non ruota: si rilascia solo un
// access token nuovo. Serve a rinnovaToken: i browser Chromium salvano i
// cookie su disco ogni 30 secondi circa, e con rotazioni ad almeno 5 minuti
// l'una dall'altra il cookie salvato puo' restare indietro al massimo di una.
const ROTAZIONE_MINIMA_MS = 5 * 60 * 1000;

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
  const tokenVerifica = verificaAttiva ? nuovoToken() : null;
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
    where: { tokenVerificaEmail: improntaToken(token) },
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
  const token = nuovoToken();
  await prisma.utente.update({
    where: { id: utente.id },
    data: { tokenResetPassword: improntaToken(token), tokenResetScadenza: new Date(Date.now() + 60 * 60 * 1000) } // 1 ora
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
    where: { tokenResetPassword: improntaToken(token) },
    select: { id: true, email: true, tokenResetScadenza: true }
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
  // Invalida le sessioni esistenti per sicurezza, e i tentativi sbagliati di chi
  // non ricordava la password non lo tengono piu' fuori
  await prisma.refreshToken.deleteMany({ where: { utenteId: utente.id } }).catch(() => {});
  azzeraTentativi(utente.email);
  logger.info({ utenteId: utente.id }, 'Password reimpostata via email');
}

// I campi dell'utente che servono ad aprire una sessione
export const CAMPI_ACCESSO = {
  id: true,
  email: true,
  nome: true,
  ruolo: true,
  stato: true,
  palestraId: true,
  profiloCompletato: true,
  ruoloRichiesto: true,
  emailVerificata: true
};

/**
 * Effettua il login e restituisce access token + refresh token.
 * @param {{ dispositivo?: string|null }} [contesto] - da dove arriva il login
 */
export async function loginUtente({ email, password, ricordaDispositivo = false }, { dispositivo = null } = {}) {
  // Troppi errori di fila su questa email: si aspetta, anche con la password giusta
  controllaTentativi(email);

  // Cerca l'utente
  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { ...CAMPI_ACCESSO, passwordHash: true }
  });

  if (!utente) {
    // Conta anche le email inesistenti: contarle solo per gli iscritti lo rivelerebbe
    registraErrore(email);
    // Messaggio generico per sicurezza (non rivela se l'email esiste)
    throw new ErroreNonAutenticato('Credenziali non valide');
  }

  // Verifica la password
  const passwordValida = await argon2.verify(utente.passwordHash, password);

  if (!passwordValida) {
    registraErrore(email);
    throw new ErroreNonAutenticato('Credenziali non valide');
  }
  azzeraTentativi(email);

  const { passwordHash, ...datiUtente } = utente;
  const sessione = await apriSessione(datiUtente, { ricordaDispositivo, dispositivo });
  logger.info({ utenteId: utente.id, ricordaDispositivo, dispositivo }, 'Login effettuato');
  return sessione;
}

/** 429 se l'email e' bloccata per troppi errori (utils/tentativiAccesso.js) */
export function controllaTentativi(email) {
  const attesa = attesaPer(email);
  if (attesa > 0) {
    const minuti = Math.ceil(attesa / 60000);
    throw new ErroreTroppeRichieste(
      `Troppi tentativi sbagliati per questo account: riprova tra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}`
    );
  }
}

/**
 * Apre una sessione per un utente gia' riconosciuto (password o passkey):
 * controlla che possa entrare, poi crea la famiglia di refresh token e
 * l'access token.
 * @param {object} utente - con i campi di CAMPI_ACCESSO
 */
export async function apriSessione(utente, { ricordaDispositivo = false, dispositivo = null } = {}) {
  // Verifica lo stato dell'account
  if (utente.stato === 'BANNATO') {
    throw new ErroreNonAutenticato('Il tuo account è stato sospeso');
  }

  if (utente.stato === 'IN_ATTESA') {
    throw new ErroreNonAutenticato('Il tuo account è in attesa di approvazione da parte dell\'amministratore');
  }

  // Email non verificata (solo se la verifica è attiva): blocca l'accesso
  if (utente.emailVerificata === false) {
    throw new ErroreNonAutenticato('Verifica la tua email prima di accedere. Controlla la posta (anche lo spam).');
  }

  // Genera i token — durata estesa se "ricorda dispositivo" attivo
  const durataGiorni = ricordaDispositivo ? 30 : (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);
  const famiglia = crypto.randomUUID();
  const refreshToken = nuovoToken(40);
  await creaRefreshToken({ token: refreshToken, utenteId: utente.id, durataGiorni, famiglia, dispositivo, iniziataIl: new Date() });
  const accessToken = generaAccessToken(utente, famiglia);

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
 *
 * Il refresh token ruota a ogni rinnovo (salvo ROTAZIONE_MINIMA_MS): il
 * sostituto e' derivato dal token presentato (tokenSuccessivo). Un token gia'
 * sostituito puo' tornare per due ragioni:
 * - il dispositivo e' rimasto indietro di una rotazione: la risposta si e'
 *   persa, due schede hanno rinnovato insieme, oppure il browser e' stato
 *   chiuso prima di salvare su disco il cookie nuovo. Il sostituto non e' mai
 *   stato usato: gli si ridà, ricalcolandolo, anche giorni dopo;
 * - qualcun altro usa la stessa sessione: il sostituto e' gia' stato usato a
 *   sua volta, e un dispositivo non resta indietro di due rotazioni. Si
 *   chiudono tutte le sessioni dell'utente.
 */
export async function rinnovaToken(tokenRefresh) {
  // Cerca il refresh token nel database
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
    throw new ErroreNonAutenticato('Refresh token non valido');
  }

  const successivo = tokenSuccessivo(tokenRefresh);

  if (tokenSalvato.revocato) {
    // Indietro di una rotazione: il sostituto, mai usato, e' ancora attivo
    const sostituto = await prisma.refreshToken.findUnique({ where: { token: improntaToken(successivo) } });
    if (sostituto && !sostituto.revocato && sostituto.scadenza > new Date()) {
      if (tokenSalvato.utente.stato !== 'ATTIVO') throw new ErroreNonAutenticato('Account non attivo');
      return {
        accessToken: generaAccessToken(tokenSalvato.utente, tokenSalvato.famiglia),
        refreshToken: successivo,
        durataGiorni: sostituto.durataGiorni
      };
    }

    // Indietro di due: la sessione la usa anche qualcun altro, si revoca tutto
    await prisma.refreshToken.updateMany({
      where: { utenteId: tokenSalvato.utenteId },
      data: { revocato: true }
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

  // Propaga durata originale del token
  const durataGiorni = tokenSalvato.durataGiorni || (parseInt(process.env.JWT_SCADENZA_REFRESH) || 7);
  const { famiglia, dispositivo, iniziataIl } = tokenSalvato;

  // Rinnovato da poco: niente rotazione, il client tiene il suo token
  if (Date.now() - tokenSalvato.creato.getTime() < ROTAZIONE_MINIMA_MS) {
    return {
      accessToken: generaAccessToken(tokenSalvato.utente, famiglia),
      refreshToken: tokenRefresh,
      durataGiorni
    };
  }

  // Rotazione: il token presentato e' sostituito dal suo successivo
  await prisma.refreshToken.update({
    where: { id: tokenSalvato.id },
    data: { revocato: true }
  });

  try {
    await creaRefreshToken({ token: successivo, utenteId: tokenSalvato.utenteId, durataGiorni, famiglia, dispositivo, iniziataIl });
  } catch (errore) {
    // Due rinnovi simultanei con lo stesso token: l'altro ha gia' creato il
    // sostituto, che e' lo stesso
    if (errore.code !== 'P2002') throw errore;
  }

  return {
    accessToken: generaAccessToken(tokenSalvato.utente, famiglia),
    refreshToken: successivo,
    durataGiorni
  };
}

/**
 * Logout: chiude la sessione di questo dispositivo. La famiglia sparisce del
 * tutto, cosi' anche un eventuale token rubato da quella sessione smette di
 * funzionare.
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
 * Le sessioni aperte dell'utente, una per dispositivo, quella corrente per prima.
 * @param {string|null} famigliaCorrente - dall'access token della richiesta
 */
export async function elencaSessioni(utenteId, famigliaCorrente) {
  const attivi = await prisma.refreshToken.findMany({
    where: { utenteId, revocato: false, scadenza: { gt: new Date() } },
    orderBy: { creato: 'desc' },
    select: { famiglia: true, dispositivo: true, iniziataIl: true, creato: true, scadenza: true }
  });

  // Due rinnovi simultanei possono lasciare due token attivi nella stessa
  // famiglia: si tiene il piu' recente
  const viste = new Set();
  return attivi
    .filter(t => !viste.has(t.famiglia) && viste.add(t.famiglia))
    .map(t => ({
      famiglia: t.famiglia,
      dispositivo: t.dispositivo,
      iniziataIl: t.iniziataIl,
      ultimoUso: t.creato,
      scadenza: t.scadenza,
      corrente: t.famiglia === famigliaCorrente
    }))
    .sort((a, b) => b.corrente - a.corrente);
}

/** Chiude la sessione di un altro dispositivo dell'utente */
export async function chiudiSessione(utenteId, famiglia) {
  const { count } = await prisma.refreshToken.deleteMany({ where: { utenteId, famiglia: String(famiglia) } });
  if (count === 0) throw new ErroreNonTrovato('Sessione non trovata');
  logger.info({ utenteId }, 'Sessione chiusa da un altro dispositivo');
}

/**
 * Chiude tutte le sessioni dell'utente tranne quella corrente. Senza una
 * sessione corrente (un access token di prima delle famiglie) le chiude tutte.
 * @returns {Promise<number>} quante righe sono state rimosse
 */
export async function chiudiAltreSessioni(utenteId, famigliaCorrente) {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { utenteId, ...(famigliaCorrente && { famiglia: { not: famigliaCorrente } }) }
  });
  logger.info({ utenteId, righe: count }, 'Chiuse le sessioni degli altri dispositivi');
  return count;
}

// --- Funzioni Helper ---

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

/** Salva l'impronta di un refresh token e fa pulizia dei vecchi dell'utente */
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

  // Pulizia dei token dell'utente: quelli scaduti, e quelli sostituiti delle
  // sessioni ormai chiuse. Nelle sessioni aperte i token sostituiti restano
  // fino alla scadenza: servono a riconoscere chi e' rimasto indietro di una
  // rotazione e chi di due (rinnovaToken).
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
        { revocato: true, famiglia: { notIn: sessioniAperte.map(t => t.famiglia) } }
      ]
    }
  });
}
