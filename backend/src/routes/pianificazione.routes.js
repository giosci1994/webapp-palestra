// ============================================
// GymMaster — Routes Pianificazione Allenamenti
// /api/v1/pianificazione/*
// ============================================

import { Router } from 'express';
import {
  listaPianificazione,
  creaPianificato,
  creaPianificazioneSettimanale,
  aggiornaPianificato,
  eliminaPianificato
} from '../controllers/pianificazione.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';

const router = Router();

// Tutte le rotte richiedono autenticazione
router.use(verificaToken);

// GET /api/v1/pianificazione?da=&a=&utenteId= — Allenamenti programmati nell'intervallo
router.get('/', listaPianificazione);

// POST /api/v1/pianificazione — Programma un singolo allenamento
router.post('/', creaPianificato);

// POST /api/v1/pianificazione/settimanale — Distribuisce più schede sulla settimana
router.post('/settimanale', creaPianificazioneSettimanale);

// PATCH /api/v1/pianificazione/:id — Sposta, rimanda o cambia stato
router.patch('/:id', aggiornaPianificato);

// DELETE /api/v1/pianificazione/:id — Toglie l'allenamento dal calendario
router.delete('/:id', eliminaPianificato);

export default router;
