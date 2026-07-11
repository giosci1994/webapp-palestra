// ============================================
// GymMaster — Routes Assistente AI
// /api/v1/assistente/*
// ============================================

import { Router } from 'express';
import { chiedi, storicoConversazioni } from '../controllers/assistente.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { limitatoreAI } from '../middleware/limitatore.js';

const router = Router();

// Tutte le rotte richiedono autenticazione
router.use(verificaToken);

// Rate limiting specifico per AI (5 req/min per utente)
router.use(limitatoreAI);

// POST /api/v1/assistente/chiedi — Invia domanda all'assistente
router.post('/chiedi', chiedi);

// GET /api/v1/assistente/conversazioni — Storico conversazioni AI
router.get('/conversazioni', storicoConversazioni);

export default router;
