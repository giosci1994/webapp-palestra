// ============================================
// GymMaster — Rest timer hook
// Countdown with an audio alert
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { secondiAllaFine, statoRecupero } from '../utils/recupero.js';

/**
 * The end-of-rest signal: three beeps generated with the Web Audio API. It
 * used to play /sounds/timer-fine.mp3, a file that never existed: the rest
 * ended in silence, with only the vibration.
 */
function suonaFine(contesto) {
  if (!contesto) return;
  try {
    for (const inizio of [0, 0.25, 0.5]) {
      const oscillatore = contesto.createOscillator();
      const volume = contesto.createGain();
      const t = contesto.currentTime + inizio;
      oscillatore.frequency.value = 880;
      volume.gain.setValueAtTime(0.0001, t);
      volume.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      oscillatore.connect(volume).connect(contesto.destination);
      oscillatore.start(t);
      oscillatore.stop(t + 0.2);
    }
  } catch { /* audio not available: the vibration remains */ }
}

/** How often the countdown is updated: a few times a second, so a new second shows on time */
const AGGIORNAMENTO_MS = 250;

/**
 * Hook for the rest timer between sets.
 *
 * The seconds left come from the moment the rest ends (utils/recupero.js):
 * with the app in the background or the screen locked the phone slows down
 * or freezes timers, and back in the app the countdown is right at once,
 * instead of going on from where it had stopped. A beep and a vibration
 * right at the end; back in the app later, the rest is simply over.
 *
 * @param {number | null} [fineIniziale] - the end of a rest that was already
 *   running (kept on the phone while the app was closed), in milliseconds
 * @returns {{ secondiRimasti, inCorso, avvia, pausa, resetta, percentuale }}
 */
export function useTimer(fineIniziale = null) {
  const [fineRecupero, setFineRecupero] = useState(fineIniziale);
  const [secondiRimasti, setSecondiRimasti] = useState(() => (fineIniziale ? secondiAllaFine(fineIniziale, Date.now()) : 0));
  const inCorso = fineRecupero != null;
  const audioRef = useRef(null);

  useEffect(() => () => {
    audioRef.current?.close().catch(() => {});
  }, []);

  // While a rest runs: the seconds from the real time, a few times a second
  // and right away when coming back to the app (the phone may have frozen the timer)
  useEffect(() => {
    if (fineRecupero == null) return;
    const aggiorna = () => {
      const { secondi, finito, segnale } = statoRecupero(fineRecupero, Date.now());
      setSecondiRimasti(secondi);
      if (!finito) return;
      setFineRecupero(null);
      if (segnale) {
        suonaFine(audioRef.current);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    };
    const intervallo = setInterval(aggiorna, AGGIORNAMENTO_MS);
    const tornato = () => { if (document.visibilityState === 'visible') aggiorna(); };
    document.addEventListener('visibilitychange', tornato);
    window.addEventListener('pageshow', aggiorna);
    window.addEventListener('focus', aggiorna);
    return () => {
      clearInterval(intervallo);
      document.removeEventListener('visibilitychange', tornato);
      window.removeEventListener('pageshow', aggiorna);
      window.removeEventListener('focus', aggiorna);
    };
  }, [fineRecupero]);

  /**
   * @param {number} secondi
   * @param {{ fine?: number }} [opzioni] - fine: the end in milliseconds, if already known
   */
  const avvia = useCallback((secondi, { fine } = {}) => {
    // The audio is prepared here, at start, which always comes from a tap
    // ("Serie completata"): without a user gesture browsers do not let it
    // start, and at the end of the rest there is no gesture
    try {
      audioRef.current ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume().catch(() => {});
    } catch { /* audio not available */ }

    const quando = fine ?? Date.now() + secondi * 1000;
    setSecondiRimasti(secondiAllaFine(quando, Date.now()));
    setFineRecupero(quando);
  }, []);

  /** Stops the countdown where it is */
  const pausa = useCallback(() => setFineRecupero(null), []);

  const resetta = useCallback(() => {
    setFineRecupero(null);
    setSecondiRimasti(0);
  }, []);

  const percentuale = secondiRimasti > 0
    ? Math.max(0, (secondiRimasti / (secondiRimasti + 1)) * 100)
    : 0;

  return {
    secondiRimasti,
    inCorso,
    avvia,
    pausa,
    resetta,
    percentuale
  };
}

/**
 * Formats seconds as MM:SS
 */
export function formattaTempo(secondi) {
  const min = Math.floor(secondi / 60);
  const sec = secondi % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
