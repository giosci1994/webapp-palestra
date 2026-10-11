// ============================================
// GymMaster — Auto-update hook
// Periodically checks whether there is a new version
// and forces the automatic update on every client
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { aggiornaApp } from '../utils/aggiornamento.js';

// Current version, injected at build time
const VERSIONE_CORRENTE = __APP_VERSION__;

// Check for a new version every 2 minutes
const INTERVALLO_CHECK = 2 * 60 * 1000;

// No reload during a workout: wait for it to end
const inAllenamento = () => /^\/allenamento\/[^/]+/.test(window.location.pathname);

/**
 * Hook that watches for new versions of the app.
 *
 * How it works:
 * 1. Every 2 minutes (the first time after 10 seconds) it downloads
 *    /version.json, bypassing the cache
 * 2. If the version differs from the built one → show the banner
 * 3. 4 seconds later it updates on its own (utils/aggiornamento.js asks the
 *    waiting Service Worker to skip waiting, then reloads), except during a
 *    workout
 * 4. Coming back to the app (visibilitychange) with an update pending →
 *    update, again not during a workout
 * 5. When a new Service Worker takes control (controllerchange) → reload
 */
export function useAutoAggiornamento() {
  const [aggiornamentoDisponibile, setAggiornamentoDisponibile] = useState(false);
  const [nuovaVersione, setNuovaVersione] = useState(null);
  const intervalloRef = useRef(null);
  const haForzatoRef = useRef(false);

  const controllaVersione = useCallback(async () => {
    try {
      // Fetch with cache-busting
      const risposta = await fetch(`/version.json?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!risposta.ok) return;

      const dati = await risposta.json();

      if (dati.versione && dati.versione !== VERSIONE_CORRENTE) {
        console.log(`[AutoUpdate] Nuova versione disponibile: ${dati.versione} (attuale: ${VERSIONE_CORRENTE})`);
        setNuovaVersione(dati.versione);
        setAggiornamentoDisponibile(true);

        // Auto-update: reload on its own after a few seconds (show the banner
        // first), except during a workout in progress, so as not to interrupt it.
        if (!haForzatoRef.current && !inAllenamento()) {
          haForzatoRef.current = true;
          setTimeout(() => aggiornaApp(), 4000);
        }
      }
    } catch {
      // Offline or network error — ignore
    }
  }, []);

  // Force the update: clear the SW cache + reload
  const forzaAggiornamento = useCallback(async () => {
    if (haForzatoRef.current) return;
    haForzatoRef.current = true;
    await aggiornaApp();
  }, []);

  // Periodic check
  useEffect(() => {
    // First check after 10 seconds (let the app load)
    const timeoutIniziale = setTimeout(controllaVersione, 10_000);

    // Periodic check
    intervalloRef.current = setInterval(controllaVersione, INTERVALLO_CHECK);

    return () => {
      clearTimeout(timeoutIniziale);
      clearInterval(intervalloRef.current);
    };
  }, [controllaVersione]);

  // When the user comes back to the app and there is an update → force reload
  useEffect(() => {
    if (!aggiornamentoDisponibile) return;

    const gestisciVisibilita = () => {
      // Not during a workout here either: people come back to the app by
      // unlocking the phone between one set and the next
      if (document.visibilityState === 'visible' && !inAllenamento()) {
        forzaAggiornamento();
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [aggiornamentoDisponibile, forzaAggiornamento]);

  // Listen to the Service Worker: if it detects a new SW → update
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const gestisciControllerChange = () => {
      // A new SW took control → reload to load the new files
      if (!haForzatoRef.current) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', gestisciControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', gestisciControllerChange);
  }, []);

  return {
    aggiornamentoDisponibile,
    nuovaVersione,
    versioneCorrente: VERSIONE_CORRENTE,
    forzaAggiornamento
  };
}
