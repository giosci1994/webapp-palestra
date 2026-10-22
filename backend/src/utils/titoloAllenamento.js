// ============================================
// GymMaster — The name of a workout
// ============================================

import { t } from '../i18n/index.js';

/**
 * The name a workout shows: its plan's; for a free workout (two merged into
 * one, or done with a plan that was then deleted) its own, or "Free workout".
 * @param {{ scheda?: { titolo: string } | null, titolo?: string | null }} sessione
 * @param {string} [lingua] - for a text going to another user; the request's by default
 */
export function titoloAllenamento(sessione, lingua) {
  return sessione.scheda?.titolo ?? sessione.titolo ?? t('sessioniController.allenamentoLibero', {}, lingua);
}
