// A page with tabs taking part in the swipe between pages
// (componenti/layout/PaginaSfogliabile.jsx provides SchedeContesto).

import { createContext, useContext, useEffect, useLayoutEffect } from 'react';
import { useResolvedPath } from 'react-router-dom';

// The registered tabs of the page shown: { percorso, indice, conteggio, progresso, x, onCambia }
export const SchedeContesto = createContext(null);

/**
 * A page with tabs takes part in the swipe: the swipe moves through its tabs
 * before moving to the next page. `schede`: { indice, conteggio, progresso
 * (the island's motion value), x (the panel's motion value), onCambia(i) }.
 */
export function useSchedeSfogliabili(schede) {
  const registroRef = useContext(SchedeContesto);
  // The page's own path (frozen in its route), not the current location: a
  // page leaving with the transition must not take the place of the new one
  const { pathname } = useResolvedPath('.');
  useLayoutEffect(() => {
    if (registroRef) registroRef.current = { ...schede, percorso: pathname };
  });
  useEffect(() => () => {
    if (registroRef?.current?.percorso === pathname) registroRef.current = null;
  }, [registroRef, pathname]);
}
