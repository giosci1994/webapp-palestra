// ============================================
// GymMaster — Telegram Bot Routes (/api/v1/bot/*)
// All protected by X-Bot-Secret: only the bot container, on the
// internal Docker network, can call them. Never expose via Nginx.
// ============================================

import { Router } from 'express';
import { verificaSegretoBot, risolviUtenteTelegram } from '../middleware/bot.auth.js';
import { collega, messaggio, annulla, schede, scheda, statistiche, guidaCategorie, guidaGruppi, guidaEsercizi, guidaAggiungi, guidaTermina } from '../controllers/bot.controller.js';

const router = Router();

// Shared secret required on every bot route
router.use(verificaSegretoBot);

// Initial linking (chatId not linked yet)
router.post('/collega', collega);

// Routes that need an account already linked
router.post('/messaggio', risolviUtenteTelegram, messaggio);
router.post('/annulla', risolviUtenteTelegram, annulla);
router.post('/schede', risolviUtenteTelegram, schede);
router.post('/scheda', risolviUtenteTelegram, scheda);
router.post('/statistiche', risolviUtenteTelegram, statistiche);

// Guided creation with buttons
router.post('/guida/categorie', risolviUtenteTelegram, guidaCategorie);
router.post('/guida/gruppi', risolviUtenteTelegram, guidaGruppi);
router.post('/guida/esercizi', risolviUtenteTelegram, guidaEsercizi);
router.post('/guida/aggiungi', risolviUtenteTelegram, guidaAggiungi);
router.post('/guida/termina', risolviUtenteTelegram, guidaTermina);

export default router;
