// ============================================
// GymMaster — Routes Bot Telegram (/api/v1/bot/*)
// Tutte protette da X-Bot-Secret: solo il container bot, sulla
// rete Docker interna, può chiamarle. Mai esporre via Nginx.
// ============================================

import { Router } from 'express';
import { verificaSegretoBot, risolviUtenteTelegram } from '../middleware/bot.auth.js';
import { collega, messaggio, annulla, schede, scheda, statistiche, guidaCategorie, guidaGruppi, guidaEsercizi, guidaAggiungi, guidaTermina } from '../controllers/bot.controller.js';

const router = Router();

// Segreto condiviso obbligatorio su tutte le rotte bot
router.use(verificaSegretoBot);

// Collegamento iniziale (chatId non ancora associato)
router.post('/collega', collega);

// Rotte che richiedono un account già collegato
router.post('/messaggio', risolviUtenteTelegram, messaggio);
router.post('/annulla', risolviUtenteTelegram, annulla);
router.post('/schede', risolviUtenteTelegram, schede);
router.post('/scheda', risolviUtenteTelegram, scheda);
router.post('/statistiche', risolviUtenteTelegram, statistiche);

// Creazione guidata a pulsanti
router.post('/guida/categorie', risolviUtenteTelegram, guidaCategorie);
router.post('/guida/gruppi', risolviUtenteTelegram, guidaGruppi);
router.post('/guida/esercizi', risolviUtenteTelegram, guidaEsercizi);
router.post('/guida/aggiungi', risolviUtenteTelegram, guidaAggiungi);
router.post('/guida/termina', risolviUtenteTelegram, guidaTermina);

export default router;
