// ============================================
// GymMaster — Hook Timer Recupero
// Countdown con notifica audio
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Il segnale di fine recupero: tre bip generati con la Web Audio API. Prima
 * si suonava /sounds/timer-fine.mp3, un file che non e' mai esistito: il
 * recupero finiva in silenzio, con la sola vibrazione.
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
  } catch { /* audio non disponibile: resta la vibrazione */ }
}

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

  useEffect(() => () => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);
    audioRef.current?.close().catch(() => {});
  }, []);

  const avvia = useCallback((secondi) => {
    if (intervalloRef.current) clearInterval(intervalloRef.current);

    // L'audio si prepara qui, all'avvio, che arriva sempre da un tocco
    // ("Serie completata"): senza un gesto dell'utente i browser non lo
    // lasciano partire, e a fine recupero il gesto non c'e'
    try {
      audioRef.current ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume().catch(() => {});
    } catch { /* audio non disponibile */ }

    setSecondiRimasti(secondi);
    setInCorso(true);

    intervalloRef.current = setInterval(() => {
      setSecondiRimasti(prev => {
        if (prev <= 1) {
          clearInterval(intervalloRef.current);
          intervalloRef.current = null;
          setInCorso(false);
          // Notifica audio
          suonaFine(audioRef.current);
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
