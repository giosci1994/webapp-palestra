// ============================================
// GymMaster — Routes Schede Allenamento
// CRUD schede + esercizi dentro le schede
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import * as controller from '../controllers/schede.controller.js';

const router = Router();

// Tutte le rotte richiedono autenticazione
router.use(verificaToken);

// --- Schede ---
router.get('/', controller.listaSchede);
// Prima di '/:id': altrimenti Express tratterebbe "docx" come un id
router.get('/docx', controller.esportaSchedeDocxMultiplo);
router.get('/:id/docx', controller.esportaSchedaDocx);
router.get('/:id', controller.dettaglioScheda);
router.post('/', controller.creaScheda);
router.post('/:id/clona', controller.clonaScheda);
router.put('/:id', controller.aggiornaScheda);
router.delete('/:id', controller.eliminaScheda);

// --- Esercizi dentro una scheda ---
router.post('/:id/esercizi', controller.aggiungiEsercizio);
router.put('/:id/esercizi/:esercizioSchedaId', controller.aggiornaEsercizioScheda);
router.delete('/:id/esercizi/:esercizioSchedaId', controller.rimuoviEsercizio);

export default router;
