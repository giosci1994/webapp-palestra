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
