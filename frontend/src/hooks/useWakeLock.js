// ============================================
// GymMaster — Hook Wake Lock
// Mantiene lo schermo acceso durante il workout
// Riacquisisce il lock automaticamente al ritorno
// da un'altra app (visibilitychange)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook per la Screen Wake Lock API.
 * Mantiene lo schermo acceso durante l'uso in palestra.
 *
 * NOTA: Il browser rilascia automaticamente il wake lock quando
 * l'utente cambia app/tab. Questo hook lo riacquisisce
 * automaticamente quando l'utente torna nell'app.
 *
 * @returns {{ attivo, attiva, disattiva, supportato }}
 */
export function useWakeLock() {
  const [attivo, setAttivo] = useState(false);
  const [supportato] = useState(() => 'wakeLock' in navigator);
  const lockRef = useRef(null);
  // Traccia se l'utente VUOLE il wake lock attivo.
  // Separato da 'attivo' perché il browser rilascia il lock
  // al cambio app, ma l'utente non ha chiesto di disattivarlo.
  const richiestoRef = useRef(false);

  const acquisiciLock = useCallback(async () => {
    if (!supportato) return;
    // Non riacquisire se ne abbiamo già uno attivo
    if (lockRef.current) return;

    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      setAttivo(true);

      lockRef.current.addEventListener('release', () => {
        lockRef.current = null;
        setAttivo(false);
        // NON modifichiamo richiestoRef qui:
        // il release avviene automaticamente al cambio app,
        // ma l'utente non ha chiesto di disattivare il lock
      });
    } catch (err) {
      console.warn('Wake Lock non disponibile:', err.message);
    }
  }, [supportato]);

  const attiva = useCallback(async () => {
    richiestoRef.current = true;
    await acquisiciLock();
  }, [acquisiciLock]);

  const disattiva = useCallback(async () => {
    richiestoRef.current = false;
    if (lockRef.current) {
      await lockRef.current.release();
      lockRef.current = null;
      setAttivo(false);
    }
  }, []);

  // Riattiva automaticamente quando l'utente torna nell'app
  useEffect(() => {
    const gestisciVisibilita = () => {
      // Riacquisisce SOLO se l'utente aveva richiesto il lock
      if (document.visibilityState === 'visible' && richiestoRef.current) {
        acquisiciLock();
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [acquisiciLock]);

  // Cleanup: rilascia il lock quando il componente si smonta
  useEffect(() => {
    return () => {
      richiestoRef.current = false;
      if (lockRef.current) {
        lockRef.current.release();
      }
    };
  }, []);

  return { attivo, attiva, disattiva, supportato };
}
