// ============================================
// GymMaster — Middleware Rate Limiter
// Limiti diversificati per tipo di rotta
// ============================================

import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

// Helper: estrae l'IP reale dalla richiesta
const getIp = (req) => req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.ip);

// Helper: estrae l'ID utente dal JWT senza query DB (solo per rate limiting)
const getUserKey = (req) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const payload = jwt.verify(auth.split(' ')[1], process.env.JWT_SEGRETO_ACCESS);
      if (payload?.utenteId) return `user:${payload.utenteId}`;
    }
  } catch { /* token scaduto/invalido, usa IP */ }
  return getIp(req);
};

/**
 * Rate limiter globale per tutte le rotte API.
 * 500 richieste per finestra di 15 minuti.
 * Utenti autenticati usano il loro ID come chiave (non condividono il limite IP).
 */
export const limitatoreGlobale = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
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
 * Rate limiter stretto per rotte di autenticazione.
 * 20 richieste per finestra di 15 minuti per IP.
 * Protegge da attacchi brute-force su login e registrazione.
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
 * Rate limiter per l'assistente AI.
 * 5 richieste per minuto per utente (prevenire abuso del tier gratuito Gemini).
 */
export const limitatoreAI = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
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
