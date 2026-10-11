// ============================================
// GymMaster — Rest timer hook
// Countdown with an audio alert
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react';

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

/**
 * Hook for the rest timer between sets.
 * Supports countdown, pause and an audio alert at the end.
 *
 * @returns {{ secondiRimasti, inCorso, avvia, pausa, resetta, percentuale }}
 */
export function useTimer() {
  const [secondiRimasti, setSecondiRimasti] = useState(0);
  const [inCorso, setInCorso] = useState(false);
  const intervalloRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => () => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);
    audioRef.current?.close().catch(() => {});
  }, []);

  const avvia = useCallback((secondi) => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);

    // The audio is prepared here, at start, which always comes from a tap
    // ("Serie completata"): without a user gesture browsers do not let it
    // start, and at the end of the rest there is no gesture
    try {
      audioRef.current ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume().catch(() => {});
    } catch { /* audio not available */ }

    setSecondiRimasti(secondi);
    setInCorso(true);

    intervalloRef.current = setInterval(() => {
      setSecondiRimasti(prev => {
        if (prev <= 1) {
          clearInterval(intervalloRef.current);
          intervalloRef.current = null;
          setInCorso(false);
          // Audio alert
          suonaFine(audioRef.current);
          // Vibration (if supported)
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const pausa = useCallback(() => {
    if (intervalloRef.current) {
      clearInterval(intervalloRef.current);
      intervalloRef.current = null;
      setInCorso(false);
    }
  }, []);

  const resetta = useCallback(() => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);
    intervalloRef.current = null;
    setSecondiRimasti(0);
    setInCorso(false);
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
