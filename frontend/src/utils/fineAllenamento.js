// ============================================
// GymMaster — When a workout ended
// ============================================
//
// "Termina" (finish) asks what time you finished. Usually now; but whoever
// closes the app after the last set and taps "Termina" hours later finished
// back then, and a workout of hours skews durations and statistics. So the
// time proposed is the last set's when it was long ago, and the user can
// pick another one.

const MINUTO = 60 * 1000;

/** After this long without sets the end proposed is the last set, not now */
export const PAUSA_DOPO_ULTIMA_SERIE_MINUTI = 30;

/** The longest workout, as on the server (sessioni.controller.js) */
export const DURATA_MAX_MINUTI = 600;

/**
 * When the last set was logged, in milliseconds; null if none has a time
 * (sets logged before they had one).
 * @param {{ registrataIl?: string | null }[]} serie
 */
export function ultimaSerieIl(serie = []) {
  const orari = serie.map(s => (s.registrataIl ? Date.parse(s.registrataIl) : NaN)).filter(Number.isFinite);
  return orari.length ? Math.max(...orari) : null;
}

/**
 * The end proposed when "Termina" is tapped: now, or the last set if it was
 * more than PAUSA_DOPO_ULTIMA_SERIE_MINUTI minutes ago (dopoPausa).
 * @param {{ inizio: number, ultimaSerie: number | null, adesso: number }} istanti - in milliseconds
 * @returns {{ fine: number, dopoPausa: boolean }}
 */
export function fineProposta({ inizio, ultimaSerie, adesso }) {
  if (ultimaSerie != null && adesso - ultimaSerie > PAUSA_DOPO_ULTIMA_SERIE_MINUTI * MINUTO) {
    return { fine: Math.max(ultimaSerie, inizio), dopoPausa: true };
  }
  return { fine: adesso, dopoPausa: false };
}

/**
 * The instant of an end written as "HH:MM" on the phone's clock: today, or
 * yesterday for a workout that crossed midnight (started at 23:30, finished
 * at 00:40). A time still to come stays today, and erroreFine says so.
 * null if the time is not valid.
 * @param {string} ora - "HH:MM", as an <input type="time"> gives it
 * @param {number} inizio - start of the workout, in milliseconds
 * @param {number} adesso - in milliseconds
 */
export function fineDaOra(ora, inizio, adesso) {
  const parti = /^(\d{1,2}):(\d{2})$/.exec(ora || '');
  if (!parti) return null;
  const [ore, minuti] = [Number(parti[1]), Number(parti[2])];
  if (ore > 23 || minuti > 59) return null;

  const oggi = new Date(adesso);
  oggi.setHours(ore, minuti, 0, 0);
  if (oggi.getTime() <= adesso) return oggi.getTime();
  const ieri = new Date(oggi);
  ieri.setDate(ieri.getDate() - 1);
  return ieri.getTime() >= inizio ? ieri.getTime() : oggi.getTime();
}

/**
 * What is wrong with an end, or null if it is fine: 'nonValida' (missing),
 * 'prima' (before the start, or less than a minute after), 'futuro' (not
 * reached yet), 'troppoLunga' (more than DURATA_MAX_MINUTI minutes).
 */
export function erroreFine(fine, inizio, adesso) {
  if (fine == null) return 'nonValida';
  if (fine > adesso) return 'futuro';
  if (fine - inizio < MINUTO) return 'prima';
  if (fine - inizio > DURATA_MAX_MINUTI * MINUTO) return 'troppoLunga';
  return null;
}
