// ============================================
// GymMaster — The rest between sets
// ============================================
//
// The countdown is worked out from the moment the rest ends, not by taking a
// second off at every tick: with the app in the background or the screen
// locked the phone slows down or freezes timers, and a countdown made of
// ticks stood still, starting again where it had stopped. The end is also
// kept on the phone, so a rest survives the app being closed and reopened.

/** Back in the app later than this after the end, the rest ends without a beep: the push already told */
export const SEGNALE_ENTRO_MS = 5000;

const PREFISSO = 'gymmaster_recupero_';

/**
 * The seconds left until `fine`, rounded up (a rest of 90 seconds starts at
 * 1:30), never below zero.
 * @param {number} fine - when the rest ends, in milliseconds
 * @param {number} adesso - in milliseconds
 */
export function secondiAllaFine(fine, adesso) {
  return Math.max(0, Math.ceil((fine - adesso) / 1000));
}

/**
 * Where the rest is now: the seconds left, whether it is over, and whether
 * to beep and vibrate (only right at the end, not when the user comes back
 * to the app minutes after it).
 * @returns {{ secondi: number, finito: boolean, segnale: boolean }}
 */
export function statoRecupero(fine, adesso) {
  const secondi = secondiAllaFine(fine, adesso);
  const finito = secondi === 0;
  return { secondi, finito, segnale: finito && adesso - fine <= SEGNALE_ENTRO_MS };
}

/**
 * Keeps the rest of workout `sessioneId` on the phone.
 * @param {{ fine: number, durata: number, inCima: boolean, avvisato: boolean, esercizio?: number }} recupero
 *   durata: seconds, for the progress bar; inCima: shown at the top, above the
 *   next exercise; avvisato: the server will send the end-of-rest push;
 *   esercizio: index of the exercise whose set started it (one more set of it)
 */
export function salvaRecupero(sessioneId, recupero, archivio = globalThis.localStorage) {
  try {
    archivio?.setItem(`${PREFISSO}${sessioneId}`, JSON.stringify(recupero));
  } catch {
    // Storage full or not available: the rest goes on, it is just not kept
  }
}

/** Forgets the rest of the workout (stopped, skipped, workout over) */
export function togliRecupero(sessioneId, archivio = globalThis.localStorage) {
  try {
    archivio?.removeItem(`${PREFISSO}${sessioneId}`);
  } catch {
    // Not available: there is nothing to remove
  }
}

/**
 * The rest of the workout still running at `adesso`, or null: none kept,
 * already over (it is forgotten too), or unreadable.
 */
export function leggiRecupero(sessioneId, adesso, archivio = globalThis.localStorage) {
  let recupero;
  try {
    recupero = JSON.parse(archivio?.getItem(`${PREFISSO}${sessioneId}`) || 'null');
  } catch {
    recupero = null;
  }
  if (!recupero || !Number.isFinite(recupero.fine) || !Number.isFinite(recupero.durata)) return null;
  if (recupero.fine <= adesso) {
    togliRecupero(sessioneId, archivio);
    return null;
  }
  return {
    fine: recupero.fine,
    durata: recupero.durata,
    inCima: Boolean(recupero.inCima),
    avvisato: Boolean(recupero.avvisato),
    esercizio: Number.isInteger(recupero.esercizio) ? recupero.esercizio : null
  };
}
