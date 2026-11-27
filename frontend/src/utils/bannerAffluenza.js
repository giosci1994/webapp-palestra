// ============================================
// GymMaster — "How busy is the gym right now?" during a workout
// ============================================
//
// The banner at the top of the live workout (componenti/specifici/
// BannerAffluenza.jsx) asks it once per workout. The server keeps one report
// per workout (POST /sessioni/:id/affluenza); "Skip" and "I'm not at the gym"
// are remembered only on this phone, per workout.

/** The levels, as saved by the server: 0 empty … 3 packed */
export const LIVELLI_AFFLUENZA = [0, 1, 2, 3];

/** The server accepts a report only in a workout's first hours */
export const ORE_MASSIME_BANNER = 3;

/** How long the "thanks" stays before the banner goes away */
export const MS_GRAZIE = 2000;

/** The localStorage key that says the banner was closed for this workout */
export const chiaveBannerAffluenza = sessioneId => `gymmaster_affluenza_${sessioneId}`;

/**
 * True if the banner is to be shown: the user has a gym, the workout is open,
 * started less than ORE_MASSIME_BANNER hours ago, not reported yet and not
 * skipped on this phone. A session without the affluenzaSegnalata field
 * counts as not reported: the server answers 409 GIA_SEGNALATA if it is.
 * @param {{ sessione?: object|null, utente?: object|null, chiusoQui?: boolean, adesso?: number }} dati
 */
export function mostraBannerAffluenza({ sessione, utente, chiusoQui = false, adesso = Date.now() }) {
  if (!sessione || !utente?.palestraId) return false;
  if (sessione.dataFine || sessione.affluenzaSegnalata === true || chiusoQui) return false;
  const inizio = Date.parse(sessione.dataInizio);
  if (Number.isNaN(inizio)) return false;
  return adesso - inizio < ORE_MASSIME_BANNER * 60 * 60 * 1000;
}

/** True if the banner was already closed for this workout on this phone */
export function bannerChiusoQui(sessioneId) {
  try {
    return localStorage.getItem(chiaveBannerAffluenza(sessioneId)) !== null;
  } catch {
    return false;
  }
}

/** Remembers on this phone that the banner was closed for this workout */
export function segnaBannerChiuso(sessioneId) {
  try {
    localStorage.setItem(chiaveBannerAffluenza(sessioneId), '1');
  } catch { /* storage unavailable: it closes for this visit only */ }
}
