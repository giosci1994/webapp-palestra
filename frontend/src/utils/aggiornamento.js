// ============================================
// GymMaster — Switching to a new version of the app
// ============================================

/**
 * Loads the new version: asks the service worker to update, empties the
 * caches and reloads the page. The service worker is not unregistered: with it
 * the browser would also delete the push notification subscription, and every
 * release would turn them off for everyone.
 */
export async function aggiornaApp(ambiente = globalThis) {
  try {
    const serviceWorker = ambiente.navigator?.serviceWorker;
    if (serviceWorker) {
      const registrazioni = await serviceWorker.getRegistrations();
      await Promise.all(registrazioni.map(registrazione => registrazione.update().catch(() => {})));
      for (const registrazione of registrazioni) registrazione.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
    // Without caches the service worker takes the files from the network: the
    // reloaded page is the new one even if the new service worker is not
    // active yet
    if (ambiente.caches) {
      const nomi = await ambiente.caches.keys();
      await Promise.all(nomi.map(nome => ambiente.caches.delete(nome)));
    }
  } catch {
    // Reload anyway: the new page tries again
  }
  ambiente.location.reload();
}
