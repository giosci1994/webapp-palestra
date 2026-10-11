// ============================================
// GymMaster — Notification Routes
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
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

router.use(verificaToken);

// GET /api/v1/notifiche — Notification list + unread count
router.get('/', lista);

// POST /api/v1/notifiche/segna-tutte-lette — Mark all as read
router.post('/segna-tutte-lette', segnaTutteLette);

// PATCH /api/v1/notifiche/:id/letta — Mark one notification as read
router.patch('/:id/letta', segnaLetta);

// Push notifications on the phone (services/push.service.js)
router.get('/push', statoPush);
router.post('/push/iscrizione', iscriviPush);
router.delete('/push/iscrizione', disiscriviPush);
router.post('/push/prova', provaPush);
router.post('/push/recupero', programmaRecupero);
router.delete('/push/recupero', annullaRecupero);

export default router;
