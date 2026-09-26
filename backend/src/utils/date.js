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
