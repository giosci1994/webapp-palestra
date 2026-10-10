// ============================================
// GymMaster — Hook media query
// ============================================

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Segue una media query CSS e restituisce true quando è soddisfatta.
 * Serve a scegliere comportamenti diversi fra telefono e desktop senza
 * duplicare i componenti (es. calendario settimanale sotto i 768px).
 *
 * useSyncExternalStore e' il modo di React per leggere un valore che cambia
 * fuori da React: niente stato copiato e risincronizzato in un effetto.
 */
export function useMediaQuery(query) {
  const iscriviti = useCallback((avvisa) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener('change', avvisa);
    return () => mq.removeEventListener('change', avvisa);
  }, [query]);

  const leggi = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;

  return useSyncExternalStore(iscriviti, leggi, () => false);
}

/** true su schermi da telefono (sotto il breakpoint md di Tailwind). */
export const useTelefono = () => useMediaQuery('(max-width: 767px)');
