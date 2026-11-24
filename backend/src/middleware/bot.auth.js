// ============================================
// GymMaster — Telegram bot authentication middleware
// Protects the /api/v1/bot/* routes with a shared secret
// (internal bot <-> backend network) and resolves the user from the chatId.
// ============================================

import crypto from 'node:crypto';
import prisma from '../config/database.js';
import { ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import { t, conLingua, linguaSupportata } from '../i18n/index.js';
import { conFuso, fusoDi } from '../utils/date.js';

/**
 * Compares two secrets in constant time: the time of the answer says nothing
 * about how much of the secret was right. Different lengths compare digests
 * of the same length, so they too take the same time (and are never equal).
 */
export function segretiUguali(ricevuto, atteso) {
  if (typeof ricevuto !== 'string' || typeof atteso !== 'string' || !atteso) return false;
  const a = crypto.createHash('sha256').update(ricevuto).digest();
  const b = crypto.createHash('sha256').update(atteso).digest();
  return crypto.timingSafeEqual(a, b) && ricevuto.length === atteso.length;
}

/** Checks the X-Bot-Secret header. The bot routes are never exposed publicly. */
export function verificaSegretoBot(req, res, next) {
  if (!segretiUguali(req.headers['x-bot-secret'], process.env.BOT_SECRET)) {
    return next(new ErroreNonAutorizzato(t('botAuth.accessoNonAutorizzato')));
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
      throw new ErroreValidazione(t('botAuth.chatIdMancante'));
    }

    const collegamento = await prisma.collegamentoTelegram.findUnique({
      where: { telegramChatId: BigInt(chatId) },
      include: {
        utente: { select: { id: true, nome: true, ruolo: true, stato: true, palestraId: true, lingua: true, linguaApp: true, fusoOrario: true } }
      }
    });

    if (!collegamento || !collegamento.utente) {
      return res.status(409).json({
        successo: false,
        codice: 'NON_COLLEGATO',
        messaggio: t('botAuth.nonCollegato')
      });
    }

    // The bot sends no Accept-Language: the answers go to the linked user, in
    // their language (Profile choice, then the app's last one, then the request's)
    const { utente } = collegamento;
    const lingua = linguaSupportata(utente.lingua) || linguaSupportata(utente.linguaApp) || req.lingua;

    if (collegamento.utente.stato !== 'ATTIVO') {
      return res.status(403).json({
        successo: false,
        codice: 'ACCOUNT_NON_ATTIVO',
        messaggio: t('botAuth.accountNonAttivo', {}, lingua)
      });
    }

    req.utenteTelegram = collegamento.utente;
    // The bot writes its own texts in the same language
    res.set('Content-Language', lingua);
    // Whatever the route builds from here on (t() in the controller and the
    // services) is in that language too, with the dates in the user's time zone
    conLingua(lingua, () => conFuso(fusoDi(utente), next));
  } catch (errore) {
    next(errore);
  }
}
