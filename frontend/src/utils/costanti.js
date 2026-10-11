// ============================================
// GymMaster — Constants and mappings
// ============================================

/** Muscle group mapping → emoji + color */
export const GRUPPI_MUSCOLARI = {
  'Petto': { emoji: '🫁', colore: '#EF4444' },
  'Schiena': { emoji: '🔙', colore: '#3B82F6' },
  'Dorsali': { emoji: '🔙', colore: '#2563EB' },
  'Spalle': { emoji: '💪', colore: '#F59E0B' },
  'Bicipiti': { emoji: '💪', colore: '#10B981' },
  'Tricipiti': { emoji: '🦾', colore: '#8B5CF6' },
  'Quadricipiti': { emoji: '🦵', colore: '#EC4899' },
  'Femorali': { emoji: '🦵', colore: '#DB2777' },
  'Glutei': { emoji: '🍑', colore: '#D946EF' },
  'Polpacci': { emoji: '🦶', colore: '#14B8A6' },
  'Addominali': { emoji: '🧱', colore: '#06B6D4' },
  'Core': { emoji: '🧱', colore: '#0891B2' },
  'Trapezio': { emoji: '🔺', colore: '#6366F1' },
  'Avambracci': { emoji: '✊', colore: '#84CC16' },
  "Flessori dell'Anca": { emoji: '🔄', colore: '#F97316' },
  'Abduttori': { emoji: '↔️', colore: '#A855F7' },
  'Adduttori': { emoji: '↔️', colore: '#7C3AED' },
  'Tibiali': { emoji: '🦿', colore: '#0D9488' },
  'Cardiovascolare': { emoji: '❤️', colore: '#EF4444' },
  'Funzionale': { emoji: '⚡', colore: '#F97316' },
  'Tutto il corpo': { emoji: '🏋️', colore: '#6B7280' },
};


/**
 * Scale for the muscle map: how many sets a muscle has received.
 * A single hue (the accent one) with increasing lightness: on a dark
 * background little blends into the background, a lot lights up. Steps in
 * OKLCH L 0.42 → 0.83, validated as an ordered scale on the card surface
 * (#0a0a14): monotonic lightness, minimum jump of 0.06 between steps, the
 * darkest step at 2.2:1 from the background.
 */
export const SCALA_ALLENAMENTO = ['#523b8c', '#704cc5', '#9060fb', '#aa8fff', '#c9bdfe'];

/** Muscle never trained: neutral gray, it recedes behind the scale. */
export const COLORE_NON_ALLENATO = '#282734';

/** Step 1-5 of the scale for a number of sets (0: never trained). */
export function gradinoAllenamento(serie, massimo) {
  if (!serie || !massimo) return 0;
  return Math.min(SCALA_ALLENAMENTO.length, Math.max(1, Math.ceil(SCALA_ALLENAMENTO.length * serie / massimo)));
}

/**
 * "Recovery" view of the muscle map: how long since you last trained a muscle.
 * Colors validated as a categorical palette on the card surface
 * (#0a0a14): lightness within the band for a dark background, minimum chroma,
 * separation also for people with color vision deficiency (worst pair
 * amber/green, deltaE 8.9) and contrast >= 3:1. "Trascurato" (neglected) is a
 * cool blue: a second warm color next to the amber would be confused with it.
 */
export const STATI_RECUPERO = {
  recupero: { etichetta: 'In recupero', dettaglio: '< 48 ore', colore: '#ca8402' },
  pronto: { etichetta: 'Pronto', dettaglio: '2-14 giorni', colore: '#02a573' },
  trascurato: { etichetta: 'Trascurato', dettaglio: '> 14 giorni', colore: '#5066a3' },
};

/**
 * Recovery state of a muscle group; null if never trained.
 * Only direct work causes fatigue: a muscle involved as a secondary one (the
 * quads in knee raises) is not "in recupero" (recovering), but that work is
 * enough not to count it as neglected.
 * @param {string|null} ultimaData - last time it worked, even as a secondary muscle
 * @param {string|null} ultimaDataDiretta - last time as a primary muscle
 */
export function statoRecupero(ultimaData, ultimaDataDiretta, adesso) {
  if (!ultimaData) return null;
  const ore = (data) => (adesso - new Date(data).getTime()) / 3600000;
  if (ultimaDataDiretta && ore(ultimaDataDiretta) < 48) return 'recupero';
  if (ore(ultimaData) <= 14 * 24) return 'pronto';
  return 'trascurato';
}

/** Level mapping */
export const LIVELLI = {
  BASE: { label: 'Base', colore: 'successo' },
  INTERMEDIO: { label: 'Intermedio', colore: 'avviso' },
  AVANZATO: { label: 'Avanzato', colore: 'pericolo' }
};

/** Role mapping */
export const RUOLI = {
  UTENTE: { label: 'Utente', colore: 'accent' },
  PERSONAL_TRAINER: { label: 'Personal Trainer', colore: 'avviso' },
  SUPERADMIN: { label: 'Super Admin', colore: 'pericolo' }
};

/** RPE scale labels */
export const RPE_LABELS = {
  1: 'Riscaldamento',
  2: 'Molto leggero',
  3: 'Leggero',
  4: 'Moderato',
  5: 'Medio',
  6: 'Un po\' faticoso',
  7: 'Faticoso',
  8: 'Molto faticoso',
  9: 'Quasi al massimo',
  10: 'Massimale'
};

/**
 * Beyond this duration a workout was almost certainly left open by mistake
 * (app closed without "Termina", closed the next morning): the history flags
 * it and offers to fix it.
 */
export const DURATA_SOSPETTA_MINUTI = 240;

/** How long after the end a workout closed by mistake can be resumed (same as in the backend) */
export const RIAPERTURA_MAX_MINUTI = 30;
