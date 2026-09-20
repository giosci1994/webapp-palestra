// ============================================
// GymMaster — Routes Notifiche
// /api/v1/notifiche/*
// ============================================

import { Router } from 'express';
import { lista, segnaLetta, segnaTutteLette } from '../controllers/notifiche.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';

const router = Router();

router.use(verificaToken);

// GET /api/v1/notifiche — Elenco notifiche + conteggio non lette
router.get('/', lista);

// POST /api/v1/notifiche/segna-tutte-lette — Segna tutte come lette
router.post('/segna-tutte-lette', segnaTutteLette);

// PATCH /api/v1/notifiche/:id/letta — Segna una notifica come letta
router.patch('/:id/letta', segnaLetta);

export default router;
