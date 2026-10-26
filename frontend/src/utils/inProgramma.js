// ============================================
// GymMaster — Planned workouts on the Allenati Ora page
// ============================================
//
// Today's come from /pianificazione/oggi (the server's day, in the phone's
// time zone); the next days' from the calendar, asked for by the phone's
// local dates (aStringaData), as the calendar on the dashboard does.

import { aStringaData } from './formattatori.js';

/** How many days after today the page looks ahead */
export const GIORNI_AVANTI = 6;
/** How many of the next workouts it lists */
export const PROSSIMI_MAX = 3;

/** The calendar range of the next days: from tomorrow to GIORNI_AVANTI days after today */
export function periodoProssimi(oggi = new Date()) {
  const giorno = n => aStringaData(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + n));
  return { da: giorno(1), a: giorno(GIORNI_AVANTI) };
}

/** The workouts still to do, by date, at most PROSSIMI_MAX */
export function prossimiDaFare(pianificati) {
  return pianificati
    .filter(p => p.stato === 'PIANIFICATO')
    .sort((x, y) => x.data.localeCompare(y.data) || x.id - y.id)
    .slice(0, PROSSIMI_MAX);
}

/** Days from today to `data` ("YYYY-MM-DD"): 1 is tomorrow */
export function giorniDaOggi(data, oggi = new Date()) {
  const [anno, mese, giorno] = data.split('-').map(Number);
  return Math.round((Date.UTC(anno, mese - 1, giorno) - Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())) / 86400000);
}
