// ============================================
// GymMaster — Security configuration
// Helmet and CORS in one place (rate limits are in middleware/limitatore.js)
// ============================================

import helmet from 'helmet';
import cors from 'cors';

/**
 * Helmet configuration for the security headers.
 * Strict CSP, HSTS on, no-sniff, referrer policy.
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
    crossOriginEmbedderPolicy: false, // Needed for external resources (fonts)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * CORS configuration.
 * Accepts only the origins listed in ORIGINI_CONSENTITE.
 */
export function configuraCORS() {
  const originiConsentite = (process.env.ORIGINI_CONSENTITE || 'http://localhost:6969')
    .split(',')
    .map(o => o.trim());

  return cors({
    origin: function (origin, callback) {
      // Allow requests without an origin (e.g. mobile app, curl, same-origin)
      if (!origin) return callback(null, true);

      if (originiConsentite.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origine non consentita dal CORS: ${origin}`));
      }
    },
    credentials: true, // Needed for HttpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // Cache the preflight for 24 hours
  });
}
