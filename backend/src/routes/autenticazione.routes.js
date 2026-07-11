// ============================================
// GymMaster — Routes Autenticazione
// POST /api/v1/auth/*
// ============================================

import { Router } from 'express';
import { registrazione, login, refresh, logout, verificaEmail, reinviaVerifica, richiediReset, reimpostaPassword } from '../controllers/autenticazione.controller.js';
import { valida } from '../middleware/validazione.js';
import { schemaRegistrazione, schemaLogin } from '../validators/autenticazione.schema.js';
import { limitatoreAuth } from '../middleware/limitatore.js';

const router = Router();

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

// POST /api/v1/auth/logout — Revoca refresh token
router.post('/logout', logout);

export default router;
