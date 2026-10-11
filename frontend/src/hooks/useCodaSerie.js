// ============================================
// GymMaster — Hook coda delle serie senza rete
// ============================================

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ascoltaCoda, leggiCoda, inviaOra, rispostaPer } from '../utils/codaSerie.js';

/**
 * Le voci dell'utente che aspettano di partire verso il server
 * (utils/codaSerie.js): quante sono e l'ora della piu' vecchia (ISO, o null).
 */
export function useCodaSerie(utenteId) {
  const leggiQuante = useCallback(() => (utenteId ? leggiCoda(utenteId).length : 0), [utenteId]);
  const leggiDalle = useCallback(() => (utenteId ? leggiCoda(utenteId)[0]?.il ?? null : null), [utenteId]);
  const quante = useSyncExternalStore(ascoltaCoda, leggiQuante, () => 0);
  const dalle = useSyncExternalStore(ascoltaCoda, leggiDalle, () => null);
  return { quante, dalle };
}

/**
 * Una voce messa in coda: se e' ancora li', e la risposta del server se e'
 * partita da questa pagina (per esempio i record di "Termina").
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
 * Manda la coda dell'utente quando si puo': all'apertura dell'app, quando
 * torna la rete, quando si torna nell'app e ogni mezzo minuto finche' resta
 * qualcosa (la rete puo' esserci ma non rispondere, e "online" non arriva).
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
