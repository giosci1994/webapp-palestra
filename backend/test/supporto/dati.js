// ============================================
// GymMaster — Test: dati di prova
// ============================================
//
// Scrivono direttamente nel database quello che serve a un test, con valori
// di default sensati: ogni test indica solo cio' che conta per lui.

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from './database.js';

let progressivo = 0;
const unico = () => ++progressivo;

export const MINUTO = 60 * 1000;
export const GIORNO = 24 * 60 * MINUTO;

/** L'istante di n giorni fa */
export const giorniFa = n => new Date(Date.now() - n * GIORNO);

/**
 * Un utente attivo. La password diventa un hash vero solo se un test fa il
 * login: argon2 costa decine di millisecondi.
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

/** Un access token valido per l'utente, uguale a quello del login */
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

/** Una scheda personale con gli esercizi dati, in quell'ordine */
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
 * Una sessione, conclusa salvo { conclusa: false }, con le serie
 * [{ esercizio, peso, rep }] numerate per esercizio nell'ordine dato.
 * Le serie create tornano in logSerie, nello stesso ordine.
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
        create: serie.map(({ esercizio, peso, rep }) => {
          const serieNumero = (numeri.get(esercizio.id) || 0) + 1;
          numeri.set(esercizio.id, serieNumero);
          return { esercizioId: esercizio.id, serieNumero, pesoEffettivo: peso, repEffettive: rep };
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
