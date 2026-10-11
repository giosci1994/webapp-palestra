// ============================================
// GymMaster — AI assistant controller
// Handles the HTTP requests for the virtual assistant
// ============================================

import * as assistenteService from '../services/assistente.service.js';

/** POST /api/v1/assistente/chiedi — Sends a question to the assistant */
export async function chiedi(req, res, next) {
  try {
    const { messaggio, conversazioneAiId } = req.body;
    const risultato = await assistenteService.chiediAssistente(
      req.utente.id,
      messaggio,
      conversazioneAiId || null
    );

    res.json({ successo: true, dati: risultato });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/assistente/conversazioni — History of AI conversations */
export async function storicoConversazioni(req, res, next) {
  try {
    const conversazioni = await assistenteService.ottieniConversazioniAI(req.utente.id);
    res.json({ successo: true, dati: conversazioni });
  } catch (errore) {
    next(errore);
  }
}
