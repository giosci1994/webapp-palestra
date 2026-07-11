// ============================================
// GymMaster — Routes Sessioni/Workout
// Gestione sessioni di allenamento e log serie
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import * as controller from '../controllers/sessioni.controller.js';

const router = Router();
router.use(verificaToken);

// --- Sessioni ---
router.get('/', controller.listaSessioni);
router.post('/', controller.avviaSessione);

// Rotte specifiche PRIMA di /:id (altrimenti Express le interpreta come parametro)
router.get('/storico', controller.storicoSessioniCompleto);
router.get('/precedente/:schedaId', controller.ultimaSessioneScheda);

router.get('/:id', controller.dettaglioSessione);
router.patch('/:id/completa', controller.completaSessione);
router.delete('/:id', controller.eliminaSessione);

// --- Log Serie dentro una sessione ---
router.post('/:id/serie', controller.logSerie);

export default router;
