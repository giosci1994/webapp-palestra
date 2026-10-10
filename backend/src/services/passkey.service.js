// ============================================
// GymMaster — Passkey (WebAuthn)
// ============================================
//
// Entrare con l'impronta, il volto o il PIN del dispositivo invece della
// password. Il dispositivo (o il gestore di password che sincronizza la
// passkey) custodisce la chiave privata e firma una sfida; qui si conserva solo
// la chiave pubblica che verifica la firma.
//
// Le passkey si aggiungono dal profilo confermando la password: chi ruba una
// sessione non deve poter aggiungere la propria e restare dentro anche dopo un
// cambio password. La password resta: la passkey e' un modo in piu' di entrare.
//
// Una passkey vale solo sul dominio per cui e' nata (RP ID): lo si ricava da
// APP_URL, come i link nelle email.

import crypto from 'crypto';
import argon2 from 'argon2';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import prisma from '../config/database.js';
import { ErroreConflitto, ErroreNonAutenticato, ErroreNonAutorizzato, ErroreNonTrovato, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { registraErrore, azzeraTentativi } from '../utils/tentativiAccesso.js';
import { CAMPI_ACCESSO, apriSessione, controllaTentativi } from './autenticazione.service.js';

const NOME_SERVIZIO = 'GymMaster';
// Tempo per completare il gesto sul dispositivo
const DURATA_SFIDA_MS = 5 * 60 * 1000;
const MAX_SFIDE = 10000;

// Cosa si mostra di una passkey nel profilo
const CAMPI_ELENCO = { id: true, nome: true, sincronizzata: true, creataIl: true, ultimoUso: true };

/** Origine e RP ID, dalle stesse variabili dei link nelle email */
export function configurazionePasskey() {
  const url = new URL(process.env.APP_URL || `https://gymmaster.${process.env.DOMINIO || 'casadm.uk'}`);
  return { origine: url.origin, rpID: url.hostname };
}

// Sfide in attesa della firma: id -> { tipo, sfida, utenteId, scade }. In
// memoria: durano pochi minuti, e un riavvio costa solo un nuovo tentativo.
const sfide = new Map();

function conservaSfida(dati) {
  const adesso = Date.now();
  for (const [id, sfida] of sfide) {
    if (sfida.scade < adesso) sfide.delete(id);
  }
  if (sfide.size >= MAX_SFIDE) sfide.delete(sfide.keys().next().value);
  const id = crypto.randomBytes(16).toString('hex');
  sfide.set(id, { ...dati, scade: adesso + DURATA_SFIDA_MS });
  return id;
}

/** Ogni sfida si usa una volta sola: riusare una firma non serve a niente */
function prendiSfida(id, tipo) {
  const chiave = String(id || '');
  const sfida = sfide.get(chiave);
  sfide.delete(chiave);
  if (!sfida || sfida.tipo !== tipo || sfida.scade < Date.now()) {
    throw new ErroreValidazione('Richiesta scaduta: riprova');
  }
  return sfida;
}

/** Come l'autenticatore riconosce l'utente: opaco, senza email ne' nome */
function handleUtente(utenteId) {
  return crypto.createHash('sha256').update(`gymmaster-passkey:${utenteId}`).digest();
}

function leggiTrasporti(testo) {
  try { return JSON.parse(testo) ?? undefined; } catch { return undefined; }
}

/** Le passkey dell'utente, per il profilo */
export function elencaPasskey(utenteId) {
  return prisma.passkey.findMany({ where: { utenteId }, orderBy: { creataIl: 'asc' }, select: CAMPI_ELENCO });
}

/**
 * Prima meta' dell'aggiunta: dopo la password, la sfida da far firmare al
 * dispositivo. Le passkey gia' registrate sono escluse, per non duplicarle.
 */
export async function opzioniRegistrazione(utenteId, password) {
  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { id: true, email: true, nome: true, passwordHash: true, passkey: { select: { credenziale: true, trasporti: true } } }
  });
  if (!utente) throw new ErroreNonTrovato('Utente non trovato');

  // Una password sbagliata qui conta come un accesso sbagliato
  controllaTentativi(utente.email);
  if (typeof password !== 'string' || !password || !await argon2.verify(utente.passwordHash, password)) {
    registraErrore(utente.email);
    throw new ErroreNonAutorizzato('Password non corretta');
  }
  azzeraTentativi(utente.email);

  const { rpID } = configurazionePasskey();
  const opzioni = await generateRegistrationOptions({
    rpName: NOME_SERVIZIO,
    rpID,
    userName: utente.email,
    userDisplayName: utente.nome,
    userID: handleUtente(utente.id),
    attestationType: 'none',
    excludeCredentials: utente.passkey.map(p => ({ id: p.credenziale, transports: leggiTrasporti(p.trasporti) })),
    // Passkey "rilevabili": all'accesso non serve scrivere l'email
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
  });

  return { id: conservaSfida({ tipo: 'registrazione', sfida: opzioni.challenge, utenteId }), opzioni };
}

/** Seconda meta': la risposta del dispositivo diventa una passkey dell'utente */
export async function verificaRegistrazione(utenteId, idSfida, risposta, nome = null) {
  const sfida = prendiSfida(idSfida, 'registrazione');
  if (sfida.utenteId !== utenteId) throw new ErroreValidazione('Richiesta scaduta: riprova');

  const { origine, rpID } = configurazionePasskey();
  let verifica;
  try {
    verifica = await verifyRegistrationResponse({
      response: risposta,
      expectedChallenge: sfida.sfida,
      expectedOrigin: origine,
      expectedRPID: rpID,
      requireUserVerification: false
    });
  } catch (errore) {
    logger.warn({ utenteId, errore: errore.message }, 'Passkey rifiutata alla registrazione');
    throw new ErroreValidazione('Passkey non valida: riprova');
  }
  if (!verifica.verified) throw new ErroreValidazione('Passkey non valida: riprova');

  const { credential, credentialBackedUp } = verifica.registrationInfo;
  try {
    const passkey = await prisma.passkey.create({
      data: {
        utenteId,
        credenziale: credential.id,
        chiavePubblica: isoBase64URL.fromBuffer(credential.publicKey),
        contatore: credential.counter,
        trasporti: JSON.stringify(credential.transports ?? []),
        sincronizzata: credentialBackedUp,
        nome
      },
      select: CAMPI_ELENCO
    });
    logger.info({ utenteId, passkeyId: passkey.id }, 'Passkey aggiunta');
    return passkey;
  } catch (errore) {
    if (errore.code === 'P2002') throw new ErroreConflitto('Questa passkey è già registrata');
    throw errore;
  }
}

export async function eliminaPasskey(utenteId, id) {
  const idPasskey = parseInt(id, 10);
  const { count } = Number.isNaN(idPasskey)
    ? { count: 0 }
    : await prisma.passkey.deleteMany({ where: { id: idPasskey, utenteId } });
  if (count === 0) throw new ErroreNonTrovato('Passkey non trovata');
  logger.info({ utenteId, passkeyId: idPasskey }, 'Passkey eliminata');
}

/** Prima meta' dell'accesso: la sfida, senza sapere ancora chi e' */
export async function opzioniAccesso() {
  const { rpID } = configurazionePasskey();
  const opzioni = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  return { id: conservaSfida({ tipo: 'accesso', sfida: opzioni.challenge }), opzioni };
}

/**
 * Seconda meta': la firma del dispositivo apre una sessione, come una
 * password giusta. Passkey sconosciuta e firma sbagliata danno lo stesso
 * messaggio.
 */
export async function verificaAccesso(idSfida, risposta, { ricordaDispositivo = false, dispositivo = null } = {}) {
  const sfida = prendiSfida(idSfida, 'accesso');
  const nonRiconosciuta = new ErroreNonAutenticato(
    'Passkey non riconosciuta: se l\'hai eliminata dal profilo, entra con la password'
  );

  const passkey = await prisma.passkey.findUnique({
    where: { credenziale: String(risposta?.id || '') },
    include: { utente: { select: CAMPI_ACCESSO } }
  });
  if (!passkey) throw nonRiconosciuta;

  const { origine, rpID } = configurazionePasskey();
  let verifica;
  try {
    verifica = await verifyAuthenticationResponse({
      response: risposta,
      expectedChallenge: sfida.sfida,
      expectedOrigin: origine,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.credenziale,
        publicKey: isoBase64URL.toBuffer(passkey.chiavePubblica),
        counter: passkey.contatore,
        transports: leggiTrasporti(passkey.trasporti)
      }
    });
  } catch (errore) {
    // Fra i motivi: un contatore tornato indietro, cioe' una passkey clonata
    logger.warn({ utenteId: passkey.utenteId, errore: errore.message }, 'Accesso con passkey rifiutato');
    throw nonRiconosciuta;
  }
  if (!verifica.verified) throw nonRiconosciuta;

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      contatore: verifica.authenticationInfo.newCounter,
      sincronizzata: verifica.authenticationInfo.credentialBackedUp,
      ultimoUso: new Date()
    }
  });

  const sessione = await apriSessione(passkey.utente, { ricordaDispositivo, dispositivo });
  logger.info({ utenteId: passkey.utenteId, passkeyId: passkey.id, dispositivo }, 'Login con passkey');
  return sessione;
}
