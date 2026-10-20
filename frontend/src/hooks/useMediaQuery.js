// ============================================
// GymMaster — Media query hook
// ============================================

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Follows a CSS media query and returns true when it matches.
 * Used to pick different behaviors for phone and desktop without
 * duplicating components (e.g. the weekly calendar below 768px).
 *
 * useSyncExternalStore is React's way to read a value that changes
 * outside React: no state copied and re-synced in an effect.
 */
function useMediaQuery(query) {
  const iscriviti = useCallback((avvisa) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener('change', avvisa);
    return () => mq.removeEventListener('change', avvisa);
  }, [query]);

  const leggi = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;

  return useSyncExternalStore(iscriviti, leggi, () => false);
}

/** true on phone-sized screens (below Tailwind's md breakpoint). */
export const useTelefono = () => useMediaQuery('(max-width: 767px)');
