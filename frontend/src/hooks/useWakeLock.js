// ============================================
// GymMaster — Wake Lock hook
// Keeps the screen on during the workout
// Re-acquires the lock automatically when coming back
// from another app (visibilitychange)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for the Screen Wake Lock API.
 * Keeps the screen on while the app is used at the gym.
 *
 * NOTE: The browser releases the wake lock automatically when
 * the user switches app/tab. This hook re-acquires it
 * automatically when the user comes back to the app.
 *
 * @returns {{ attivo, attiva, disattiva, supportato }}
 */
export function useWakeLock() {
  const [attivo, setAttivo] = useState(false);
  const [supportato] = useState(() => 'wakeLock' in navigator);
  const lockRef = useRef(null);
  // Tracks whether the user WANTS the wake lock on.
  // Separate from 'attivo' because the browser releases the lock
  // on app switch, but the user did not ask to turn it off.
  const richiestoRef = useRef(false);

  const acquisiciLock = useCallback(async () => {
    if (!supportato) return;
    // Do not re-acquire if we already have an active one
    if (lockRef.current) return;

    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      setAttivo(true);

      lockRef.current.addEventListener('release', () => {
        lockRef.current = null;
        setAttivo(false);
        // We do NOT change richiestoRef here:
        // the release happens automatically on app switch,
        // but the user did not ask to turn the lock off
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

  // Turn it back on automatically when the user comes back to the app
  useEffect(() => {
    const gestisciVisibilita = () => {
      // Re-acquire ONLY if the user had asked for the lock
      if (document.visibilityState === 'visible' && richiestoRef.current) {
        acquisiciLock();
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [acquisiciLock]);

  // Cleanup: release the lock when the component unmounts
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
