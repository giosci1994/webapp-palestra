// ============================================
// GymMaster — Main Express server
// Entry point of the backend application
// ============================================

import 'dotenv/config';
import { creaServer } from './app.js';
import { inviaPromemoriaAllenamenti } from './services/notifiche.service.js';
import { pulisciMessaggiScaduti } from './services/chat.service.js';
import { chiudiSessioniDimenticate } from './services/conclusioneSessione.service.js';
import logger from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { orarioLocale } from './utils/date.js';

// --- Configuration ---
const PORTA = parseInt(process.env.PORTA_BACKEND) || 3000;
const AMBIENTE = process.env.AMBIENTE || 'sviluppo';

// App version read from version.json at startup (with a fallback)
const VERSIONE = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(fs.readFileSync(path.resolve(dir, '../../version.json'), 'utf8')).versione || '1.0.0';
  } catch {
    return '1.0.0';
  }
})();

// --- Express app, HTTP server and Socket.io (src/app.js) ---
const { serverHttp, io } = creaServer();

// --- Periodic cleanup of expired messages (every 6 hours) ---
const INTERVALLO_PULIZIA = 6 * 60 * 60 * 1000; // 6 hours
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

// --- Reminders for scheduled workouts (checked every hour) ---
// We check every hour instead of scheduling a single daily send: after a
// process restart a daily timer would start again from zero and the reminder
// would be skipped. inviaPromemoriaAllenamenti is idempotent (it does not send
// twice on the same day), so repeating the check is harmless.
const INTERVALLO_PROMEMORIA = 60 * 60 * 1000; // 1 hour
const ORA_MINIMA_PROMEMORIA = 8;              // not before 8 in the morning
setInterval(async () => {
  try {
    const { ora } = orarioLocale();
    if (ora < ORA_MINIMA_PROMEMORIA) return;
    await inviaPromemoriaAllenamenti(io);
  } catch (errore) {
    logger.error({ errore: errore.message }, 'Errore nell\'invio dei promemoria allenamento');
  }
}, INTERVALLO_PROMEMORIA);

// --- Workouts left open by mistake (checked every 30 minutes) ---
// Idle for more than two hours: they are closed at the last set, with a
// notification (services/conclusioneSessione.service.js).
const INTERVALLO_SESSIONI_DIMENTICATE = 30 * 60 * 1000;
setInterval(async () => {
  try {
    await chiudiSessioniDimenticate(io);
  } catch (errore) {
    logger.error({ errore: errore.message }, 'Errore nella chiusura degli allenamenti dimenticati');
  }
}, INTERVALLO_SESSIONI_DIMENTICATE);

// --- Server startup ---
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
    if (chiusuraInCorso) return; // Ignore repeated signals
    chiusuraInCorso = true;
    logger.info({ segnale }, 'Segnale di chiusura ricevuto, arresto in corso...');

    // Safety net: force the shutdown if the drain does not finish within 10s.
    // unref() keeps the timer alone from keeping the process alive.
    const timeoutForzato = setTimeout(() => {
      logger.warn('Timeout graceful shutdown, forzo la chiusura');
      process.exit(1);
    }, 10000);
    timeoutForzato.unref();

    try {
      // Stop accepting new connections and wait for the active ones to finish
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

// --- Unhandled errors ---
process.on('unhandledRejection', (motivo, promessa) => {
  logger.error({ motivo: motivo?.message || motivo }, 'Promise non gestita');
});

process.on('uncaughtException', (errore) => {
  logger.error({ errore: errore.message, stack: errore.stack }, 'Eccezione non catturata');
  process.exit(1);
});
