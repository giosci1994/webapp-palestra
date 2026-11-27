// ============================================
// GymMaster — Gym crowd data
// ============================================

/** After how many days without updates the crowd data counts as stale */
export const GIORNI_DATI_FERMI = 2;

/**
 * True if the crowd data was last collected more than GIORNI_DATI_FERMI days
 * ago: the app then says the pattern is the one recorded up to that day,
 * instead of showing an update time that looks like today's.
 * @param {string | null | undefined} ultimoAggiornamento - ISO instant from the server
 */
export function datiFermi(ultimoAggiornamento, adesso = Date.now()) {
  if (!ultimoAggiornamento) return false;
  return adesso - Date.parse(ultimoAggiornamento) > GIORNI_DATI_FERMI * 24 * 60 * 60 * 1000;
}

/**
 * Up to how many minutes the crowd data counts as recent. The scraper runs
 * every 6 hours (scraper/Dockerfile), so data that is just one run old is
 * still the latest there can be; the extra half hour covers the run itself.
 * Older than that, a run was missed and an update time alone ("Updated:
 * 18:23") would look like today's.
 */
export const MINUTI_DATI_RECENTI = 6 * 60 + 30;

/**
 * True if the crowd data was collected within the last MINUTI_DATI_RECENTI
 * minutes.
 * @param {string | null | undefined} istante - ISO instant from the server
 */
export function datiRecenti(istante, adesso = Date.now()) {
  if (!istante) return false;
  return adesso - Date.parse(istante) <= MINUTI_DATI_RECENTI * 60 * 1000;
}
