// ============================================
// GymMaster — Socket.io setup
// WebSockets for real-time chat, presence and notifications
// ============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { gestoreChatMessaggi } from './gestori/chat.gestore.js';
import { gestoreNotifiche } from './gestori/notifiche.gestore.js';
import logger from '../utils/logger.js';
import prisma from '../config/database.js';

// Map of connected users: utenteId -> Set<socketId>
const utentiConnessi = new Map();

// Updates the user's last access (non-blocking)
function aggiornaUltimoAccesso(utenteId) {
  prisma.utente.update({ where: { id: utenteId }, data: { ultimoAccesso: new Date() } })
    .catch(() => { /* non-blocking */ });
}

/**
 * Initializes Socket.io on the HTTP server.
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

  // --- WebSocket authentication middleware ---
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

  // --- Connection handling ---
  io.on('connection', (socket) => {
    const utenteId = socket.utente.utenteId;

    // Register the user as connected (detects the offline -> online transition)
    const eraOffline = !utentiConnessi.has(utenteId);
    if (eraOffline) {
      utentiConnessi.set(utenteId, new Set());
    }
    utentiConnessi.get(utenteId).add(socket.id);

    // Join the user's personal room
    socket.join(`utente:${utenteId}`);

    // Update the last access; announce presence only on the transition to online
    aggiornaUltimoAccesso(utenteId);
    if (eraOffline) {
      io.emit('presenza:cambio', { utenteId, online: true });
    }

    logger.debug({ utenteId, socketId: socket.id }, 'Utente connesso via WebSocket');

    // Register the event handlers
    gestoreChatMessaggi(io, socket, utentiConnessi);
    gestoreNotifiche(io, socket, utentiConnessi);

    // One-off request for a user's presence status (e.g. opening a conversation)
    socket.on('presenza:richiedi', async ({ utenteId: targetId } = {}) => {
      if (!targetId) return;
      const online = utentiConnessi.has(targetId);
      let ultimoAccesso = null;
      if (!online) {
        try {
          const u = await prisma.utente.findUnique({ where: { id: targetId }, select: { ultimoAccesso: true } });
          ultimoAccesso = u?.ultimoAccesso || null;
        } catch { /* ignore */ }
      }
      socket.emit('presenza:cambio', { utenteId: targetId, online, ultimoAccesso });
    });

    // --- Disconnection ---
    socket.on('disconnect', (motivo) => {
      const sockets = utentiConnessi.get(utenteId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          utentiConnessi.delete(utenteId);
          // Online -> offline transition
          aggiornaUltimoAccesso(utenteId);
          io.emit('presenza:cambio', { utenteId, online: false });
        }
      }

      logger.debug({ utenteId, motivo }, 'Utente disconnesso dal WebSocket');
    });

    // --- Errors ---
    socket.on('error', (errore) => {
      logger.error({ utenteId, errore: errore.message }, 'Errore WebSocket');
    });
  });

  logger.info('🔌 Socket.io inizializzato');
  return io;
}

/**
 * Checks whether a user is currently connected.
 */
export function utenteConnesso(utenteId) {
  return utentiConnessi.has(utenteId);
}

export { utentiConnessi };
