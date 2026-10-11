// ============================================
// GymMaster — Workout Schedule Routes
// /api/v1/pianificazione/*
// ============================================

import { Router } from 'express';
import {
  listaPianificazione,
  allenamentiDiOggi,
  creaPianificato,
  creaPianificazioneSettimanale,
  aggiornaPianificato,
  eliminaPianificato
} from '../controllers/pianificazione.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { idNumerico } from '../middleware/validazione.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

// Every route requires authentication
router.use(verificaToken);

// GET /api/v1/pianificazione?da=&a=&utenteId= — Workouts scheduled in the range
router.get('/', listaPianificazione);

// GET /api/v1/pianificazione/oggi — Workouts still to do today, with the suggested time
router.get('/oggi', allenamentiDiOggi);

// POST /api/v1/pianificazione — Schedule a single workout
router.post('/', creaPianificato);

// POST /api/v1/pianificazione/settimanale — Spread several plans over the week
router.post('/settimanale', creaPianificazioneSettimanale);

// PATCH /api/v1/pianificazione/:id — Move, postpone or change status
router.patch('/:id', aggiornaPianificato);

// DELETE /api/v1/pianificazione/:id — Remove the workout from the calendar
router.delete('/:id', eliminaPianificato);

export default router;
