// ============================================
// GymMaster — Applicazione Express
// App, server HTTP e Socket.io, senza metterli in ascolto
// ============================================
//
// server.js li avvia sulla porta del backend e aggiunge i lavori periodici;
// i test d'integrazione li avviano su una porta libera, senza timer.

import express from 'express';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import { configuraHelmet, configuraCORS } from './config/sicurezza.js';
import { limitatoreGlobale } from './middleware/limitatore.js';
import { inizializzaSocket } from './socket/indice.js';
import router from './routes/indice.js';
import logger from './utils/logger.js';
import { ErroreApp } from './utils/errori.js';

const AMBIENTE = process.env.AMBIENTE || 'sviluppo';

/**
 * Crea l'app Express con tutte le rotte, il server HTTP che la serve e
 * Socket.io agganciato a quel server.
 * @returns {{ app: import('express').Express, serverHttp: import('http').Server, io: import('socket.io').Server }}
 */
export function creaServer() {
  const app = express();
  const serverHttp = createServer(app);

  // --- Middleware di Sicurezza ---
  app.use(configuraHelmet());
  app.use(configuraCORS());
  app.use(limitatoreGlobale);

  // --- Middleware di Parsing ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // --- Trust proxy (per Nginx e Cloudflare) ---
  app.set('trust proxy', 1);

  // --- Log delle richieste (solo in sviluppo) ---
  if (AMBIENTE !== 'produzione') {
    app.use((req, res, next) => {
      logger.debug({ metodo: req.method, percorso: req.path }, 'Richiesta ricevuta');
      next();
    });
  }

  // --- Monta le rotte API ---
  app.use('/api/v1', router);

  // --- Gestione Errori Centralizzata ---
  app.use((errore, req, res, next) => {
    // Errori personalizzati dell'app
    if (errore instanceof ErroreApp) {
      return res.status(errore.codiceStato).json({
        successo: false,
        codice: errore.codice,
        messaggio: errore.message,
        ...(errore.dettagli && { dettagli: errore.dettagli })
      });
    }

    // Errori CORS
    if (errore.message?.includes('CORS')) {
      return res.status(403).json({
        successo: false,
        codice: 'CORS_BLOCCATO',
        messaggio: 'Origine non consentita'
      });
    }

    // Errori di parsing JSON
    if (errore.type === 'entity.parse.failed') {
      return res.status(400).json({
        successo: false,
        codice: 'JSON_NON_VALIDO',
        messaggio: 'Il corpo della richiesta non è un JSON valido'
      });
    }

    // Errori imprevisti (non esporre dettagli in produzione)
    logger.error({ errore: errore.message, stack: errore.stack }, 'Errore imprevisto');

    res.status(500).json({
      successo: false,
      codice: 'ERRORE_INTERNO',
      messaggio: AMBIENTE === 'produzione'
        ? 'Si è verificato un errore interno del server'
        : errore.message
    });
  });

  // --- Inizializza Socket.io ---
  const io = inizializzaSocket(serverHttp);
  // Rende l'istanza io accessibile dalle rotte Express (per notifiche)
  app.set('io', io);

  return { app, serverHttp, io };
}
