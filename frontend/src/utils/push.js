// ============================================
// GymMaster — Push notifications: browser functions
// ============================================

/** The server's VAPID key (base64url) in the format pushManager.subscribe wants */
export function chiaveInByte(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), carattere => carattere.charCodeAt(0));
}

/**
 * Do push notifications work in this browser? On iPhone and iPad only with the
 * app added to the Home Screen (iOS 16.4 and later).
 * @returns {{ supportate: boolean, motivo?: 'iphone-da-installare' | 'browser' }}
 */
export function supportoPush(ambiente = globalThis) {
  const navigatore = ambiente.navigator || {};
  if ('serviceWorker' in navigatore && 'PushManager' in ambiente && 'Notification' in ambiente) return { supportate: true };
  const apple = /iPhone|iPad|iPod/.test(navigatore.userAgent || '');
  const installata = navigatore.standalone === true || ambiente.matchMedia?.('(display-mode: standalone)').matches;
  return { supportate: false, motivo: apple && !installata ? 'iphone-da-installare' : 'browser' };
}

/**
 * This browser's push subscription, or null. Without an active service worker
 * (development, first load) navigator.serviceWorker.ready never resolves:
 * after `attesaMs` we give up.
 */
export async function iscrizioneAttuale(attesaMs = 4000) {
  if (!supportoPush().supportate) return null;
  const registrazione = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise(risolvi => setTimeout(() => risolvi(null), attesaMs))
  ]);
  return registrazione ? { registrazione, iscrizione: await registrazione.pushManager.getSubscription() } : null;
}

/**
 * On logout: this device stops receiving the push notifications of the user
 * logging out (whoever logs in next turns them back on, if they want). It must
 * be called before logging out, while the login session is still valid.
 */
export async function disiscriviDispositivo(api) {
  const attuale = await iscrizioneAttuale(1000);
  const iscrizione = attuale?.iscrizione;
  if (!iscrizione) return;
  await api.delete('/notifiche/push/iscrizione', { endpoint: iscrizione.endpoint }).catch(() => {});
  await iscrizione.unsubscribe().catch(() => {});
}

/** The promise, or an error with `messaggio` if it does not settle within `ms` */
export function entro(promessa, ms, messaggio) {
  let timer;
  const scaduta = new Promise((_, rifiuta) => { timer = setTimeout(() => rifiuta(new Error(messaggio)), ms); });
  return Promise.race([promessa, scaduta]).finally(() => clearTimeout(timer));
}
