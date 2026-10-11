// ============================================
// GymMaster — Passaggio a una versione nuova dell'app
// ============================================

/**
 * Carica la versione nuova: chiede al service worker di aggiornarsi, svuota
 * le cache e ricarica la pagina. Il service worker non si cancella: con lui
 * il browser cancellerebbe anche l'iscrizione alle notifiche push, e ogni
 * rilascio le spegnerebbe a tutti.
 */
export async function aggiornaApp(ambiente = globalThis) {
  try {
    const serviceWorker = ambiente.navigator?.serviceWorker;
    if (serviceWorker) {
      const registrazioni = await serviceWorker.getRegistrations();
      await Promise.all(registrazioni.map(registrazione => registrazione.update().catch(() => {})));
      for (const registrazione of registrazioni) registrazione.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
    // Senza cache il service worker prende i file dalla rete: la pagina
    // ricaricata e' quella nuova anche se il service worker nuovo non e'
    // ancora attivo
    if (ambiente.caches) {
      const nomi = await ambiente.caches.keys();
      await Promise.all(nomi.map(nome => ambiente.caches.delete(nome)));
    }
  } catch {
    // Si ricarica lo stesso: la pagina nuova riprova
  }
  ambiente.location.reload();
}
