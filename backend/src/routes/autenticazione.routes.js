// ============================================
// GymMaster — Routes Autenticazione
// POST /api/v1/auth/*
// ============================================

import { Router } from 'express';
import {
  registrazione, login, refresh, logout, verificaEmail, reinviaVerifica, richiediReset, reimpostaPassword,
  sessioni, chiudiSessione, chiudiAltreSessioni,
  passkeyAccessoOpzioni, passkeyAccessoVerifica, passkeyElenco,
  passkeyRegistrazioneOpzioni, passkeyRegistrazioneVerifica, passkeyElimina
} from '../controllers/autenticazione.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { valida, idNumerico } from '../middleware/validazione.js';
import { schemaRegistrazione, schemaLogin } from '../validators/autenticazione.schema.js';
import { limitatoreAuth } from '../middleware/limitatore.js';

const router = Router();
// Gli id nell'indirizzo sono interi positivi (middleware/validazione.js)
router.param('id', idNumerico);

// POST /api/v1/auth/registrazione — Registra nuovo utente
router.post('/registrazione', limitatoreAuth, valida({ body: schemaRegistrazione }), registrazione);

// POST /api/v1/auth/login — Login con email/password
router.post('/login', limitatoreAuth, valida({ body: schemaLogin }), login);

// GET /api/v1/auth/verifica-email — Conferma email tramite token
router.get('/verifica-email', verificaEmail);

// POST /api/v1/auth/reinvia-verifica — Reinvia email di verifica
router.post('/reinvia-verifica', limitatoreAuth, reinviaVerifica);

// POST /api/v1/auth/richiedi-reset — Invia email per reimpostare la password
router.post('/richiedi-reset', limitatoreAuth, richiediReset);

// POST /api/v1/auth/reimposta-password — Imposta nuova password tramite token
router.post('/reimposta-password', limitatoreAuth, reimpostaPassword);

// POST /api/v1/auth/refresh — Rinnova access token
router.post('/refresh', refresh);

// POST /api/v1/auth/logout — Chiude la sessione di questo dispositivo
router.post('/logout', logout);

// Dispositivi collegati: elenco, scollega uno, scollega tutti gli altri
router.get('/sessioni', verificaToken, sessioni);
router.post('/sessioni/chiudi-altre', verificaToken, chiudiAltreSessioni);
router.delete('/sessioni/:famiglia', verificaToken, chiudiSessione);

// Passkey: entrare senza password (prima la sfida, poi la firma)
router.post('/passkey/accesso/opzioni', limitatoreAuth, passkeyAccessoOpzioni);
router.post('/passkey/accesso/verifica', limitatoreAuth, passkeyAccessoVerifica);

// Passkey dell'utente: elenco, aggiunta (con la password), eliminazione
router.get('/passkey', verificaToken, passkeyElenco);
router.post('/passkey/registrazione/opzioni', verificaToken, limitatoreAuth, passkeyRegistrazioneOpzioni);
router.post('/passkey/registrazione/verifica', verificaToken, passkeyRegistrazioneVerifica);
router.delete('/passkey/:id', verificaToken, passkeyElimina);

export default router;
