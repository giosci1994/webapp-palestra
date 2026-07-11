// ============================================
// GymMaster — Routes Chat
// /api/v1/chat/*
// ============================================

import { Router } from 'express';
import { inviaRichiesta, rispondiRichiesta, richiesteRicevute, listaConversazioni, messaggiConversazione } from '../controllers/chat.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { valida } from '../middleware/validazione.js';
import { schemaRichiestaContatto, schemaRispostaContatto } from '../validators/chat.schema.js';

const router = Router();

// Tutte le rotte chat richiedono autenticazione
router.use(verificaToken);

// --- Contatti ---
// POST /api/v1/chat/contatti/richiesta — Invia richiesta di contatto
router.post('/contatti/richiesta', valida({ body: schemaRichiestaContatto }), inviaRichiesta);

// PATCH /api/v1/chat/contatti/:id/rispondi — Rispondi a una richiesta
router.patch('/contatti/:id/rispondi', valida({ body: schemaRispostaContatto }), rispondiRichiesta);

// GET /api/v1/chat/contatti/ricevute — Richieste ricevute in attesa
router.get('/contatti/ricevute', richiesteRicevute);

// --- Conversazioni ---
// GET /api/v1/chat/conversazioni — Lista conversazioni dell'utente
router.get('/conversazioni', listaConversazioni);

// GET /api/v1/chat/conversazioni/:id/messaggi — Messaggi di una conversazione
router.get('/conversazioni/:id/messaggi', messaggiConversazione);

export default router;
