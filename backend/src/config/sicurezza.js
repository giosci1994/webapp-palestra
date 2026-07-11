// ============================================
// GymMaster — Configurazione Sicurezza
// Helmet, CORS, Rate Limiting centralizzati
// ============================================

import helmet from 'helmet';
import cors from 'cors';

/**
 * Configurazione Helmet per header di sicurezza.
 * CSP restrittivo, HSTS attivo, no-sniff, referrer policy.
 */
export function configuraHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false, // Necessario per risorse esterne (font)
    hsts: {
      maxAge: 31536000, // 1 anno
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * Configurazione CORS.
 * Accetta solo le origini specificate in ORIGINI_CONSENTITE.
 */
export function configuraCORS() {
  const originiConsentite = (process.env.ORIGINI_CONSENTITE || 'http://localhost:6969')
    .split(',')
    .map(o => o.trim());

  return cors({
    origin: function (origin, callback) {
      // Consenti richieste senza origin (es. app mobile, curl, same-origin)
      if (!origin) return callback(null, true);

      if (originiConsentite.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origine non consentita dal CORS: ${origin}`));
      }
    },
    credentials: true, // Necessario per cookie HttpOnly
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // Cache preflight per 24 ore
  });
}
