// ============================================
// GymMaster — The dots of the dashboard calendar
// ============================================
//
// At most one dot of each kind per day: green for a workout done (finished,
// or a scheduled one completed), violet for one still on the calendar, grey
// for one skipped. The states are those of the server
// (StatoAllenamentoPianificato): PIANIFICATO, COMPLETATO, SALTATO.

import { aStringaData } from './formattatori.js';

export const COLORI_CALENDARIO = {
  completato: 'var(--successo, #22c55e)',
  inProgramma: 'var(--accent)',
  saltato: 'var(--testo-terziario)'
};

/**
 * @param {{ dataInizio: string }[]} sessioni - the workouts done
 * @param {{ data: string, stato: string }[]} pianificati - the scheduled ones, data "YYYY-MM-DD"
 * @returns {Record<string, { colore: string }[]>} the dots of each day, by "YYYY-MM-DD"
 */
export function marcatoriCalendario(sessioni = [], pianificati = []) {
  const per = {};
  const aggiungi = (giorno, colore) => {
    if (!per[giorno]) per[giorno] = [];
    if (!per[giorno].some(x => x.colore === colore)) per[giorno].push({ colore });
  };

  // A workout counts on the day it started on the phone's clock, not the UTC one
  for (const s of sessioni) aggiungi(aStringaData(new Date(s.dataInizio)), COLORI_CALENDARIO.completato);
  for (const p of pianificati) {
    if (p.stato === 'COMPLETATO') aggiungi(p.data, COLORI_CALENDARIO.completato);
    else if (p.stato === 'PIANIFICATO') aggiungi(p.data, COLORI_CALENDARIO.inProgramma);
    else if (p.stato === 'SALTATO') aggiungi(p.data, COLORI_CALENDARIO.saltato);
  }
  return per;
}
