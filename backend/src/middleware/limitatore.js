// ============================================
// GymMaster — Rate limiter middleware
// Different limits for each type of route
// ============================================

import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

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

/**
 * Global rate limiter for all the API routes.
 * 500 requests per 15-minute window.
 * Authenticated users use their ID as the key (they do not share the IP limit).
 */
export const limitatoreGlobale = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    successo: false,
    codice: 'TROPPE_RICHIESTE',
    messaggio: 'Troppe richieste, riprova tra qualche minuto.'
  },
  keyGenerator: getUserKey,
  handler: (req, res, next, opzioni) => {
    logger.warn({ ip: getIp(req), percorso: req.path }, 'Rate limit globale superato');
    res.status(429).json(opzioni.message);
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
  message: {
    successo: false,
    codice: 'TROPPE_RICHIESTE_AUTH',
    messaggio: 'Troppi tentativi di autenticazione, riprova tra 15 minuti.'
  },
  keyGenerator: getIp,
  handler: (req, res, next, opzioni) => {
    logger.warn({ ip: getIp(req), percorso: req.path }, 'Rate limit autenticazione superato');
    res.status(429).json(opzioni.message);
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

  message: {
    successo: false,
    codice: 'TROPPE_RICHIESTE_AI',
    messaggio: 'Troppe richieste all\'assistente AI, riprova tra un minuto.'
  }
});
