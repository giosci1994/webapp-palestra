// ============================================
// GymMaster — Yearly activity grid
// ============================================
//
// One square per day, one column per week (Monday to Sunday),
// the last 53 weeks up to today: like GitHub contributions.

import { gradinoAllenamento } from './costanti.js';

export const SETTIMANE_ATTIVITA = 53;
const GIORNO = 86400000;
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/**
 * The reference for intensity: the day's sets at the 90th percentile.
 * This way one exceptional day does not push all the others down to the palest color.
 */
function riferimento(valori) {
  if (!valori.length) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.floor((ordinati.length - 1) * 0.9)];
}

/**
 * @param {{giorno: string, allenamenti: number, serie: number}[]} giorni - the days with at least one workout
 * @param {Date} oggi
 * @returns {{
 *   settimane: ({giorno: string, allenamenti: number, serie: number, gradino: number, oggi: boolean} | null)[][],
 *   mesi: {colonna: number, etichetta: string}[],
 *   allenamenti: number,
 *   giorniAttivi: number
 * }} settimane: 53 columns of 7 days, null after today; gradino 0 = rest, 1-5 = intensity
 */
export function grigliaAttivita(giorni, oggi = new Date()) {
  // Count in UTC midnights of the local day: no surprises with the clock change
  const fine = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const lunedi = fine - ((new Date(fine).getUTCDay() + 6) % 7) * GIORNO;
  const inizio = lunedi - (SETTIMANE_ATTIVITA - 1) * 7 * GIORNO;
  const chiave = t => new Date(t).toISOString().slice(0, 10);

  const nelPeriodo = giorni.filter(g => g.giorno >= chiave(inizio) && g.giorno <= chiave(fine));
  const perGiorno = new Map(nelPeriodo.map(g => [g.giorno, g]));
  const massimo = riferimento(nelPeriodo.map(g => g.serie));

  const settimane = [];
  const mesi = [];
  for (let colonna = 0; colonna < SETTIMANE_ATTIVITA; colonna++) {
    const settimana = [];
    for (let riga = 0; riga < 7; riga++) {
      const t = inizio + (colonna * 7 + riga) * GIORNO;
      if (t > fine) { settimana.push(null); continue; }
      const data = new Date(t);
      // The month name goes above the week that contains its first day
      if (data.getUTCDate() === 1) mesi.push({ colonna, etichetta: MESI[data.getUTCMonth()] });
      const voce = perGiorno.get(chiave(t));
      const allenamenti = voce?.allenamenti || 0;
      const serie = voce?.serie || 0;
      settimana.push({
        giorno: chiave(t),
        allenamenti,
        serie,
        // A workout with no logged sets still counts as activity
        gradino: allenamenti ? Math.max(1, gradinoAllenamento(Math.min(serie, massimo), massimo)) : 0,
        oggi: t === fine
      });
    }
    settimane.push(settimana);
  }

  return {
    settimane,
    mesi,
    allenamenti: nelPeriodo.reduce((totale, g) => totale + g.allenamenti, 0),
    giorniAttivi: nelPeriodo.length
  };
}
