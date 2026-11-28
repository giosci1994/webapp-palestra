// ============================================
// GymMaster — Telegram Bot Routes (/api/v1/bot/*)
// All protected by X-Bot-Secret: only the bot container, on the
// internal Docker network, can call them. Never expose via Nginx.
// ============================================

import { Router } from 'express';
import { verificaSegretoBot, risolviUtenteTelegram } from '../middleware/bot.auth.js';
import { valida } from '../middleware/validazione.js';
import {
  schemaSoloChat, schemaCollega, schemaMessaggio, schemaScheda,
  schemaGuidaGruppi, schemaGuidaEsercizi, schemaGuidaAggiungi, schemaGuidaTermina
} from '../validators/bot.schema.js';
import { limitatoreBot, limitatoreBotTotale } from '../middleware/limitatore.js';
import { collega, messaggio, annulla, schede, scheda, statistiche, guidaCategorie, guidaGruppi, guidaEsercizi, guidaAggiungi, guidaTitolo, guidaTermina } from '../controllers/bot.controller.js';

const router = Router();

// Shared secret required on every bot route
router.use(verificaSegretoBot);
// Their own limit, per Telegram chat, then one for the whole bot (they skip
// the global one, see limitatore.js)
router.use(limitatoreBot);
router.use(limitatoreBotTotale);

// Initial linking (chatId not linked yet)
router.post('/collega', valida({ body: schemaCollega }), collega);

// Routes that need an account already linked. The body is checked after the
// user is found, so a wrong value is told in the language of their account
router.post('/messaggio', risolviUtenteTelegram, valida({ body: schemaMessaggio }), messaggio);
router.post('/annulla', risolviUtenteTelegram, valida({ body: schemaSoloChat }), annulla);
router.post('/schede', risolviUtenteTelegram, valida({ body: schemaSoloChat }), schede);
router.post('/scheda', risolviUtenteTelegram, valida({ body: schemaScheda }), scheda);
router.post('/statistiche', risolviUtenteTelegram, valida({ body: schemaSoloChat }), statistiche);

// Guided creation with buttons
router.post('/guida/categorie', risolviUtenteTelegram, valida({ body: schemaSoloChat }), guidaCategorie);
router.post('/guida/gruppi', risolviUtenteTelegram, valida({ body: schemaGuidaGruppi }), guidaGruppi);
router.post('/guida/esercizi', risolviUtenteTelegram, valida({ body: schemaGuidaEsercizi }), guidaEsercizi);
router.post('/guida/aggiungi', risolviUtenteTelegram, valida({ body: schemaGuidaAggiungi }), guidaAggiungi);
router.post('/guida/titolo', risolviUtenteTelegram, valida({ body: schemaSoloChat }), guidaTitolo);
router.post('/guida/termina', risolviUtenteTelegram, valida({ body: schemaGuidaTermina }), guidaTermina);

export default router;
