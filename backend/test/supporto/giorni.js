// ============================================
// GymMaster — Test: days ago
// ============================================
//
// "5 days ago" in a test means 5 days back on the calendar the server counts
// days in, not 5 × 24 hours. The days of the daylight saving changes last 23
// and 25 hours: for days after them, in the hour next to midnight, 5 × 24
// hours fell 4 or 6 days back on the calendar, and the tests that count days
// (streaks, "rested for 5 days") failed.

import { FUSO_ORARIO } from '../../src/utils/date.js';

export const MINUTO = 60 * 1000;
export const GIORNO = 24 * 60 * MINUTO;

const formati = new Map();

/** How far the clock of `fuso` is ahead of UTC at an instant, in milliseconds */
function scarto(istante, fuso) {
  if (!formati.has(fuso)) {
    formati.set(fuso, new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
    }));
  }
  const p = Object.fromEntries(formati.get(fuso).formatToParts(istante).map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(istante / 1000) * 1000;
}

/**
 * The instant n days ago at the same time of day, on the calendar of `fuso`:
 * the gym's by default, the one the server uses when neither the user nor the
 * request names another. A fraction is part of a day (0.5 = 12 hours); a
 * negative n is in the future.
 * @param {number} n
 * @param {string} [fuso] - 'UTC' for requests that count days in UTC
 * @param {number} [adesso] - in milliseconds
 */
export function giorniFa(n, fuso = FUSO_ORARIO, adesso = Date.now()) {
  const interi = Math.trunc(n);
  const passi = adesso - interi * GIORNO;
  // The same time on the clock: the 24-hour steps, moved by the change of offset in between
  const stessaOra = passi + scarto(adesso, fuso) - scarto(passi, fuso);
  return new Date(stessaOra - (n - interi) * GIORNO);
}
