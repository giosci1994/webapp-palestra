// ============================================
// GymMaster — Server Express Principale
// Entry point dell'applicazione backend
// ============================================

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import { configuraHelmet, configuraCORS } from './config/sicurezza.js';
import { limitatoreGlobale } from './middleware/limitatore.js';
import { inizializzaSocket } from './socket/indice.js';
import router from './routes/indice.js';
import { pulisciMessaggiScaduti } from './services/chat.service.js';
import logger from './utils/logger.js';
import { ErroreApp } from './utils/errori.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configurazione ---
const PORTA = parseInt(process.env.PORTA_BACKEND) || 3000;
const AMBIENTE = process.env.AMBIENTE || 'sviluppo';

// Versione applicazione letta da version.json all'avvio (con fallback)
const VERSIONE = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(fs.readFileSync(path.resolve(dir, '../../version.json'), 'utf8')).versione || '1.0.0';
  } catch {
    return '1.0.0';
  }
})();

// --- Crea App Express ---
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

// --- Pulizia periodica messaggi scaduti (ogni 6 ore) ---
const INTERVALLO_PULIZIA = 6 * 60 * 60 * 1000; // 6 ore
setInterval(async () => {
  try {
    const eliminati = await pulisciMessaggiScaduti();
    if (eliminati > 0) {
      logger.info({ eliminati }, 'Pulizia messaggi scaduti eseguita');
    }
  } catch (errore) {
    logger.error({ errore: errore.message }, 'Errore nella pulizia messaggi');
  }
}, INTERVALLO_PULIZIA);

// --- Avvio Server ---
serverHttp.listen(PORTA, '0.0.0.0', () => {
  logger.info(`
  ╔══════════════════════════════════════════════╗
  ║        🏋️ GymMaster API v${VERSIONE.padEnd(19)}║
  ║        Ambiente: ${AMBIENTE.padEnd(25)}║
  ║        Porta: ${String(PORTA).padEnd(29)}║
  ║        Socket.io: Attivo                     ║
  ╚══════════════════════════════════════════════╝
  `);
});

// --- Graceful Shutdown ---
const segnaliChiusura = ['SIGTERM', 'SIGINT'];
let chiusuraInCorso = false;

for (const segnale of segnaliChiusura) {
  process.on(segnale, async () => {
    if (chiusuraInCorso) return; // Ignora segnali ripetuti
    chiusuraInCorso = true;
    logger.info({ segnale }, 'Segnale di chiusura ricevuto, arresto in corso...');

    // Rete di sicurezza: forza la chiusura se il drain non termina entro 10s.
    // unref() evita che il timer da solo tenga vivo il processo.
    const timeoutForzato = setTimeout(() => {
      logger.warn('Timeout graceful shutdown, forzo la chiusura');
      process.exit(1);
    }, 10000);
    timeoutForzato.unref();

    try {
      // Smetti di accettare nuove connessioni e attendi che quelle attive terminino
      await Promise.all([
        new Promise((risolvi) => serverHttp.close(risolvi)),
        new Promise((risolvi) => io.close(risolvi))
      ]);
      logger.info('Server HTTP e Socket.io chiusi correttamente');
      clearTimeout(timeoutForzato);
      process.exit(0);
    } catch (errore) {
      logger.error({ errore: errore?.message }, 'Errore durante lo shutdown');
      process.exit(1);
    }
  });
}

// --- Errori non gestiti ---
process.on('unhandledRejection', (motivo, promessa) => {
  logger.error({ motivo: motivo?.message || motivo }, 'Promise non gestita');
});

process.on('uncaughtException', (errore) => {
  logger.error({ errore: errore.message, stack: errore.stack }, 'Eccezione non catturata');
  process.exit(1);
});
