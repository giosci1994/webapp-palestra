// ============================================
// GymMaster — Hook media query
// ============================================

import { useState, useEffect } from 'react';

/**
 * Segue una media query CSS e restituisce true quando è soddisfatta.
 * Serve a scegliere comportamenti diversi fra telefono e desktop senza
 * duplicare i componenti (es. calendario settimanale sotto i 768px).
 */
export function useMediaQuery(query) {
  const [attiva, setAttiva] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const aggiorna = (e) => setAttiva(e.matches);
    setAttiva(mq.matches);
    mq.addEventListener('change', aggiorna);
    return () => mq.removeEventListener('change', aggiorna);
  }, [query]);

  return attiva;
}

/** true su schermi da telefono (sotto il breakpoint md di Tailwind). */
export const useTelefono = () => useMediaQuery('(max-width: 767px)');
