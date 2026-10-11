// ============================================
// GymMaster — Notifications controller
// ============================================

import * as notificheService from '../services/notifiche.service.js';
import * as pushService from '../services/push.service.js';
import { ErroreValidazione, ErroreNonTrovato } from '../utils/errori.js';

/** GET /api/v1/notifiche?limite=&soloNonLette= — List + unread count */
export async function lista(req, res, next) {
  try {
    const [notifiche, nonLette] = await Promise.all([
      notificheService.elenco(req.utente.id, {
        limite: req.query.limite,
        soloNonLette: req.query.soloNonLette === 'true'
      }),
      notificheService.contaNonLette(req.utente.id)
    ]);
    res.json({ successo: true, dati: { notifiche, nonLette } });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/notifiche/:id/letta — Marks a notification as read */
export async function segnaLetta(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const fatto = await notificheService.segnaLetta(req.utente.id, id);
    if (!fatto) throw new ErroreNonTrovato('Notifica non trovata');

    res.json({ successo: true, dati: { nonLette: await notificheService.contaNonLette(req.utente.id) } });
  } catch (errore) {
    next(errore);
  }
}

/** POST /api/v1/notifiche/segna-tutte-lette — Resets the counter */
export async function segnaTutteLette(req, res, next) {
  try {
    const aggiornate = await notificheService.segnaTutteLette(req.utente.id);
    res.json({ successo: true, dati: { aggiornate, nonLette: 0 } });
  } catch (errore) {
    next(errore);
  }
}

// --- Push notifications (services/push.service.js) ---

/** GET /api/v1/notifiche/push — The public key and how many devices receive push notifications */
export async function statoPush(req, res, next) {
  try {
    const chiave = pushService.chiavePubblica();
    res.json({
      successo: true,
      dati: { attive: Boolean(chiave), chiave, dispositivi: await pushService.contaIscrizioni(req.utente.id) }
    });
  } catch (errore) { next(errore); }
}

const testoBreve = (valore, massimo) => typeof valore === 'string' && valore.length > 0 && valore.length <= massimo;

/** A subscription's endpoint: an https address of the browser's push service */
function leggiEndpoint(endpoint) {
  if (!testoBreve(endpoint, 2048)) throw new ErroreValidazione('Iscrizione push non valida');
  let indirizzo;
  try { indirizzo = new URL(endpoint); } catch { throw new ErroreValidazione('Iscrizione push non valida'); }
  if (indirizzo.protocol !== 'https:') throw new ErroreValidazione('Iscrizione push non valida');
  return endpoint;
}

/** POST /api/v1/notifiche/push/iscrizione — This device receives push notifications (body: PushSubscription.toJSON()) */
export async function iscriviPush(req, res, next) {
  try {
    if (!pushService.chiavePubblica()) throw new ErroreValidazione('Le notifiche push non sono attive sul server');
    const { endpoint, keys } = req.body || {};
    if (!testoBreve(keys?.p256dh, 256) || !testoBreve(keys?.auth, 256)) throw new ErroreValidazione('Iscrizione push non valida');
    await pushService.iscrivi(req.utente.id, { endpoint: leggiEndpoint(endpoint), keys }, req.get('user-agent'));
    res.status(201).json({ successo: true });
  } catch (errore) { next(errore); }
}

/** DELETE /api/v1/notifiche/push/iscrizione — This device no longer receives push notifications (body: { endpoint }) */
export async function disiscriviPush(req, res, next) {
  try {
    await pushService.disiscrivi(req.utente.id, leggiEndpoint(req.body?.endpoint));
    res.json({ successo: true });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/notifiche/push/prova — A test notification to all of the user's devices */
export async function provaPush(req, res, next) {
  try {
    const raggiunti = await pushService.inviaPush(req.utente.id, {
      titolo: '🔔 Notifiche attive',
      messaggio: 'Da adesso GymMaster ti avvisa anche a schermo bloccato.',
      percorso: '/profilo?tab=notifiche',
      tag: 'prova',
      // The test is sent from the profile, with the app open: it must show anyway
      sempre: true
    });
    res.json({ successo: true, dati: { raggiunti } });
  } catch (errore) { next(errore); }
}

/**
 * POST /api/v1/notifiche/push/recupero — Notifies when the rest ends
 * (body: { secondi, prossimo? }: prossimo is what comes next, "Panca piana · serie 2")
 */
export async function programmaRecupero(req, res, next) {
  try {
    const { secondi, prossimo } = req.body || {};
    if (!Number.isInteger(secondi) || secondi < 1 || secondi > pushService.RECUPERO_MASSIMO) {
      throw new ErroreValidazione(`Il recupero va da 1 a ${pushService.RECUPERO_MASSIMO} secondi`);
    }
    if (prossimo != null && !testoBreve(prossimo, 120)) throw new ErroreValidazione('Il prossimo esercizio deve essere un testo breve');
    pushService.programmaFineRecupero(req.utente.id, secondi, prossimo);
    res.json({ successo: true });
  } catch (errore) { next(errore); }
}

/** DELETE /api/v1/notifiche/push/recupero — The rest was stopped: no notification */
export async function annullaRecupero(req, res, next) {
  try {
    res.json({ successo: true, dati: { annullato: pushService.annullaFineRecupero(req.utente.id) } });
  } catch (errore) { next(errore); }
}
