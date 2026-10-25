// ============================================
// GymMaster — Test: test data
// ============================================
//
// They write what a test needs straight into the database, with sensible
// default values: each test states only what matters to it.

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from './database.js';
import { MINUTO, GIORNO, giorniFa } from './giorni.js';

let progressivo = 0;
const unico = () => ++progressivo;

// Days ago on the calendar, not in steps of 24 hours (giorni.js)
export { MINUTO, GIORNO, giorniFa };

/**
 * An active user. The password becomes a real hash only if a test logs in:
 * argon2 costs tens of milliseconds.
 */
export async function creaUtente({ password, ...dati } = {}) {
  const n = unico();
  return prisma.utente.create({
    data: {
      email: `utente${n}@test.local`,
      nome: `Utente ${n}`,
      passwordHash: password ? await argon2.hash(password, { type: argon2.argon2id }) : 'senza-password',
      stato: 'ATTIVO',
      ...dati
    }
  });
}

/** A valid access token for the user, the same as the one from login */
export function tokenPer(utente) {
  return jwt.sign(
    { utenteId: utente.id, email: utente.email, ruolo: utente.ruolo },
    process.env.JWT_SEGRETO_ACCESS,
    { expiresIn: '15m' }
  );
}

export function creaEsercizio(dati = {}) {
  return prisma.esercizio.create({
    data: { nome: `Esercizio ${unico()}`, gruppoMuscoloPrimario: 'Petto', ...dati }
  });
}

/** A personal plan with the given exercises, in that order */
export function creaScheda(creatore, esercizi = [], dati = {}) {
  return prisma.schedaAllenamento.create({
    data: {
      creatoreId: creatore.id,
      titolo: `Scheda ${unico()}`,
      ...dati,
      esercizi: {
        create: esercizi.map((esercizio, i) => ({
          esercizioId: esercizio.id, serieTarget: 3, repTarget: '8-12', ordineEsecuzione: i + 1
        }))
      }
    }
  });
}

/**
 * A workout, finished unless { conclusa: false }, with the sets
 * [{ esercizio, peso, rep, ...other log_serie fields }] numbered per
 * exercise in the given order.
 * The created sets come back in logSerie, in the same order.
 */
export function creaSessione(utente, scheda, { inizio = giorniFa(1), durataMinuti = 60, conclusa = true, serie = [] } = {}) {
  const numeri = new Map();
  return prisma.sessioneAllenamento.create({
    data: {
      utenteId: utente.id,
      schedaId: scheda.id,
      dataInizio: inizio,
      ...(conclusa && { dataFine: new Date(inizio.getTime() + durataMinuti * MINUTO), durataMinuti }),
      logSerie: {
        create: serie.map(({ esercizio, peso, rep, ...altro }) => {
          const serieNumero = (numeri.get(esercizio.id) || 0) + 1;
          numeri.set(esercizio.id, serieNumero);
          return { esercizioId: esercizio.id, serieNumero, pesoEffettivo: peso, repEffettive: rep, ...altro };
        })
      }
    },
    include: { logSerie: { orderBy: { id: 'asc' } } }
  });
}

export function creaRecord(utente, esercizio, peso, dataRecord = new Date()) {
  return prisma.recordPersonale.create({
    data: { utenteId: utente.id, esercizioId: esercizio.id, pesoMaxRaggiunto: peso, dataRecord }
  });
}
