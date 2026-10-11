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
  const eserciziLive = [...eserciziScheda, ...extra];

  // Start again from the first exercise with sets still to do: skipped ones
  // count as done, as during the workout; warm-up and drop sets do not
  const registrate = esercizioId => serie.filter(s => s.esercizioId === esercizioId && diLavoro(s)).length;
  let esercizioIdx = eserciziLive.findIndex(e => registrate(e.esercizioId) < (e.serieTarget ?? 1));
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
