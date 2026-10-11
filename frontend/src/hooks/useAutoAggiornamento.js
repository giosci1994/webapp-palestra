// ============================================
// GymMaster — Hook Auto-Aggiornamento
// Controlla periodicamente se c'è una nuova versione
// e forza l'aggiornamento automatico per tutti i client
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { aggiornaApp } from '../utils/aggiornamento.js';

// Versione corrente iniettata al build time
const VERSIONE_CORRENTE = __APP_VERSION__;

// Ogni 2 minuti controlla se c'è una nuova versione
const INTERVALLO_CHECK = 2 * 60 * 1000;

// Durante un allenamento non si ricarica: si aspetta che finisca
const inAllenamento = () => /^\/allenamento\/[^/]+/.test(window.location.pathname);

/**
 * Hook che monitora nuove versioni dell'app.
 * 
 * Funzionamento:
 * 1. Ogni 2 minuti scarica /version.json (no cache)
 * 2. Se la versione è diversa da quella buildata → mostra banner
 * 3. Banner dà opzione di aggiornare subito
 * 4. Al prossimo focus/visibilità della pagina → aggiorna automatico
 * 5. Se Service Worker rileva nuovo SW → forza skipWaiting + reload
 */
export function useAutoAggiornamento() {
  const [aggiornamentoDisponibile, setAggiornamentoDisponibile] = useState(false);
  const [nuovaVersione, setNuovaVersione] = useState(null);
  const intervalloRef = useRef(null);
  const haForzatoRef = useRef(false);

  const controllaVersione = useCallback(async () => {
    try {
      // Fetch con cache-busting
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

        // Auto-aggiornamento: ricarica da sola dopo qualche secondo (mostra prima
        // il banner), tranne durante un allenamento in corso per non interromperlo.
        if (!haForzatoRef.current && !inAllenamento()) {
          haForzatoRef.current = true;
          setTimeout(() => aggiornaApp(), 4000);
        }
      }
    } catch {
      // Offline o errore rete — ignora
    }
  }, []);

  // Forza aggiornamento: pulisci SW cache + reload
  const forzaAggiornamento = useCallback(async () => {
    if (haForzatoRef.current) return;
    haForzatoRef.current = true;
    await aggiornaApp();
  }, []);

  // Check periodico
  useEffect(() => {
    // Check iniziale dopo 10 secondi (lascia caricare l'app)
    const timeoutIniziale = setTimeout(controllaVersione, 10_000);

    // Check periodico
    intervalloRef.current = setInterval(controllaVersione, INTERVALLO_CHECK);

    return () => {
      clearTimeout(timeoutIniziale);
      clearInterval(intervalloRef.current);
    };
  }, [controllaVersione]);

  // Quando l'utente torna nell'app e c'è aggiornamento → forza reload
  useEffect(() => {
    if (!aggiornamentoDisponibile) return;

    const gestisciVisibilita = () => {
      // Anche qui non durante un allenamento: si torna all'app sbloccando il
      // telefono fra una serie e l'altra
      if (document.visibilityState === 'visible' && !inAllenamento()) {
        forzaAggiornamento();
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [aggiornamentoDisponibile, forzaAggiornamento]);

  // Ascolta Service Worker: se rileva nuovo SW → aggiorna
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const gestisciControllerChange = () => {
      // Nuovo SW ha preso il controllo → reload per caricare nuovi file
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
