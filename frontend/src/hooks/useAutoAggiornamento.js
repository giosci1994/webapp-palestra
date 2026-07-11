// ============================================
// GymMaster — Hook Auto-Aggiornamento
// Controlla periodicamente se c'è una nuova versione
// e forza l'aggiornamento automatico per tutti i client
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';

// Versione corrente iniettata al build time
const VERSIONE_CORRENTE = __APP_VERSION__;

// Ogni 2 minuti controlla se c'è una nuova versione
const INTERVALLO_CHECK = 2 * 60 * 1000;

// Pulisce service worker + cache e ricarica (hard reload).
async function pulisciERicarica() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        await reg.unregister();
      }
    }
    if ('caches' in window) {
      const nomi = await caches.keys();
      await Promise.all(nomi.map((n) => caches.delete(n)));
    }
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

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
        const inAllenamento = /^\/allenamento\/[^/]+/.test(window.location.pathname);
        if (!haForzatoRef.current && !inAllenamento) {
          haForzatoRef.current = true;
          setTimeout(pulisciERicarica, 4000);
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
    await pulisciERicarica();
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
      if (document.visibilityState === 'visible') {
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
