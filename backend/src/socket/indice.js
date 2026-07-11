// ============================================
// GymMaster — Setup Socket.io
// Configurazione WebSocket per chat real-time
// ============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { gestoreChatMessaggi } from './gestori/chat.gestore.js';
import { gestoreNotifiche } from './gestori/notifiche.gestore.js';
import logger from '../utils/logger.js';
import prisma from '../config/database.js';

// Mappa utenti connessi: utenteId -> Set<socketId>
const utentiConnessi = new Map();

// Aggiorna (non bloccante) l'ultimo accesso dell'utente
function aggiornaUltimoAccesso(utenteId) {
  prisma.utente.update({ where: { id: utenteId }, data: { ultimoAccesso: new Date() } })
    .catch(() => { /* non bloccante */ });
}

/**
 * Inizializza Socket.io sul server HTTP.
 * @param {import('http').Server} serverHttp
 * @returns {import('socket.io').Server}
 */
export function inizializzaSocket(serverHttp) {
  const originiConsentite = (process.env.ORIGINI_CONSENTITE || 'http://localhost:6969')
    .split(',')
    .map(o => o.trim());

  const io = new Server(serverHttp, {
    cors: {
      origin: originiConsentite,
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // --- Middleware Autenticazione WebSocket ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Autenticazione richiesta'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SEGRETO_ACCESS);
      socket.utente = payload;
      next();
    } catch (errore) {
      return next(new Error('Token non valido'));
    }
  });

  // --- Gestione Connessioni ---
  io.on('connection', (socket) => {
    const utenteId = socket.utente.utenteId;

    // Registra l'utente come connesso (rileva la transizione offline -> online)
    const eraOffline = !utentiConnessi.has(utenteId);
    if (eraOffline) {
      utentiConnessi.set(utenteId, new Set());
    }
    utentiConnessi.get(utenteId).add(socket.id);

    // Unisciti alla room personale dell'utente
    socket.join(`utente:${utenteId}`);

    // Aggiorna ultimo accesso; notifica la presenza solo alla transizione online
    aggiornaUltimoAccesso(utenteId);
    if (eraOffline) {
      io.emit('presenza:cambio', { utenteId, online: true });
    }

    logger.debug({ utenteId, socketId: socket.id }, 'Utente connesso via WebSocket');

    // Registra i gestori di eventi
    gestoreChatMessaggi(io, socket, utentiConnessi);
    gestoreNotifiche(io, socket, utentiConnessi);

    // Richiesta puntuale dello stato di presenza di un utente (es. apertura conversazione)
    socket.on('presenza:richiedi', async ({ utenteId: targetId } = {}) => {
      if (!targetId) return;
      const online = utentiConnessi.has(targetId);
      let ultimoAccesso = null;
      if (!online) {
        try {
          const u = await prisma.utente.findUnique({ where: { id: targetId }, select: { ultimoAccesso: true } });
          ultimoAccesso = u?.ultimoAccesso || null;
        } catch { /* ignora */ }
      }
      socket.emit('presenza:cambio', { utenteId: targetId, online, ultimoAccesso });
    });

    // --- Disconnessione ---
    socket.on('disconnect', (motivo) => {
      const sockets = utentiConnessi.get(utenteId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          utentiConnessi.delete(utenteId);
          // Transizione online -> offline
          aggiornaUltimoAccesso(utenteId);
          io.emit('presenza:cambio', { utenteId, online: false });
        }
      }

      logger.debug({ utenteId, motivo }, 'Utente disconnesso dal WebSocket');
    });

    // --- Errori ---
    socket.on('error', (errore) => {
      logger.error({ utenteId, errore: errore.message }, 'Errore WebSocket');
    });
  });

  logger.info('🔌 Socket.io inizializzato');
  return io;
}

/**
 * Verifica se un utente è attualmente connesso.
 */
export function utenteConnesso(utenteId) {
  return utentiConnessi.has(utenteId);
}

export { utentiConnessi };
