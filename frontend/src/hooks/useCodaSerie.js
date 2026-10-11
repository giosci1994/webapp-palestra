// ============================================
// GymMaster — Hook for the offline set queue
// ============================================

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ascoltaCoda, leggiCoda, inviaOra, rispostaPer } from '../utils/codaSerie.js';

/**
 * The user's entries waiting to be sent to the server
 * (utils/codaSerie.js): how many there are and the time of the oldest (ISO, or null).
 */
export function useCodaSerie(utenteId) {
  const leggiQuante = useCallback(() => (utenteId ? leggiCoda(utenteId).length : 0), [utenteId]);
  const leggiDalle = useCallback(() => (utenteId ? leggiCoda(utenteId)[0]?.il ?? null : null), [utenteId]);
  const quante = useSyncExternalStore(ascoltaCoda, leggiQuante, () => 0);
  const dalle = useSyncExternalStore(ascoltaCoda, leggiDalle, () => null);
  return { quante, dalle };
}

/**
 * A queued entry: whether it is still there, and the server's response if it
 * was sent from this page (for example the records from "Termina").
 */
export function useVoceInCoda(utenteId, idVoce) {
  const leggiInCoda = useCallback(
    () => !!(utenteId && idVoce) && leggiCoda(utenteId).some(v => v.id === idVoce),
    [utenteId, idVoce]
  );
  const leggiRisposta = useCallback(() => (idVoce ? rispostaPer(idVoce) : undefined), [idVoce]);
  const inCoda = useSyncExternalStore(ascoltaCoda, leggiInCoda, () => false);
  const risposta = useSyncExternalStore(ascoltaCoda, leggiRisposta, () => undefined);
  return { inCoda, risposta };
}

/**
 * Sends the user's queue whenever possible: when the app opens, when the
 * network comes back, when the user returns to the app, and every half minute
 * while something is left (the network may be there but not answer, and
 * "online" never fires).
 */
export function useInvioCoda(utenteId) {
  useEffect(() => {
    if (!utenteId) return;
    const invia = () => {
      if (!leggiCoda(utenteId).length) return;
      inviaOra(utenteId).catch(err => console.error('Invio delle serie in coda:', err));
    };
    const tornatoNellApp = () => { if (document.visibilityState === 'visible') invia(); };

    invia();
    window.addEventListener('online', invia);
    document.addEventListener('visibilitychange', tornatoNellApp);
    const intervallo = setInterval(invia, 30 * 1000);
    return () => {
      window.removeEventListener('online', invia);
      document.removeEventListener('visibilitychange', tornatoNellApp);
      clearInterval(intervallo);
    };
  }, [utenteId]);
}
