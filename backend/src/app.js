// ============================================
// GymMaster — Express application
// App, HTTP server and Socket.io, without making them listen
// ============================================
//
// server.js starts them on the backend port and adds the periodic jobs;
// the integration tests start them on a free port, without timers.

import express from 'express';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import { configuraHelmet, configuraCORS } from './config/sicurezza.js';
import { limitatoreGlobale } from './middleware/limitatore.js';
import { inizializzaSocket } from './socket/indice.js';
import router from './routes/indice.js';
import logger from './utils/logger.js';
import { ErroreApp } from './utils/errori.js';
import { linguaRichiesta, linguaDaIntestazione, t } from './i18n/index.js';

const AMBIENTE = process.env.AMBIENTE || 'sviluppo';

/**
 * Creates the Express app with all the routes, the HTTP server that serves it
 * and Socket.io attached to that server.
 * @returns {{ app: import('express').Express, serverHttp: import('http').Server, io: import('socket.io').Server }}
 */
export function creaServer() {
  const app = express();
  const serverHttp = createServer(app);

  // --- Security middleware ---
  app.use(configuraHelmet());
  app.use(configuraCORS());
  app.use(limitatoreGlobale);

  // --- Parsing middleware ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // --- Trust proxy (for Nginx and Cloudflare) ---
  app.set('trust proxy', 1);

  // --- Request logging (development only) ---
  if (AMBIENTE !== 'produzione') {
    app.use((req, res, next) => {
      logger.debug({ metodo: req.method, percorso: req.path }, 'Richiesta ricevuta');
      next();
    });
  }

  // --- Language of the request (Accept-Language), kept for the whole request.
  // After the body parsers: their callbacks would lose it ---
  app.use(linguaRichiesta);

  // --- Mount the API routes ---
  app.use('/api/v1', router);

  // --- Centralized error handling ---
  app.use((errore, req, res, next) => {
    // The body parsers and CORS run before the request's language is set, so
    // the errors they raise get it from the header
    const lingua = req.lingua || linguaDaIntestazione(req.headers['accept-language']);

    // The app's custom errors
    if (errore instanceof ErroreApp) {
      return res.status(errore.codiceStato).json({
        successo: false,
        codice: errore.codice,
        messaggio: errore.message,
        ...(errore.dettagli && { dettagli: errore.dettagli })
      });
    }

    // CORS errors
    if (errore.message?.includes('CORS')) {
      return res.status(403).json({
        successo: false,
        codice: 'CORS_BLOCCATO',
        messaggio: t('app.origineNonConsentita', {}, lingua)
      });
    }

    // Prisma: the item to update or delete does not exist (a wrong id in the
    // URL), not a server failure
    if (errore.code === 'P2025') {
      return res.status(404).json({
        successo: false,
        codice: 'NON_TROVATO',
        messaggio: t('app.elementoNonTrovato', {}, lingua)
      });
    }

    // JSON parsing errors
    if (errore.type === 'entity.parse.failed') {
      return res.status(400).json({
        successo: false,
        codice: 'JSON_NON_VALIDO',
        messaggio: t('app.jsonNonValido', {}, lingua)
      });
    }

    // Unexpected errors (do not expose details in production)
    logger.error({ errore: errore.message, stack: errore.stack }, 'Errore imprevisto');

    res.status(500).json({
      successo: false,
      codice: 'ERRORE_INTERNO',
      messaggio: AMBIENTE === 'produzione'
        ? t('app.erroreInterno', {}, lingua)
        : errore.message
    });
  });

  // --- Initialize Socket.io ---
  const io = inizializzaSocket(serverHttp);
  // Makes the io instance available to the Express routes (for notifications)
  app.set('io', io);

  return { app, serverHttp, io };
}
