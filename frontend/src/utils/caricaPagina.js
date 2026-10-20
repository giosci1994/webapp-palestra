// ============================================
// GymMaster — Pages loaded when they are opened
// ============================================

import { lazy } from 'react';
import { aggiornaApp } from './aggiornamento.js';

const CHIAVE = 'gymmaster:ricaricata-per-una-pagina';

/**
 * What to do when a page's file cannot be loaded. After a release the files
 * of the old version are gone, so an app still running the old version gets
 * a 404: it updates itself once (aggiornaApp) instead of showing an error.
 * A second failure in the same session is a real error (no network, a broken
 * build) and is thrown, for RecuperoErrori, so the app never reloads in a loop.
 * @returns {Promise<never>} a promise that never settles: the page is reloading
 */
export function quandoNonCarica(errore, ambiente = globalThis) {
  let giaAggiornata = true;
  try {
    giaAggiornata = ambiente.sessionStorage.getItem(CHIAVE) === '1';
    ambiente.sessionStorage.setItem(CHIAVE, '1');
  } catch {
    // Without sessionStorage there is no way to avoid a loop: no reload
  }
  if (giaAggiornata) throw errore;
  aggiornaApp(ambiente);
  return new Promise(() => {});
}

/** A loaded page clears the mark: the next missing file can update the app again */
function caricata(modulo, ambiente = globalThis) {
  try { ambiente.sessionStorage.removeItem(CHIAVE); } catch { /* nothing to clear */ }
  return modulo;
}

/**
 * A page loaded only when it is opened (React.lazy), in its own file: the app
 * starts with less JavaScript, and a release changes only the files of the
 * pages it touched. Render it inside a <Suspense>.
 * @param {() => Promise<{ default: import('react').ComponentType }>} importa e.g. () => import('../pagine/Chat.jsx')
 */
export function caricaPagina(importa) {
  return lazy(() => importa().then(modulo => caricata(modulo), errore => quandoNonCarica(errore)));
}
