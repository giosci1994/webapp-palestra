// ============================================
// GymMaster — Rate limiter middleware
// Different limits for each type of route
// ============================================

import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { t, linguaDaIntestazione } from '../i18n/index.js';
import { RICHIESTE_SEGNALAZIONE_ORA } from '../utils/affluenzaSegnalata.js';
import { segretiUguali } from './bot.auth.js';

// Helper: extracts the real IP from the request
const getIp = (req) => req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.ip);

// Helper: extracts the user ID from the JWT without a DB query (for rate limiting only)
const getUserKey = (req) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const payload = jwt.verify(auth.split(' ')[1], process.env.JWT_SEGRETO_ACCESS);
      if (payload?.utenteId) return `user:${payload.utenteId}`;
    }
  } catch { /* expired/invalid token, use the IP */ }
  return getIp(req);
};

// Helper: the 429 messages are translated for each request, from
// Accept-Language: a limiter is created once, and the global one runs before
// the middleware that sets the request's language
const linguaDi = (req) => linguaDaIntestazione(req.headers['accept-language']);

// The Telegram bot's requests: every user of the bot comes from the bot
// container's address and sends no token, so the global limit would be one
// for all of them. With the right X-Bot-Secret they skip it and are counted
// per Telegram chat by limitatoreBot; with a wrong or missing secret they are
// counted like any other client (and then refused by verificaSegretoBot).
const PERCORSO_BOT = '/api/v1/bot';
export const richiestaDelBot = (req) =>
  (req.path === PERCORSO_BOT || req.path.startsWith(`${PERCORSO_BOT}/`))
  && segretiUguali(req.headers['x-bot-secret'], process.env.BOT_SECRET);

/**
 * Global rate limiter for all the API routes.
 * 500 requests per 15-minute window.
 * Authenticated users use their ID as the key (they do not share the IP limit).
 * The bot's requests, once their secret is checked, have their own limit.
 */
export const limitatoreGlobale = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  skip: richiestaDelBot,
  handler: (req, res) => {
    logger.warn({ ip: getIp(req), percorso: req.path }, 'Rate limit globale superato');
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_RICHIESTE',
      messaggio: t('limitatore.troppeRichieste', {}, linguaDi(req))
    });
  }
});

/**
 * Strict rate limiter for the authentication routes.
 * 20 requests per 15-minute window per IP.
 * Protects against brute-force attacks on login and registration.
 */
export const limitatoreAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIp,
  handler: (req, res) => {
    logger.warn({ ip: getIp(req), percorso: req.path }, 'Rate limit autenticazione superato');
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_RICHIESTE_AUTH',
      messaggio: t('limitatore.troppiTentativiAuth', {}, linguaDi(req))
    });
  }
});

/**
 * Rate limiter for the AI assistant.
 * 5 requests per minute per user (to prevent abuse of the Gemini free tier).
 */
export const limitatoreAI = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  handler: (req, res) => {
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_RICHIESTE_AI',
      messaggio: t('limitatore.troppeRichiesteAI', {}, linguaDi(req))
    });
  }
});

/**
 * Rate limiter for the crowd reports (POST /sessioni/:id/affluenza).
 * RICHIESTE_SEGNALAZIONE_ORA requests per hour per user: one report per
 * workout is all the app sends.
 */
export const limitatoreSegnalazioni = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: RICHIESTE_SEGNALAZIONE_ORA,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  handler: (req, res) => {
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_SEGNALAZIONI',
      messaggio: t('limitatore.troppeSegnalazioni', {}, linguaDi(req))
    });
  }
});

/**
 * Rate limiter for the Telegram bot's routes, after verificaSegretoBot.
 * RICHIESTE_BOT_PER_CHAT requests per 15-minute window per Telegram chat
 * (chatId in the body). A guided plan with 6 exercises costs about 25 calls,
 * so this is several plans in a quarter of an hour, one call every 4-5
 * seconds without a pause: far above a person tapping buttons, but it stops
 * one chat (a loop of /start <code>) from loading the server. The AI messages
 * also have their own limit per user, in bot.service.js.
 */
export const RICHIESTE_BOT_PER_CHAT = 200;

/**
 * The chat as risolviUtenteTelegram reads it (BigInt), so 123, "123", "0123"
 * and "0x7b" are one chat and one count. Anything that is not a whole number
 * shares one key; the route itself refuses it.
 */
export function chiaveChatBot(chatId) {
  if (typeof chatId === 'number' || typeof chatId === 'string') {
    try {
      return `bot:${BigInt(chatId)}`;
    } catch { /* not a whole number */ }
  }
  return 'bot:non-valida';
}

export const limitatoreBot = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RICHIESTE_BOT_PER_CHAT,
  standardHeaders: true,
  legacyHeaders: false,
  // Only the bot reaches here (the secret is already checked): the chat, not
  // the address, is the key
  keyGenerator: (req) => chiaveChatBot(req.body?.chatId),
  handler: (req, res) => {
    logger.warn({ chatId: req.body?.chatId, percorso: req.path }, 'Rate limit bot superato');
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_RICHIESTE_BOT',
      messaggio: t('limitatore.troppeRichiesteBot', {}, linguaDi(req))
    });
  }
});

/**
 * A ceiling for all the bot's requests together, after limitatoreBot (a chat
 * over its own limit does not use up everybody's). RICHIESTE_BOT_TOTALI per
 * 15 minutes is 15 chats at their full limit at the same time, six times the
 * 500 all the bot's users shared before: it only stops the bot as a whole
 * from loading the server (a bug in a loop, many chats at once).
 */
export const RICHIESTE_BOT_TOTALI = 3000;
export const CHIAVE_BOT_TOTALE = 'bot:tutte';
export const limitatoreBotTotale = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RICHIESTE_BOT_TOTALI,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => CHIAVE_BOT_TOTALE,
  handler: (req, res) => {
    logger.warn({ percorso: req.path }, 'Rate limit totale del bot superato');
    res.status(429).json({
      successo: false,
      codice: 'TROPPE_RICHIESTE_BOT_TOTALI',
      messaggio: t('limitatore.troppeRichiesteBotTotali', {}, linguaDi(req))
    });
  }
});
