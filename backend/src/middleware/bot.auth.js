// ============================================
// GymMaster — Telegram bot authentication middleware
// Protects the /api/v1/bot/* routes with a shared secret
// (internal bot <-> backend network) and resolves the user from the chatId.
// ============================================

import prisma from '../config/database.js';
import { ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';

/** Checks the X-Bot-Secret header. The bot routes are never exposed publicly. */
export function verificaSegretoBot(req, res, next) {
  const segreto = req.headers['x-bot-secret'];
  if (!process.env.BOT_SECRET || segreto !== process.env.BOT_SECRET) {
    return next(new ErroreNonAutorizzato('Accesso bot non autorizzato'));
  }
  next();
}

/**
 * Resolves the linked user from the `chatId` in the body.
 * Requires an account already linked and active; attaches req.utenteTelegram.
 */
export async function risolviUtenteTelegram(req, res, next) {
  try {
    const chatId = req.body?.chatId;
    if (chatId === undefined || chatId === null || chatId === '') {
      throw new ErroreValidazione('chatId mancante');
    }

    const collegamento = await prisma.collegamentoTelegram.findUnique({
      where: { telegramChatId: BigInt(chatId) },
      include: {
        utente: { select: { id: true, nome: true, ruolo: true, stato: true, palestraId: true } }
      }
    });

    if (!collegamento || !collegamento.utente) {
      return res.status(409).json({
        successo: false,
        codice: 'NON_COLLEGATO',
        messaggio: 'Account Telegram non collegato. Genera un codice dall\'app e invialo qui.'
      });
    }

    if (collegamento.utente.stato !== 'ATTIVO') {
      return res.status(403).json({
        successo: false,
        codice: 'ACCOUNT_NON_ATTIVO',
        messaggio: 'Il tuo account non è attivo.'
      });
    }

    req.utenteTelegram = collegamento.utente;
    next();
  } catch (errore) {
    next(errore);
  }
}
