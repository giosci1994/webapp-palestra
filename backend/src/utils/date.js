// ============================================
// GymMaster — Dates in the local calendar
// ============================================
//
// The server runs in UTC, the gym and its members in Copenhagen (the same
// time zone as Italy). The day of a workout is the one of the local
// calendar: between midnight and 2 a.m. the UTC day is still the day before.

export const FUSO_ORARIO = 'Europe/Copenhagen';

const formatoGiorno = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_ORARIO, year: 'numeric', month: '2-digit', day: '2-digit'
});

/**
 * Local calendar day of an instant, as a Date at UTC midnight:
 * the same format as the @db.Date columns (for example the schedule).
 */
export function giornoLocale(istante) {
  const [anno, mese, giorno] = formatoGiorno.format(new Date(istante)).split('-').map(Number);
  return new Date(Date.UTC(anno, mese - 1, giorno));
}

const formatoOra = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_ORARIO, hour: 'numeric', hourCycle: 'h23', weekday: 'short'
});
const GIORNI = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * Local hour and weekday of an instant, with the same numbering as the
 * crowd level data: 0 = Monday … 6 = Sunday.
 */
export function orarioLocale(istante = new Date()) {
  const parti = Object.fromEntries(formatoOra.formatToParts(new Date(istante)).map(p => [p.type, p.value]));
  return { ora: Number(parti.hour), giornoSettimana: GIORNI[parti.weekday] };
}

/** Local calendar days between two instants: last night and this morning are 1 apart. */
export function giorniDiCalendario(da, a) {
  return Math.round((giornoLocale(a) - giornoLocale(da)) / 86400000);
}
