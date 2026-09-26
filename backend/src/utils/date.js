// ============================================
// GymMaster — Date nel calendario locale
// ============================================
//
// Il server gira in UTC, la palestra e chi la frequenta a Copenaghen (lo stesso
// fuso dell'Italia). Il giorno di un allenamento e' quello del calendario
// locale: fra mezzanotte e le 2 il giorno UTC e' ancora quello prima.

export const FUSO_ORARIO = 'Europe/Copenhagen';

const formatoGiorno = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_ORARIO, year: 'numeric', month: '2-digit', day: '2-digit'
});

/**
 * Giorno di calendario locale di un istante, come Date a mezzanotte UTC:
 * lo stesso formato delle colonne @db.Date (per esempio la pianificazione).
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
 * Ora e giorno della settimana locali di un istante, con la stessa numerazione
 * dei dati di affluenza: 0 = lunedi' … 6 = domenica.
 */
export function orarioLocale(istante = new Date()) {
  const parti = Object.fromEntries(formatoOra.formatToParts(new Date(istante)).map(p => [p.type, p.value]));
  return { ora: Number(parti.hour), giornoSettimana: GIORNI[parti.weekday] };
}

/** Giorni di calendario locale fra due istanti: ieri sera e stamattina distano 1. */
export function giorniDiCalendario(da, a) {
  return Math.round((giornoLocale(a) - giornoLocale(da)) / 86400000);
}
