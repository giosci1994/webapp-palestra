// ============================================
// GymMaster — Chat Routes
// /api/v1/chat/*
// ============================================

import { Router } from 'express';
import { inviaRichiesta, rispondiRichiesta, richiesteRicevute, listaConversazioni, messaggiConversazione, contatoreNonLetti } from '../controllers/chat.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { valida, idNumerico } from '../middleware/validazione.js';
import { schemaRichiestaContatto, schemaRispostaContatto } from '../validators/chat.schema.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

// Every chat route requires authentication
router.use(verificaToken);

// --- Contacts ---
// POST /api/v1/chat/contatti/richiesta — Send a contact request
router.post('/contatti/richiesta', valida({ body: schemaRichiestaContatto }), inviaRichiesta);

// PATCH /api/v1/chat/contatti/:id/rispondi — Answer a request
router.patch('/contatti/:id/rispondi', valida({ body: schemaRispostaContatto }), rispondiRichiesta);

// GET /api/v1/chat/contatti/ricevute — Pending requests received
router.get('/contatti/ricevute', richiesteRicevute);

// --- Conversations ---
// GET /api/v1/chat/conversazioni — The user's conversations
router.get('/conversazioni', listaConversazioni);

// GET /api/v1/chat/conversazioni/:id/messaggi — Messages of a conversation
router.get('/conversazioni/:id/messaggi', messaggiConversazione);

// GET /api/v1/chat/non-letti — Unread message count (for the dashboard carousel)
router.get('/non-letti', contatoreNonLetti);

export default router;
