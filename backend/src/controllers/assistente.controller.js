// ============================================
// GymMaster — Controller Assistente AI
// Gestisce le richieste HTTP per l'assistente virtuale
// ============================================

import * as assistenteService from '../services/assistente.service.js';

/** POST /api/v1/assistente/chiedi — Invia domanda all'assistente */
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

/** GET /api/v1/assistente/conversazioni — Storico conversazioni AI */
export async function storicoConversazioni(req, res, next) {
  try {
    const conversazioni = await assistenteService.ottieniConversazioniAI(req.utente.id);
    res.json({ successo: true, dati: conversazioni });
  } catch (errore) {
    next(errore);
  }
}
