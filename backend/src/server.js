// ============================================
// GymMaster — Server Express Principale
// Entry point dell'applicazione backend
// ============================================

import 'dotenv/config';
import { creaServer } from './app.js';
import { inviaPromemoriaAllenamenti } from './services/notifiche.service.js';
import { pulisciMessaggiScaduti } from './services/chat.service.js';
import logger from './utils/logger.js';
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

// --- App Express, server HTTP e Socket.io (src/app.js) ---
const { serverHttp, io } = creaServer();

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

// --- Promemoria allenamenti in programma (controllo ogni ora) ---
// Si controlla ogni ora invece di programmare un singolo invio giornaliero:
// dopo un riavvio del processo un timer giornaliero ripartirebbe da zero e il
// promemoria salterebbe. inviaPromemoriaAllenamenti e' idempotente (non invia
// due volte nello stesso giorno), quindi ripetere il controllo e' innocuo.
const INTERVALLO_PROMEMORIA = 60 * 60 * 1000; // 1 ora
const ORA_MINIMA_PROMEMORIA = 8;              // non prima delle 8 del mattino
setInterval(async () => {
  try {
    if (new Date().getHours() < ORA_MINIMA_PROMEMORIA) return;
    await inviaPromemoriaAllenamenti(io);
  } catch (errore) {
    logger.error({ errore: errore.message }, 'Errore nell\'invio dei promemoria allenamento');
  }
}, INTERVALLO_PROMEMORIA);

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
