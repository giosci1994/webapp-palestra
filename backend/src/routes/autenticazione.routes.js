// ============================================
// GymMaster — Authentication Routes
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
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

// POST /api/v1/auth/registrazione — Register a new user
router.post('/registrazione', limitatoreAuth, valida({ body: schemaRegistrazione }), registrazione);

// POST /api/v1/auth/login — Log in with email/password
router.post('/login', limitatoreAuth, valida({ body: schemaLogin }), login);

// GET /api/v1/auth/verifica-email — Confirm the email with a token
router.get('/verifica-email', verificaEmail);

// POST /api/v1/auth/reinvia-verifica — Resend the verification email
router.post('/reinvia-verifica', limitatoreAuth, reinviaVerifica);

// POST /api/v1/auth/richiedi-reset — Send the email to reset the password
router.post('/richiedi-reset', limitatoreAuth, richiediReset);

// POST /api/v1/auth/reimposta-password — Set a new password with a token
router.post('/reimposta-password', limitatoreAuth, reimpostaPassword);

// POST /api/v1/auth/refresh — Renew the access token
router.post('/refresh', refresh);

// POST /api/v1/auth/logout — Close the session of this device
router.post('/logout', logout);

// Linked devices: list, sign out one, sign out all the others
router.get('/sessioni', verificaToken, sessioni);
router.post('/sessioni/chiudi-altre', verificaToken, chiudiAltreSessioni);
router.delete('/sessioni/:famiglia', verificaToken, chiudiSessione);

// Passkey: sign in without a password (first the challenge, then the signature)
router.post('/passkey/accesso/opzioni', limitatoreAuth, passkeyAccessoOpzioni);
router.post('/passkey/accesso/verifica', limitatoreAuth, passkeyAccessoVerifica);

// The user's passkeys: list, add (with the password), delete
router.get('/passkey', verificaToken, passkeyElenco);
router.post('/passkey/registrazione/opzioni', verificaToken, limitatoreAuth, passkeyRegistrazioneOpzioni);
router.post('/passkey/registrazione/verifica', verificaToken, passkeyRegistrazioneVerifica);
router.delete('/passkey/:id', verificaToken, passkeyElimina);

export default router;
