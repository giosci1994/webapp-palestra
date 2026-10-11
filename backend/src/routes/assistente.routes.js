// ============================================
// GymMaster — AI Assistant Routes
// /api/v1/assistente/*
// ============================================

import { Router } from 'express';
import { chiedi, storicoConversazioni } from '../controllers/assistente.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { limitatoreAI } from '../middleware/limitatore.js';

const router = Router();

// Every route requires authentication
router.use(verificaToken);

// AI-specific rate limiting (5 req/min per user)
router.use(limitatoreAI);

// POST /api/v1/assistente/chiedi — Send a question to the assistant
router.post('/chiedi', chiedi);

// GET /api/v1/assistente/conversazioni — AI conversation history
router.get('/conversazioni', storicoConversazioni);

export default router;
