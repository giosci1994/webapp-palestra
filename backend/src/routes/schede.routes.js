// ============================================
// GymMaster — Workout Plan Routes
// CRUD for plans + exercises inside plans
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import * as controller from '../controllers/schede.controller.js';
import { idNumerico, valida } from '../middleware/validazione.js';
import {
  schemaCreaScheda, schemaAggiornaScheda, schemaAggiungiEsercizio, schemaAggiornaEsercizioScheda
} from '../validators/schede.schema.js';

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
// The ids of your favourite plans, most recent first (before '/:id' too)
router.get('/preferite', controller.listaPreferite);
router.get('/:id/docx', controller.esportaSchedaDocx);
router.get('/:id', controller.dettaglioScheda);
router.post('/', valida({ body: schemaCreaScheda }), controller.creaScheda);
router.post('/:id/clona', controller.clonaScheda);
router.put('/:id', valida({ body: schemaAggiornaScheda }), controller.aggiornaScheda);
router.delete('/:id', controller.eliminaScheda);

// --- Favourite plans: the star, for each user ---
router.put('/:id/preferita', controller.aggiungiPreferita);
router.delete('/:id/preferita', controller.togliPreferita);

// --- Exercises inside a plan ---
router.post('/:id/esercizi', valida({ body: schemaAggiungiEsercizio }), controller.aggiungiEsercizio);
router.put('/:id/esercizi/:esercizioSchedaId', valida({ body: schemaAggiornaEsercizioScheda }), controller.aggiornaEsercizioScheda);
router.delete('/:id/esercizi/:esercizioSchedaId', controller.rimuoviEsercizio);

export default router;
