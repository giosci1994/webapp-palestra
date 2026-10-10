// ============================================
// GymMaster — Griglia dell'attivita' annuale
// ============================================
//
// Un quadretto per giorno, una colonna per settimana (da lunedi' a domenica),
// le ultime 53 settimane fino a oggi: come i contributi di GitHub.

import { gradinoAllenamento } from './costanti.js';

export const SETTIMANE_ATTIVITA = 53;
const GIORNO = 86400000;
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/**
 * Il riferimento per l'intensita': le serie del giorno al 90° percentile.
 * Un giorno eccezionale non schiaccia cosi' tutti gli altri sul colore piu' tenue.
 */
function riferimento(valori) {
  if (!valori.length) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.floor((ordinati.length - 1) * 0.9)];
}

/**
 * @param {{giorno: string, allenamenti: number, serie: number}[]} giorni - i giorni con almeno un allenamento
 * @param {Date} oggi
 * @returns {{
 *   settimane: ({giorno: string, allenamenti: number, serie: number, gradino: number, oggi: boolean} | null)[][],
 *   mesi: {colonna: number, etichetta: string}[],
 *   allenamenti: number,
 *   giorniAttivi: number
 * }} settimane: 53 colonne di 7 giorni, null dopo oggi; gradino 0 = riposo, 1-5 = intensita'
 */
export function grigliaAttivita(giorni, oggi = new Date()) {
  // Si conta in mezzanotti UTC del giorno locale: niente sorprese col cambio dell'ora
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
      // Il nome del mese sopra la settimana che ne contiene il primo giorno
      if (data.getUTCDate() === 1) mesi.push({ colonna, etichetta: MESI[data.getUTCMonth()] });
      const voce = perGiorno.get(chiave(t));
      const allenamenti = voce?.allenamenti || 0;
      const serie = voce?.serie || 0;
      settimana.push({
        giorno: chiave(t),
        allenamenti,
        serie,
        // Un allenamento senza serie registrate conta comunque come attivita'
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
