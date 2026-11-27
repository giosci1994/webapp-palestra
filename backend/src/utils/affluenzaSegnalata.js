// ============================================
// GymMaster — Crowd levels reported by users
// ============================================
//
// During a workout the app asks how busy the gym is (0-3). This file holds,
// in one place, every number that decides what those reports are worth: the
// conversion from level to percentage, the limits against abuse and the
// thresholds above which a cell (gym x weekday x hour) or the "right now"
// value can come from the users instead of the Google data.
//
// Only aggregates come out of here: counts and averages, never a single
// report or who sent it.
//
// Not wired to the crowd routes yet: what the app shows does not change
// until GET /palestre/:id/affluenza and the reminder use these functions.

import prisma from '../config/database.js';
import { FUSO_ORARIO, lunediLocale } from './date.js';

const MINUTO = 60 * 1000;
const SETTIMANA = 7 * 24 * 60 * MINUTO;

/** Level saved (index 0-3) → the percentage used in the averages, on the same scale as the Google data */
export const LIVELLI_AFFLUENZA = [5, 25, 55, 85];
export const LIVELLO_MASSIMO = LIVELLI_AFFLUENZA.length - 1;

// --- Limits on reporting ---

/** A workout can be reported on only in its first hours: later the user is no longer in the gym */
export const ORE_MASSIME_SESSIONE = 3;
/** At most one report per user in this many minutes, even on different workouts */
export const MINUTI_TRA_SEGNALAZIONI = 30;
/** Requests per user per hour to POST /sessioni/:id/affluenza (rate limiter) */
export const RICHIESTE_SEGNALAZIONE_ORA = 10;

// --- When the users' data is enough ---

/** A cell (gym x weekday x hour) uses the users' reports from the last SETTIMANE_CELLA weeks… */
export const SETTIMANE_CELLA = 12;
/** …when it has at least this many reports… */
export const MIN_SEGNALAZIONI_CELLA = 15;
/** …from at least this many different people… */
export const MIN_UTENTI_CELLA = 2;
/** …of whom at least MIN_PERSONE_COSTANTI_CELLA reported in that cell… */
export const MIN_PERSONE_COSTANTI_CELLA = 2;
/** …each in at least this many different weeks (of the SETTIMANE_CELLA) */
export const SETTIMANE_DIVERSE_PER_PERSONA = 3;
/** In a cell's average the reports of the last weeks count in full, older ones half */
export const SETTIMANE_PESO_PIENO = 4;
export const PESO_VECCHIE = 0.5;

/** "Right now" uses the reports of the last MINUTI_LIVE minutes… */
export const MINUTI_LIVE = 45;
/** …when there are at least this many… */
export const MIN_SEGNALAZIONI_LIVE = 2;
/** …from at least this many different people */
export const MIN_UTENTI_LIVE = 2;
/** In the live average the oldest report weighs this much, the newest 1 */
export const PESO_LIVE_PIU_VECCHIA = 0.5;

/** The percentage of a saved level, or null for a value out of range */
export function percentualeDi(livello) {
  return Number.isInteger(livello) && livello >= 0 && livello <= LIVELLO_MASSIMO ? LIVELLI_AFFLUENZA[livello] : null;
}

/**
 * The week a report belongs to: the Monday of its calendar week (Monday to
 * Sunday) in the gym's time zone, as milliseconds. It depends only on the
 * instant, not on when the aggregate is computed, so the same reports always
 * fall in the same weeks; three reports in one week count as one week.
 */
export const settimanaDi = istante => lunediLocale(istante, FUSO_ORARIO);

const mediaPesata = coppie => {
  const pesi = coppie.reduce((somma, [, peso]) => somma + peso, 0);
  return Math.round(coppie.reduce((somma, [valore, peso]) => somma + valore * peso, 0) / pesi);
};

/**
 * The cells of a gym from its reports.
 * @param {{ giornoSettimana: number, ora: number, livello: number, utenteId: number, istante: Date }[]} righe
 * @returns {{ giornoSettimana: number, ora: number, livelloPercentuale: number, segnalazioni: number,
 *   utenti: number, personeCostanti: number, ultimaSegnalazione: Date, sufficiente: boolean }[]}
 *   one per cell with at least one report in the window, sorted by day and hour;
 *   `personeCostanti` is how many people reported in it in at least
 *   SETTIMANE_DIVERSE_PER_PERSONA different weeks; `sufficiente` says whether
 *   it passes the threshold. Everyone's reports go into the average.
 */
export function aggregaCelle(righe, adesso = new Date()) {
  const inizio = adesso.getTime() - SETTIMANE_CELLA * SETTIMANA;
  const pieno = adesso.getTime() - SETTIMANE_PESO_PIENO * SETTIMANA;
  const celle = new Map();
  for (const riga of righe) {
    const istante = new Date(riga.istante).getTime();
    const percentuale = percentualeDi(riga.livello);
    if (istante < inizio || istante > adesso.getTime() || percentuale === null) continue;
    const chiave = riga.giornoSettimana * 24 + riga.ora;
    if (!celle.has(chiave)) celle.set(chiave, { giornoSettimana: riga.giornoSettimana, ora: riga.ora, valori: [], settimane: new Map(), ultima: 0 });
    const cella = celle.get(chiave);
    cella.valori.push([percentuale, istante >= pieno ? 1 : PESO_VECCHIE]);
    if (!cella.settimane.has(riga.utenteId)) cella.settimane.set(riga.utenteId, new Set());
    cella.settimane.get(riga.utenteId).add(settimanaDi(istante));
    cella.ultima = Math.max(cella.ultima, istante);
  }
  return [...celle.entries()].sort(([a], [b]) => a - b).map(([, cella]) => {
    const utenti = cella.settimane.size;
    const personeCostanti = [...cella.settimane.values()].filter(settimane => settimane.size >= SETTIMANE_DIVERSE_PER_PERSONA).length;
    return {
      giornoSettimana: cella.giornoSettimana,
      ora: cella.ora,
      livelloPercentuale: mediaPesata(cella.valori),
      segnalazioni: cella.valori.length,
      utenti,
      personeCostanti,
      ultimaSegnalazione: new Date(cella.ultima),
      sufficiente: cella.valori.length >= MIN_SEGNALAZIONI_CELLA && utenti >= MIN_UTENTI_CELLA &&
        personeCostanti >= MIN_PERSONE_COSTANTI_CELLA
    };
  });
}

/**
 * The "right now" value of a gym from its reports, or null when they are not
 * enough. The newest report weighs 1, one MINUTI_LIVE minutes old PESO_LIVE_PIU_VECCHIA.
 * @returns {{ livelloPercentuale: number, segnalazioni: number, ultimaSegnalazione: Date } | null}
 */
export function aggregaLive(righe, adesso = new Date()) {
  const finestra = MINUTI_LIVE * MINUTO;
  const recenti = righe
    .map(r => ({ ...r, eta: adesso.getTime() - new Date(r.istante).getTime(), percentuale: percentualeDi(r.livello) }))
    .filter(r => r.eta >= 0 && r.eta <= finestra && r.percentuale !== null);
  if (recenti.length < MIN_SEGNALAZIONI_LIVE || new Set(recenti.map(r => r.utenteId)).size < MIN_UTENTI_LIVE) return null;
  return {
    livelloPercentuale: mediaPesata(recenti.map(r => [r.percentuale, 1 - (1 - PESO_LIVE_PIU_VECCHIA) * (r.eta / finestra)])),
    segnalazioni: recenti.length,
    ultimaSegnalazione: new Date(adesso.getTime() - Math.min(...recenti.map(r => r.eta)))
  };
}

const CAMPI = { giornoSettimana: true, ora: true, livello: true, utenteId: true, istante: true };

/** The cells of a gym, from the database (aggregaCelle) */
export async function celleNostre(palestraId, adesso = new Date()) {
  const righe = await prisma.segnalazioneAffluenza.findMany({
    where: { palestraId, istante: { gte: new Date(adesso.getTime() - SETTIMANE_CELLA * SETTIMANA), lte: adesso } },
    select: CAMPI
  });
  return aggregaCelle(righe, adesso);
}

/** The "right now" value of a gym from the database (aggregaLive), or null */
export async function liveSegnalato(palestraId, adesso = new Date()) {
  const righe = await prisma.segnalazioneAffluenza.findMany({
    where: { palestraId, istante: { gte: new Date(adesso.getTime() - MINUTI_LIVE * MINUTO), lte: adesso } },
    select: CAMPI
  });
  return aggregaLive(righe, adesso);
}
