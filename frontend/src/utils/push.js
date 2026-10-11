// ============================================
// GymMaster — Notifiche push: funzioni del browser
// ============================================

/** La chiave VAPID del server (base64url) nel formato di pushManager.subscribe */
export function chiaveInByte(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), carattere => carattere.charCodeAt(0));
}

/**
 * Le push funzionano in questo browser? Su iPhone e iPad solo con l'app
 * aggiunta alla schermata Home (iOS 16.4 e successivi).
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
 * L'iscrizione push di questo browser, o null. Senza service worker attivo
 * (sviluppo, primo caricamento) navigator.serviceWorker.ready non arriva mai:
 * dopo `attesaMs` si rinuncia.
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
 * Al logout: questo dispositivo smette di ricevere le push dell'utente che
 * esce (chi entra dopo le riattiva, se vuole). Va chiamata prima di uscire,
 * finche' la sessione vale ancora.
 */
export async function disiscriviDispositivo(api) {
  const attuale = await iscrizioneAttuale(1000);
  const iscrizione = attuale?.iscrizione;
  if (!iscrizione) return;
  await api.delete('/notifiche/push/iscrizione', { endpoint: iscrizione.endpoint }).catch(() => {});
  await iscrizione.unsubscribe().catch(() => {});
}

/** La promessa, o un errore con `messaggio` se non arriva entro `ms` */
export function entro(promessa, ms, messaggio) {
  let timer;
  const scaduta = new Promise((_, rifiuta) => { timer = setTimeout(() => rifiuta(new Error(messaggio)), ms); });
  return Promise.race([promessa, scaduta]).finally(() => clearTimeout(timer));
}
