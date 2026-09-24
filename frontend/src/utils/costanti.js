// ============================================
// GymMaster — Costanti e Mapping
// ============================================

/** Mapping gruppi muscolari → emoji + colore */
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
 * Scala per la mappa muscolare: quante serie ha ricevuto un muscolo.
 * Una sola tinta (quella dell'accento) con luminosita' crescente: su fondo
 * scuro il poco si confonde con lo sfondo, il tanto si accende. Gradini in
 * OKLCH L 0.42 → 0.83, validati come scala ordinata sulla superficie delle
 * card (#0a0a14): luminosita' monotona, salto minimo 0.06 fra gradini, il
 * gradino piu' scuro a 2.2:1 dallo sfondo.
 */
export const SCALA_ALLENAMENTO = ['#523b8c', '#704cc5', '#9060fb', '#aa8fff', '#c9bdfe'];

/** Muscolo mai allenato: grigio neutro, si ritira dietro la scala. */
export const COLORE_NON_ALLENATO = '#282734';

/** Gradino 1-5 della scala per un numero di serie (0: mai allenato). */
export function gradinoAllenamento(serie, massimo) {
  if (!serie || !massimo) return 0;
  return Math.min(SCALA_ALLENAMENTO.length, Math.max(1, Math.ceil(SCALA_ALLENAMENTO.length * serie / massimo)));
}

/** Mapping livelli */
export const LIVELLI = {
  BASE: { label: 'Base', colore: 'successo' },
  INTERMEDIO: { label: 'Intermedio', colore: 'avviso' },
  AVANZATO: { label: 'Avanzato', colore: 'pericolo' }
};

/** Mapping ruoli */
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
