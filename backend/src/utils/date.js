// ============================================
// GymMaster — Dates in the local calendar
// ============================================
//
// The server runs in UTC, the users wherever they are. The day of a workout,
// "today", the week and the hour of a reminder are those of the user's own
// time zone: between midnight and 2 a.m. in Italy the UTC day is still the
// day before, and in Tokyo the UTC day is already the next one by 9 a.m.
//
// Which time zone:
// - During a request, the user's: the app sends the phone's in X-Fuso-Orario
//   and middleware/autenticazione.js keeps it for the whole request
//   (AsyncLocalStorage, like the language), so fusoCorrente() works anywhere.
// - Outside a request (reminders, workouts closed on a timer, notifications
//   for another user), the recipient's: fusoDi(utente), the one the app last
//   sent (Utente.fusoOrario). Pass it explicitly, or run the code in conFuso().
// - Users who never sent one, and the gym's crowd levels, use FUSO_ORARIO:
//   the gym is in Copenhagen (the same time zone as Italy).

import { AsyncLocalStorage } from 'node:async_hooks';

/** The gym's time zone, and the default for users who never sent theirs */
export const FUSO_ORARIO = 'Europe/Copenhagen';

const GIORNO = 86400000;

// --- Which time zone ---

const validi = new Map();

/** An IANA time zone the server knows ("Europe/Rome"), or null */
export function fusoValido(fuso) {
  if (typeof fuso !== 'string' || fuso.length === 0 || fuso.length > 64) return null;
  if (!validi.has(fuso)) {
    let valido = false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: fuso }); valido = true; } catch { /* unknown zone */ }
    validi.set(fuso, valido);
  }
  return validi.get(fuso) ? fuso : null;
}

/** The time zone for a user outside a request: the one the app last sent, otherwise the gym's */
export function fusoDi(utente) {
  return fusoValido(utente?.fusoOrario) || FUSO_ORARIO;
}

const contesto = new AsyncLocalStorage();

/** The time zone of the current request (or of the surrounding conFuso) */
export function fusoCorrente() {
  return contesto.getStore() || FUSO_ORARIO;
}

/** Runs fn with `fuso` as the current time zone */
export function conFuso(fuso, fn) {
  return contesto.run(fusoValido(fuso) || FUSO_ORARIO, fn);
}

// --- Days and hours ---

const formatoGiorno = new Map();
const formatoOra = new Map();
const formatoCompleto = new Map();
const formato = (cache, fuso, opzioni, locale = 'en-US') => {
  if (!cache.has(fuso)) cache.set(fuso, new Intl.DateTimeFormat(locale, { timeZone: fuso, ...opzioni }));
  return cache.get(fuso);
};

/**
 * Local calendar day of an instant, as a Date at UTC midnight:
 * the same format as the @db.Date columns (for example the schedule).
 */
export function giornoLocale(istante, fuso = fusoCorrente()) {
  const testo = formato(formatoGiorno, fuso, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(new Date(istante));
  const [anno, mese, giorno] = testo.split('-').map(Number);
  return new Date(Date.UTC(anno, mese - 1, giorno));
}

/** The local day of an instant as "YYYY-MM-DD" */
export function chiaveGiorno(istante, fuso = fusoCorrente()) {
  return giornoLocale(istante, fuso).toISOString().slice(0, 10);
}

const GIORNI = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * Local hour and weekday of an instant, with the same numbering as the
 * crowd level data: 0 = Monday … 6 = Sunday.
 */
export function orarioLocale(istante = new Date(), fuso = fusoCorrente()) {
  const parti = Object.fromEntries(formato(formatoOra, fuso, { hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(istante)).map(p => [p.type, p.value]));
  return { ora: Number(parti.hour), giornoSettimana: GIORNI[parti.weekday] };
}

/** How far the local clock is ahead of UTC at an instant, in milliseconds */
function scarto(istante, fuso) {
  const p = Object.fromEntries(formato(formatoCompleto, fuso, {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date(istante)).map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(new Date(istante).getTime() / 1000) * 1000;
}

/** The instant the local day of `istante` began (local midnight), as a Date */
export function inizioGiorno(istante = new Date(), fuso = fusoCorrente()) {
  const mezzanotte = giornoLocale(istante, fuso).getTime();
  // The offset at midnight can differ from the one at `istante` (daylight saving)
  const prima = mezzanotte - scarto(mezzanotte, fuso);
  return new Date(mezzanotte - scarto(prima, fuso));
}

/** Local calendar days between two instants: last night and this morning are 1 apart. */
export function giorniDiCalendario(da, a, fuso = fusoCorrente()) {
  return Math.round((giornoLocale(a, fuso) - giornoLocale(da, fuso)) / GIORNO);
}

// --- Weeks and streaks ---

/** The Monday of the week of a calendar day (a Date at UTC midnight), in milliseconds */
export function lunediDelGiorno(giorno) {
  const x = new Date(giorno);
  return x.getTime() - ((x.getUTCDay() + 6) % 7) * GIORNO;
}

/** The Monday of the local week of an instant, in milliseconds (same format as lunediDelGiorno) */
export function lunediLocale(istante, fuso = fusoCorrente()) {
  return lunediDelGiorno(giornoLocale(istante, fuso));
}

/**
 * Consecutive local days with a workout, ending today: 0 if there is none
 * today yet.
 * @param {Iterable<Date>} istanti when the workouts started
 */
export function giorniDiFila(istanti, adesso = new Date(), fuso = fusoCorrente()) {
  const giorni = new Set([...istanti].map(i => giornoLocale(i, fuso).getTime()));
  let giorno = giornoLocale(adesso, fuso).getTime();
  let fila = 0;
  while (giorni.has(giorno)) { fila++; giorno -= GIORNO; }
  return fila;
}
