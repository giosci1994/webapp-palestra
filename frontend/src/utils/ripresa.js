// ============================================
// GymMaster — Resuming a workout from the server
// ============================================
//
// The workout screen keeps the point where you are in the browser
// (localStorage). If nothing is there (workout resumed from the history,
// opened from another device, browser data cleared) the point is rebuilt
// from the sets logged on the server: without this, it started again from the
// first set and the sets already done were logged a second time.

import { diLavoro } from './tipiSerie.js';

/** Values for an exercise added during the workout (WorkoutLive uses them too) */
export const ESERCIZIO_EXTRA = { serieTarget: 3, repTarget: 10, recuperoSecondi: 90 };

/**
 * The sets planned today for an exercise of the workout: those set during it
 * (serieOggi: one more because today you have more strength, one less), the
 * plan's otherwise. The plan itself does not change, and the load proposal
 * keeps reading the plan's serieTarget.
 */
export const serieDiOggi = esercizio => esercizio?.serieOggi ?? esercizio?.serieTarget;

/** The most sets of one exercise in a workout, adding them as you go */
export const SERIE_MAX_OGGI = 20;

/**
 * Today's sets after a change: never fewer than those already done (they are
 * in the history: they are removed from there), never fewer than one, never
 * more than SERIE_MAX_OGGI.
 * @param {number} quante - the number asked for
 * @param {number} fatte - working sets already done today
 */
export const limitaSerieOggi = (quante, fatte) => Math.min(SERIE_MAX_OGGI, Math.max(1, fatte, quante));

/**
 * @param {object} sessione - from GET /sessioni/:id: scheda with its exercises, logSerie with the exercise
 * @returns {{ eserciziLive: object[], serieCompletate: object[], esercizioIdx: number, serieCorrente: number, tempoInizio: number }}
 */
export function statoDaSessione(sessione) {
  const eserciziScheda = sessione.scheda?.esercizi ?? [];
  const serie = [...(sessione.logSerie ?? [])].sort((a, b) => a.id - b.id);

  // The exercises added during the workout: they have sets but are not in the plan
  const nellaScheda = new Set(eserciziScheda.map(e => e.esercizioId));
  const extra = [];
  for (const s of serie) {
    if (nellaScheda.has(s.esercizioId) || extra.some(e => e.esercizioId === s.esercizioId)) continue;
    extra.push({ esercizioId: s.esercizioId, esercizio: s.esercizio, ...ESERCIZIO_EXTRA });
  }
  // Skipped sets count as done, as during the workout; warm-up and drop sets do not
  const registrate = esercizioId => serie.filter(s => s.esercizioId === esercizioId && diLavoro(s)).length;
  // More sets than the plan: some were added during the workout, and today's
  // sets are those, not the plan's
  const eserciziLive = [...eserciziScheda, ...extra].map(e =>
    registrate(e.esercizioId) > (e.serieTarget ?? 0) ? { ...e, serieOggi: registrate(e.esercizioId) } : e);

  // Start again from the first exercise with sets still to do
  let esercizioIdx = eserciziLive.findIndex(e => registrate(e.esercizioId) < (serieDiOggi(e) ?? 1));
  if (esercizioIdx === -1) esercizioIdx = Math.max(0, eserciziLive.length - 1);
  const attuale = eserciziLive[esercizioIdx];

  return {
    eserciziLive,
    serieCompletate: serie.filter(s => s.completato),
    esercizioIdx,
    serieCorrente: attuale ? registrate(attuale.esercizioId) + 1 : 1,
    tempoInizio: new Date(sessione.dataInizio).getTime()
  };
}
