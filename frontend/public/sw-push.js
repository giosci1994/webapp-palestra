// ============================================
// GymMaster — Notifiche push nel service worker
// ============================================
//
// Incluso nel service worker generato da vite-plugin-pwa (vite.config.js,
// workbox.importScripts). Mostra le notifiche che il server manda
// (backend/src/services/push.service.js) anche ad app chiusa o a schermo
// bloccato. Con l'app aperta davanti agli occhi non mostra niente: ci pensano
// la campanella, la chat e il timer.

self.addEventListener('push', (evento) => {
  let dati = {};
  try { dati = evento.data ? evento.data.json() : {}; } catch { /* testo semplice: si usa il titolo predefinito */ }

  evento.waitUntil((async () => {
    // "sempre": la notifica di prova, che si manda proprio dall'app aperta
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!dati.sempre && finestre.some(finestra => finestra.visibilityState === 'visible')) return;

    await self.registration.showNotification(dati.titolo || 'GymMaster', {
      body: dati.messaggio || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Stesso tag: la nuova sostituisce la vecchia (un recupero, una conversazione)
      tag: dati.tag || undefined,
      renotify: Boolean(dati.tag),
      vibrate: [200, 100, 200],
      data: { percorso: dati.percorso || '/' }
    });
  })());
});

// Tocco sulla notifica: apre l'app sulla pagina giusta, riusando la finestra se c'e'
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const indirizzo = new URL(evento.notification.data?.percorso || '/', self.location.origin).href;

  evento.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const finestra = finestre.find(f => new URL(f.url).origin === self.location.origin);
    if (finestra) {
      await finestra.focus();
      if ('navigate' in finestra) await finestra.navigate(indirizzo).catch(() => {});
      return;
    }
    await self.clients.openWindow(indirizzo);
  })());
});
