// ============================================
// GymMaster — Route persistence hook
// Saves the current route in localStorage
// to restore it after a reload/tab kill
// ============================================
// NOTE: uses localStorage (not sessionStorage) because on mobile
// the browser evicts tabs from RAM, wiping sessionStorage.
// localStorage survives tab kills, browser closes and app switches.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CHIAVE_ROTTA = 'gymmaster_ultima_rotta';

// Routes that must NOT be saved (public pages). The download and legal pages
// too: their "Back to the app" link goes to "/", which restores the saved
// route, so saving them would bring the user straight back to the same page
// (and the Android app, which shares Chrome's storage, would open on /scarica)
export const ROTTE_ESCLUSE = ['/login', '/registrazione', '/scarica', '/privacy', '/cookie-policy', '/termini'];

/**
 * Hook that tracks the current route and saves it in localStorage.
 * Used in App.jsx to keep the user's place
 * when the browser reloads the page or evicts the tab after inactivity.
 */
export function useRottaPersistente() {
  const location = useLocation();

  useEffect(() => {
    if (!ROTTE_ESCLUSE.includes(location.pathname)) {
      localStorage.setItem(CHIAVE_ROTTA, location.pathname);
    }
  }, [location.pathname]);
}

/**
 * Gets the last saved route from localStorage.
 * Returns null if no route has been saved, or if it is an excluded one.
 */
export function ottieniUltimaRotta() {
  const rotta = localStorage.getItem(CHIAVE_ROTTA);
  // A route saved by an older version that is now excluded is ignored
  return rotta && !ROTTE_ESCLUSE.includes(rotta) ? rotta : null;
}
