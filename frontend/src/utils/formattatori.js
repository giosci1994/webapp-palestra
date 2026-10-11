// ============================================
// GymMaster — Formatters
// Dates, numbers, durations and names, in the app's current language
// ============================================

import { linguaCorrente, localeCorrente, traduci } from '../i18n/index.js';

/**
 * Formats an ISO date the way the current language writes it.
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
  return new Date(data).toLocaleDateString(localeCorrente(), opzioni);
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
 * Formats a date in relative form ("2h ago"), then as a date after a week.
 */
export function formattaDataRelativa(data) {
  if (!data) return '—';
  const ora = new Date();
  const diff = ora - new Date(data);
  const minuti = Math.floor(diff / 60000);
  const ore = Math.floor(diff / 3600000);
  const giorni = Math.floor(diff / 86400000);

  if (minuti < 1) return traduci('comune.tempo.adesso');
  if (minuti < 60) return traduci('comune.tempo.minutiFa', { count: minuti });
  if (ore < 24) return traduci('comune.tempo.oreFa', { count: ore });
  if (giorni < 7) return traduci('comune.tempo.giorniFa', { count: giorni });
  return formattaData(data);
}

/**
 * Formats a number the way the current language writes it: in Italian a
 * decimal comma, and a thousands separator from five digits up (1520, but
 * 15.200); in English 1,520 and 12.5.
 */
export function formattaNumero(n) {
  if (n == null) return '0';
  return n.toLocaleString(localeCorrente());
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
 * Name of the exercise to show, in the current language.
 *
 * The imported catalog has English names and `nomeIt` with the translation;
 * the hand-curated one has the Italian name in `nome`, often with the English
 * one in brackets ("Lat Machine (Lat Pulldown)"), and an empty `nomeIt`.
 * - In Italian: the Italian name whenever there is one.
 * - In English: the catalog's English name; for a curated exercise the name
 *   in brackets, if there is one, otherwise its name as it is.
 */
export function nomeEsercizio(esercizio) {
  if (!esercizio) return '';
  if (linguaCorrente() === 'it') return esercizio.nomeIt || esercizio.nome || '';
  if (esercizio.nomeIt) return esercizio.nome || '';
  const traParentesi = esercizio.nome?.match(/\(([^)]+)\)\s*$/);
  return traParentesi ? traParentesi[1].trim() : esercizio.nome || '';
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
 * Original English name, to show as a secondary line under an Italian one.
 * Null when it would repeat the main name: in English, or with no translation.
 */
export function nomeEsercizioOriginale(esercizio) {
  if (!esercizio?.nomeIt || linguaCorrente() !== 'it') return null;
  return esercizio.nome || null;
}

/** A text from a translation file, or the value itself when it has none */
const traduciNome = (namespace, valore) => {
  if (!valore) return valore ?? '';
  const chiave = `${namespace}.${valore}`;
  const testo = traduci(chiave);
  return testo === chiave ? valore : testo;
};

/**
 * Name of a muscle group in the current language. Groups are stored in
 * Italian ("Petto", "Gran Dorsale"); one without a translation shows as it is.
 */
export const nomeGruppo = gruppo => traduciNome('gruppi', gruppo);

/** Name of a piece of equipment in the current language (stored in Italian) */
export const nomeAttrezzatura = nome => traduciNome('attrezzi', nome);
