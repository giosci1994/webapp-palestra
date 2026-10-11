// ============================================
// GymMaster — Formatters
// Dates, numbers, durations
// ============================================

/**
 * Formats an ISO date in Italian format.
 * @param {string} data - ISO date string
 * @param {boolean} conOra - Also show the time
 */
export function formattaData(data, conOra = false) {
  if (!data) return '—';
  const opzioni = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(conOra && { hour: '2-digit', minute: '2-digit' })
  };
  return new Date(data).toLocaleDateString('it-IT', opzioni);
}

/** "YYYY-MM-DD" from a local date, without going through UTC (which would shift the day). */
export function aStringaData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week the date falls in, at local midnight. */
export function lunediDi(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** "HH:MM" from a local date, the format of <input type="time"> fields. */
export function aStringaOra(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Formats a date in relative form (e.g. "2 ore fa", 2 hours ago).
 */
export function formattaDataRelativa(data) {
  if (!data) return '—';
  const ora = new Date();
  const diff = ora - new Date(data);
  const minuti = Math.floor(diff / 60000);
  const ore = Math.floor(diff / 3600000);
  const giorni = Math.floor(diff / 86400000);

  if (minuti < 1) return 'ora';
  if (minuti < 60) return `${minuti} min fa`;
  if (ore < 24) return `${ore}h fa`;
  if (giorni < 7) return `${giorni}g fa`;
  return formattaData(data);
}

/**
 * Formats a number the Italian way (it-IT): decimal comma, and a thousands
 * separator from five digits up (1520, but 15.200).
 */
export function formattaNumero(n) {
  if (n == null) return '0';
  return n.toLocaleString('it-IT');
}

/**
 * Formats the weight (with decimals only when needed).
 */
export function formattaPeso(kg) {
  if (kg == null) return '0';
  return kg % 1 === 0 ? `${kg}` : `${kg.toFixed(1)}`;
}

/**
 * Formats a duration in minutes in a readable form.
 */
export function formattaDurata(minuti) {
  if (!minuti) return '—';
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Name of the exercise to show.
 *
 * The imported catalog has English names and `nomeIt` with the translation;
 * the hand-curated one already has the Italian name in `nome` and an empty `nomeIt`.
 * Here the Italian one is always chosen when there is one.
 */
export function nomeEsercizio(esercizio) {
  if (!esercizio) return '';
  return esercizio.nomeIt || esercizio.nome || '';
}

/**
 * Is an exercise from the history ({ esercizio, serie }) shown as cardio,
 * with minutes and level instead of weight and reps? The muscle group counts,
 * but so does how the sets were logged: the workout also logs in minutes the
 * exercises done on a cardio machine.
 */
export function eCardioNelloStorico({ esercizio, serie }) {
  return esercizio?.gruppoMuscoloPrimario?.toLowerCase() === 'cardio' || serie.some(s => s.durataMinuti > 0);
}

/**
 * Original English name, to show as a secondary line.
 * Returns null when it matches the main name, so as not to repeat it.
 */
export function nomeEsercizioOriginale(esercizio) {
  if (!esercizio?.nomeIt) return null;
  return esercizio.nome || null;
}
