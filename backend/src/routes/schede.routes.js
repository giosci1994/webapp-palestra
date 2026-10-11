// ============================================
// GymMaster — Workout Plan Routes
// CRUD for plans + exercises inside plans
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import * as controller from '../controllers/schede.controller.js';
import { idNumerico } from '../middleware/validazione.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.param('esercizioSchedaId', idNumerico);

// Every route requires authentication
router.use(verificaToken);

// --- Plans ---
router.get('/', controller.listaSchede);
// Before '/:id': otherwise Express would treat "docx" as an id
router.get('/docx', controller.esportaSchedeDocxMultiplo);
router.get('/:id/docx', controller.esportaSchedaDocx);
router.get('/:id', controller.dettaglioScheda);
router.post('/', controller.creaScheda);
router.post('/:id/clona', controller.clonaScheda);
router.put('/:id', controller.aggiornaScheda);
router.delete('/:id', controller.eliminaScheda);

// --- Exercises inside a plan ---
router.post('/:id/esercizi', controller.aggiungiEsercizio);
router.put('/:id/esercizi/:esercizioSchedaId', controller.aggiornaEsercizioScheda);
router.delete('/:id/esercizi/:esercizioSchedaId', controller.rimuoviEsercizio);

export default router;
