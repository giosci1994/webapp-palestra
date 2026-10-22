// ============================================
// GymMaster — Push notifications (Web Push)
// ============================================
//
// Notifications reach the phone even with the app closed or the screen
// locked: the service worker shows them (frontend/public/sw-push.js). The
// Web Push standard does not go through paid services: the server signs
// every send with a VAPID key pair (VAPID_CHIAVE_PUBBLICA and
// VAPID_CHIAVE_PRIVATA in .env; generate them with
// `npx web-push generate-vapid-keys`). Without keys push notifications are
// off and everything else works as before.

import webpush from 'web-push';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { descriviDispositivo } from '../utils/dispositivo.js';
import { linguaDiUtenteId, traduciPer } from '../i18n/destinatario.js';

let configurate = false;

/**
 * The contact for push services: VAPID wants an https: or mailto: address.
 * The app's address is enough, if it is https (in development it is http://localhost).
 */
function contatto() {
  const { VAPID_CONTATTO, APP_URL } = process.env;
  if (VAPID_CONTATTO) return VAPID_CONTATTO;
  return APP_URL?.startsWith('https://') ? APP_URL : 'https://gymmaster.casadm.uk';
}

/** The VAPID keys from the environment, read on first use. false if missing or invalid */
function configura() {
  if (configurate) return true;
  const { VAPID_CHIAVE_PUBBLICA: pubblica, VAPID_CHIAVE_PRIVATA: privata } = process.env;
  if (!pubblica || !privata) return false;
  try {
    webpush.setVapidDetails(contatto(), pubblica, privata);
  } catch (errore) {
    logger.error({ errore: errore.message }, 'Chiavi VAPID non valide: notifiche push spente');
    return false;
  }
  configurate = true;
  return true;
}

/** The public key for pushManager.subscribe, or null if push notifications are off */
export function chiavePubblica() {
  return configura() ? process.env.VAPID_CHIAVE_PUBBLICA : null;
}

/**
 * Registers (or updates) the device that subscribed. The same browser
 * always has the same endpoint: if another user signs in on it, the
 * subscription moves to them.
 */
export function iscrivi(utenteId, { endpoint, keys }, userAgent) {
  const dati = { utenteId, p256dh: keys.p256dh, auth: keys.auth, dispositivo: descriviDispositivo(userAgent) };
  return prisma.iscrizionePush.upsert({
    where: { endpoint },
    create: { endpoint, ...dati },
    update: dati
  });
}

/** Removes the device, if it belongs to the user */
export function disiscrivi(utenteId, endpoint) {
  return prisma.iscrizionePush.deleteMany({ where: { utenteId, endpoint } });
}

/** How many of the user's devices receive push notifications */
export function contaIscrizioni(utenteId) {
  return prisma.iscrizionePush.count({ where: { utenteId } });
}

/**
 * Sends a notification to all of the user's devices. It never throws: a
 * missed push must not make the action that generated it fail.
 * @param {number} utenteId
 * @param {{ titolo: string, messaggio?: string, percorso?: string, tag?: string, urgente?: boolean, durataSecondi?: number, sempre?: boolean }} notifica
 *   tag: notifications with the same tag replace each other (a rest period, a conversation);
 *   sempre: show it even with the app open (the test one), which usually leaves it to the app;
 *   urgente: deliver right away, even to a phone in battery saver mode;
 *   durataSecondi: past this, if the phone was unreachable, it must no longer be delivered
 * @returns {Promise<number>} the devices reached
 */
export async function inviaPush(utenteId, { titolo, messaggio = '', percorso = '/', tag, urgente = false, durataSecondi = 24 * 3600, sempre = false, variabili = {} }) {
  if (!configura()) return 0;
  try {
    const iscrizioni = await prisma.iscrizionePush.findMany({ where: { utenteId } });
    if (iscrizioni.length === 0) return 0;
    // Title and message may be translation keys: in the recipient's language
    const lingua = await linguaDiUtenteId(utenteId);
    titolo = traduciPer(lingua, titolo, variabili);
    messaggio = traduciPer(lingua, messaggio, variabili);
    const contenuto = JSON.stringify({ titolo, messaggio, percorso, tag, ...(sempre && { sempre }) });
    let raggiunti = 0;
    await Promise.all(iscrizioni.map(async iscrizione => {
      try {
        await webpush.sendNotification(
          { endpoint: iscrizione.endpoint, keys: { p256dh: iscrizione.p256dh, auth: iscrizione.auth } },
          contenuto,
          { TTL: durataSecondi, urgency: urgente ? 'high' : 'normal' }
        );
        raggiunti++;
      } catch (errore) {
        // 404 and 410: the browser revoked the subscription (app uninstalled,
        // permission removed). It will not become valid again: delete it.
        if ([404, 410].includes(errore.statusCode)) {
          await prisma.iscrizionePush.deleteMany({ where: { id: iscrizione.id } });
          logger.info({ utenteId, stato: errore.statusCode, dispositivo: iscrizione.dispositivo }, 'Iscrizione push revocata dal browser: cancellata');
        } else {
          logger.warn({ utenteId, stato: errore.statusCode, errore: errore.message }, 'Push non consegnata');
        }
      }
    }));
    return raggiunti;
  } catch (errore) {
    logger.error({ utenteId, errore: errore.message }, 'Invio push fallito');
    return 0;
  }
}

// --- End of rest ---
// The app's timer stops when the screen is locked: when the rest is over the
// server sends the push. A rest lasts minutes, so an in-memory timer is
// enough; a server restart in the middle loses it, and the app's timer is
// still there anyway.

/** The longest rest that gets scheduled, in seconds */
export const RECUPERO_MASSIMO = 15 * 60;

const recuperi = new Map();

/**
 * Schedules the end-of-rest push in `secondi` seconds, replacing any one
 * already waiting. The tap opens the workout `sessioneId`: /allenamento alone
 * is the page that lists the plans, and took the user out of the workout.
 */
export function programmaFineRecupero(utenteId, secondi, prossimo, sessioneId) {
  annullaFineRecupero(utenteId);
  const timer = setTimeout(() => {
    recuperi.delete(utenteId);
    // A timer has no request: keys, which inviaPush translates for the user
    inviaPush(utenteId, {
      titolo: 'pushService.fineRecuperoTitolo',
      messaggio: prossimo ? 'pushService.fineRecuperoMessaggio' : 'pushService.fineRecuperoMessaggioSenza',
      variabili: { prossimo },
      percorso: sessioneId ? `/allenamento/${sessioneId}` : '/allenamento',
      tag: 'recupero',
      urgente: true,
      durataSecondi: 60
    });
  }, secondi * 1000);
  timer.unref?.();
  recuperi.set(utenteId, timer);
}

/** Cancels the waiting end-of-rest push, if any. true if there was one */
export function annullaFineRecupero(utenteId) {
  const timer = recuperi.get(utenteId);
  if (!timer) return false;
  clearTimeout(timer);
  recuperi.delete(utenteId);
  return true;
}
