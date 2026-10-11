// ============================================
// GymMaster — Session/Workout Routes
// Workout sessions and set logging
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import * as controller from '../controllers/sessioni.controller.js';
import { idNumerico } from '../middleware/validazione.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.param('schedaId', idNumerico);
router.use(verificaToken);

// --- Sessions ---
router.get('/', controller.listaSessioni);
router.post('/', controller.avviaSessione);

// POST /api/v1/sessioni/passata — Log a workout already done
// Declared before the routes with a parameter, so "passata" is not read as an id
router.post('/passata', controller.registraSessionePassata);

// Specific routes BEFORE /:id (otherwise Express reads them as the parameter)
router.get('/storico', controller.storicoSessioniCompleto);
router.get('/precedente/:schedaId', controller.ultimaSessioneScheda);
router.get('/ultimi-carichi', controller.ultimiCarichi);

router.get('/:id', controller.dettaglioSessione);
// PATCH /api/v1/sessioni/:id — Correct a finished workout (times, notes, sets)
router.patch('/:id', controller.modificaSessione);
router.patch('/:id/completa', controller.completaSessione);
router.patch('/:id/riapri', controller.riapriSessione);
router.post('/:id/scheda', controller.salvaComeScheda);
router.delete('/:id', controller.eliminaSessione);

// --- Set logging inside a session ---
router.post('/:id/serie', controller.logSerie);

export default router;
