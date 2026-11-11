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
