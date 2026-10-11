// ============================================
// GymMaster — Notifiche push (Web Push)
// ============================================
//
// Le notifiche arrivano sul telefono anche ad app chiusa o a schermo
// bloccato: le mostra il service worker (frontend/public/sw-push.js). Lo
// standard Web Push non passa da servizi a pagamento: il server firma ogni
// invio con una coppia di chiavi VAPID (VAPID_CHIAVE_PUBBLICA e
// VAPID_CHIAVE_PRIVATA nel .env; si generano con
// `npx web-push generate-vapid-keys`). Senza chiavi le push sono spente e
// tutto il resto funziona come prima.

import webpush from 'web-push';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { descriviDispositivo } from '../utils/dispositivo.js';

let configurate = false;

/**
 * Il contatto per i servizi push: VAPID vuole un indirizzo https: o mailto:.
 * L'indirizzo dell'app basta, se e' https (in sviluppo e' http://localhost).
 */
function contatto() {
  const { VAPID_CONTATTO, APP_URL } = process.env;
  if (VAPID_CONTATTO) return VAPID_CONTATTO;
  return APP_URL?.startsWith('https://') ? APP_URL : 'https://gymmaster.casadm.uk';
}

/** Le chiavi VAPID dall'ambiente, lette al primo uso. false se mancano o non valgono */
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

/** La chiave pubblica per pushManager.subscribe, o null se le push sono spente */
export function chiavePubblica() {
  return configura() ? process.env.VAPID_CHIAVE_PUBBLICA : null;
}

/**
 * Registra (o aggiorna) il dispositivo che si e' iscritto. Lo stesso browser
 * ha sempre lo stesso endpoint: se ci entra un altro utente, l'iscrizione
 * passa a lui.
 */
export function iscrivi(utenteId, { endpoint, keys }, userAgent) {
  const dati = { utenteId, p256dh: keys.p256dh, auth: keys.auth, dispositivo: descriviDispositivo(userAgent) };
  return prisma.iscrizionePush.upsert({
    where: { endpoint },
    create: { endpoint, ...dati },
    update: dati
  });
}

/** Toglie il dispositivo, se e' dell'utente */
export function disiscrivi(utenteId, endpoint) {
  return prisma.iscrizionePush.deleteMany({ where: { utenteId, endpoint } });
}

/** Quanti dispositivi dell'utente ricevono le push */
export function contaIscrizioni(utenteId) {
  return prisma.iscrizionePush.count({ where: { utenteId } });
}

/**
 * Manda una notifica a tutti i dispositivi dell'utente. Non lancia mai: una
 * push mancata non deve far fallire l'azione che l'ha generata.
 * @param {number} utenteId
 * @param {{ titolo: string, messaggio?: string, percorso?: string, tag?: string, urgente?: boolean, durataSecondi?: number, sempre?: boolean }} notifica
 *   tag: le notifiche con lo stesso tag si sostituiscono (un recupero, una conversazione);
 *   sempre: da mostrare anche ad app aperta (la prova), che di solito la lascia all'app;
 *   urgente: da consegnare subito anche a telefono in risparmio energetico;
 *   durataSecondi: oltre, se il telefono era irraggiungibile, non va piu' consegnata
 * @returns {Promise<number>} i dispositivi raggiunti
 */
export async function inviaPush(utenteId, { titolo, messaggio = '', percorso = '/', tag, urgente = false, durataSecondi = 24 * 3600, sempre = false }) {
  if (!configura()) return 0;
  try {
    const iscrizioni = await prisma.iscrizionePush.findMany({ where: { utenteId } });
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
        // 404 e 410: il browser ha revocato l'iscrizione (app disinstallata,
        // permesso tolto). Non tornera' valida: si cancella.
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

// --- Fine del recupero ---
// Il timer dell'app a schermo bloccato si ferma: allo scadere del recupero
// il server manda la push. Il recupero dura minuti, quindi basta un timer in
// memoria; un riavvio del server nel mezzo lo perde, e il timer dell'app
// resta comunque.

/** Il recupero piu' lungo che si programma, in secondi */
export const RECUPERO_MASSIMO = 15 * 60;

const recuperi = new Map();

/** Programma la push di fine recupero fra `secondi`, al posto di quella eventualmente in attesa */
export function programmaFineRecupero(utenteId, secondi, prossimo) {
  annullaFineRecupero(utenteId);
  const timer = setTimeout(() => {
    recuperi.delete(utenteId);
    inviaPush(utenteId, {
      titolo: '⏱️ Recupero finito',
      messaggio: prossimo ? `Tocca a te: ${prossimo}` : 'Tocca a te: la prossima serie',
      percorso: '/allenamento',
      tag: 'recupero',
      urgente: true,
      durataSecondi: 60
    });
  }, secondi * 1000);
  timer.unref?.();
  recuperi.set(utenteId, timer);
}

/** Annulla la push di fine recupero in attesa, se c'e'. true se ce n'era una */
export function annullaFineRecupero(utenteId) {
  const timer = recuperi.get(utenteId);
  if (!timer) return false;
  clearTimeout(timer);
  recuperi.delete(utenteId);
  return true;
}
