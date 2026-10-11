// ============================================
// GymMaster — Routes Notifiche
// /api/v1/notifiche/*
// ============================================

import { Router } from 'express';
import {
  lista, segnaLetta, segnaTutteLette,
  statoPush, iscriviPush, disiscriviPush, provaPush, programmaRecupero, annullaRecupero
} from '../controllers/notifiche.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { idNumerico } from '../middleware/validazione.js';

const router = Router();
// Gli id nell'indirizzo sono interi positivi (middleware/validazione.js)
router.param('id', idNumerico);

router.use(verificaToken);

// GET /api/v1/notifiche — Elenco notifiche + conteggio non lette
router.get('/', lista);

// POST /api/v1/notifiche/segna-tutte-lette — Segna tutte come lette
router.post('/segna-tutte-lette', segnaTutteLette);

// PATCH /api/v1/notifiche/:id/letta — Segna una notifica come letta
router.patch('/:id/letta', segnaLetta);

// Notifiche push sul telefono (services/push.service.js)
router.get('/push', statoPush);
router.post('/push/iscrizione', iscriviPush);
router.delete('/push/iscrizione', disiscriviPush);
router.post('/push/prova', provaPush);
router.post('/push/recupero', programmaRecupero);
router.delete('/push/recupero', annullaRecupero);

export default router;
