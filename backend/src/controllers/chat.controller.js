// ============================================
// GymMaster — Chat controller
// Handles the HTTP requests for messaging
// ============================================

import * as chatService from '../services/chat.service.js';

/** POST /api/v1/chat/contatti/richiesta — Sends a contact request */
export async function inviaRichiesta(req, res, next) {
  try {
    const richiesta = await chatService.inviaRichiestaContatto(
      req.utente.id,
      req.body.destinatarioId
    );
    res.status(201).json({ successo: true, messaggio: 'Richiesta di contatto inviata', dati: richiesta });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/chat/contatti/:id/rispondi — Answers a request */
export async function rispondiRichiesta(req, res, next) {
  try {
    const risultato = await chatService.rispondiRichiestaContatto(
      parseInt(req.params.id),
      req.utente.id,
      req.body.stato
    );
    res.json({ successo: true, messaggio: `Richiesta ${req.body.stato.toLowerCase()}`, dati: risultato });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/chat/contatti/ricevute — Pending received requests */
export async function richiesteRicevute(req, res, next) {
  try {
    const richieste = await chatService.ottieniRichiesteRicevute(req.utente.id);
    res.json({ successo: true, dati: richieste });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/chat/conversazioni — List of conversations */
export async function listaConversazioni(req, res, next) {
  try {
    const conversazioni = await chatService.ottieniConversazioni(req.utente.id);
    res.json({ successo: true, dati: conversazioni });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/chat/conversazioni/:id/messaggi — Messages of a conversation */
export async function messaggiConversazione(req, res, next) {
  try {
    const { pagina = 1, limite = 50 } = req.query;
    const risultato = await chatService.ottieniMessaggi(
      parseInt(req.params.id),
      req.utente.id,
      { pagina: parseInt(pagina), limite: parseInt(limite) }
    );
    res.json({ successo: true, dati: risultato });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/chat/non-letti — Number of unread messages */
export async function contatoreNonLetti(req, res, next) {
  try {
    const totale = await chatService.contaNonLetti(req.utente.id);
    res.json({ successo: true, dati: { totale } });
  } catch (errore) {
    next(errore);
  }
}
