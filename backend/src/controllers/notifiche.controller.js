// ============================================
// GymMaster — Controller Notifiche
// ============================================

import * as notificheService from '../services/notifiche.service.js';
import { ErroreValidazione, ErroreNonTrovato } from '../utils/errori.js';

/** GET /api/v1/notifiche?limite=&soloNonLette= — Elenco + conteggio non lette */
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

/** PATCH /api/v1/notifiche/:id/letta — Segna una notifica come letta */
export async function segnaLetta(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const fatto = await notificheService.segnaLetta(req.utente.id, id);
    if (!fatto) throw new ErroreNonTrovato('Notifica');

    res.json({ successo: true, dati: { nonLette: await notificheService.contaNonLette(req.utente.id) } });
  } catch (errore) {
    next(errore);
  }
}

/** POST /api/v1/notifiche/segna-tutte-lette — Azzera il contatore */
export async function segnaTutteLette(req, res, next) {
  try {
    const aggiornate = await notificheService.segnaTutteLette(req.utente.id);
    res.json({ successo: true, dati: { aggiornate, nonLette: 0 } });
  } catch (errore) {
    next(errore);
  }
}
