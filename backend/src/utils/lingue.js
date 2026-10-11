// ============================================
// GymMaster — App languages
// ============================================
//
// English is the base language: whatever has no translation falls back to
// it. A user's `lingua` is the one chosen in Profile; null means the app
// follows the phone's language.

import { ErroreValidazione } from './errori.js';

export const LINGUE = ['en', 'it'];
export const LINGUA_BASE = 'en';

/**
 * A language for Utente.lingua: one of LINGUE, or null (empty, null) to
 * follow the phone. Anything else is a validation error.
 */
export function leggiLingua(valore) {
  if (valore === null || valore === '') return null;
  if (LINGUE.includes(valore)) return valore;
  throw new ErroreValidazione(`Lingua non supportata: usa ${LINGUE.join(', ')}`);
}
