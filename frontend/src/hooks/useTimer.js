// ============================================
// GymMaster — Hook Timer Recupero
// Countdown con notifica audio
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook per il timer di recupero tra le serie.
 * Supporta countdown, pausa e notifica audio al termine.
 *
 * @returns {{ secondiRimasti, inCorso, avvia, pausa, resetta, percentuale }}
 */
export function useTimer() {
  const [secondiRimasti, setSecondiRimasti] = useState(0);
  const [inCorso, setInCorso] = useState(false);
  const intervalloRef = useRef(null);
  const audioRef = useRef(null);

  // Pre-carica l'audio
  useEffect(() => {
    audioRef.current = new Audio('/sounds/timer-fine.mp3');
    audioRef.current.volume = 0.7;
    return () => {
      if (intervalloRef.current) clearInterval(intervalloRef.current);
    };
  }, []);

  const avvia = useCallback((secondi) => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);

    setSecondiRimasti(secondi);
    setInCorso(true);

    intervalloRef.current = setInterval(() => {
      setSecondiRimasti(prev => {
        if (prev <= 1) {
          clearInterval(intervalloRef.current);
          intervalloRef.current = null;
          setInCorso(false);
          // Notifica audio
          try {
            audioRef.current?.play();
          } catch { /* ignore autoplay block */ }
          // Vibrazione (se supportata)
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
 * Formatta secondi in MM:SS
 */
export function formattaTempo(secondi) {
  const min = Math.floor(secondi / 60);
  const sec = secondi % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
