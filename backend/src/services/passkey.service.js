// ============================================
// GymMaster — Passkey (WebAuthn)
// ============================================
//
// Signing in with the device's fingerprint, face or PIN instead of the
// password. The device (or the password manager that syncs the passkey)
// keeps the private key and signs a challenge; here we only keep the public
// key that checks the signature.
//
// Passkeys are added from the profile by confirming the password: someone who
// steals a session must not be able to add their own and stay in even after a
// password change. The password stays: a passkey is one more way to sign in.
//
// A passkey only works on the domain it was created for (RP ID): it is taken
// from APP_URL, like the links in the emails.

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
// Time to complete the gesture on the device
const DURATA_SFIDA_MS = 5 * 60 * 1000;
const MAX_SFIDE = 10000;

// What the profile shows of a passkey
const CAMPI_ELENCO = { id: true, nome: true, sincronizzata: true, creataIl: true, ultimoUso: true };

/** Origin and RP ID, from the same variables as the links in the emails */
export function configurazionePasskey() {
  const url = new URL(process.env.APP_URL || `https://gymmaster.${process.env.DOMINIO || 'casadm.uk'}`);
  return { origine: url.origin, rpID: url.hostname };
}

// Challenges waiting for a signature: id -> { tipo, sfida, utenteId, scade }.
// In memory: they last a few minutes, and a restart only costs a new attempt.
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

/** Each challenge is used only once: reusing a signature gets you nothing */
function prendiSfida(id, tipo) {
  const chiave = String(id || '');
  const sfida = sfide.get(chiave);
  sfide.delete(chiave);
  if (!sfida || sfida.tipo !== tipo || sfida.scade < Date.now()) {
    throw new ErroreValidazione('Richiesta scaduta: riprova');
  }
  return sfida;
}

/** How the authenticator recognizes the user: opaque, with no email or name */
function handleUtente(utenteId) {
  return crypto.createHash('sha256').update(`gymmaster-passkey:${utenteId}`).digest();
}

function leggiTrasporti(testo) {
  try { return JSON.parse(testo) ?? undefined; } catch { return undefined; }
}

/** The user's passkeys, for the profile */
export function elencaPasskey(utenteId) {
  return prisma.passkey.findMany({ where: { utenteId }, orderBy: { creataIl: 'asc' }, select: CAMPI_ELENCO });
}

/**
 * First half of adding one: after the password, the challenge for the device
 * to sign. Passkeys already registered are excluded, so they are not duplicated.
 */
export async function opzioniRegistrazione(utenteId, password) {
  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { id: true, email: true, nome: true, passwordHash: true, passkey: { select: { credenziale: true, trasporti: true } } }
  });
  if (!utente) throw new ErroreNonTrovato('Utente non trovato');

  // A wrong password here counts as a failed sign-in
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
    // "Discoverable" passkeys: no need to type the email to sign in
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
  });

  return { id: conservaSfida({ tipo: 'registrazione', sfida: opzioni.challenge, utenteId }), opzioni };
}

/** Second half: the device's response becomes one of the user's passkeys */
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

/** First half of signing in: the challenge, without knowing yet who it is */
export async function opzioniAccesso() {
  const { rpID } = configurazionePasskey();
  const opzioni = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  return { id: conservaSfida({ tipo: 'accesso', sfida: opzioni.challenge }), opzioni };
}

/**
 * Second half: the device's signature opens a session, like a correct
 * password. An unknown passkey and a wrong signature give the same
 * message.
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
    // Among the reasons: a counter that went backwards, that is a cloned passkey
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
