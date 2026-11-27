// ============================================
// GymMaster — App themes
// ============================================
//
// A user's `tema` is the one chosen in Profile: "chiaro" (light) or "scuro"
// (dark); null means the app follows the phone's light or dark mode.

import { ErroreValidazione } from './errori.js';
import { t } from '../i18n/index.js';

export const TEMI = ['chiaro', 'scuro'];

/**
 * A theme for Utente.tema: one of TEMI, or null (empty, null, "auto") to
 * follow the phone. Anything else is a validation error.
 */
export function leggiTema(valore) {
  if (valore === null || valore === '' || valore === 'auto') return null;
  if (TEMI.includes(valore)) return valore;
  throw new ErroreValidazione(t('temi.nonSupportato', { temi: TEMI.join(', ') }));
}
