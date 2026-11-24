// ============================================
// GymMaster — Socket.io setup
// WebSockets for real-time chat, presence and notifications
// ============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { gestoreChatMessaggi } from './gestori/chat.gestore.js';
import { gestoreNotifiche } from './gestori/notifiche.gestore.js';
import { gestorePresenza, annunciaPresenza } from './gestori/presenza.gestore.js';
import { proteggiGestori } from './protezione.js';
import { registraIo } from './sessioni.js';
import { controllaSessione } from '../middleware/autenticazione.js';
import { ErroreNonAutenticato } from '../utils/errori.js';
import logger from '../utils/logger.js';
import prisma from '../config/database.js';
import { t, linguaDaIntestazione } from '../i18n/index.js';

// Map of connected users: utenteId -> Set<socketId>
const utentiConnessi = new Map();

// Updates the user's last access (non-blocking)
function aggiornaUltimoAccesso(utenteId) {
  prisma.utente.update({ where: { id: utenteId }, data: { ultimoAccesso: new Date() } })
    .catch(() => { /* non-blocking */ });
}

/**
 * WebSocket authentication: the same checks as verificaToken for the REST
 * API. A valid signature is not enough: the user must still exist and be
 * active, and their session must not have been closed (logout, another
 * device, a theft).
 */
export async function autenticaSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  // Nobody is signed in yet, so there is no user language: the browser's
  // (Accept-Language of the handshake)
  const lingua = linguaDaIntestazione(socket.handshake.headers?.['accept-language']);

  if (!token) {
    return next(new Error(t('socketIndice.autenticazioneRichiesta', {}, lingua)));
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SEGRETO_ACCESS);
  } catch {
    return next(new Error(t('socketIndice.tokenNonValido', {}, lingua)));
  }

  try {
    await controllaSessione(payload, lingua);
  } catch (errore) {
    if (errore instanceof ErroreNonAutenticato) return next(new Error(errore.message));
    logger.error({ errore: errore.message }, 'Errore imprevisto nella verifica del token WebSocket');
    return next(new Error(t('socketIndice.tokenNonValido', {}, lingua)));
  }

  socket.utente = payload;
  next();
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
  io.use(autenticaSocket);

  // The services disconnect the sockets of the sessions they close
  registraIo(io);

  // --- Connection handling ---
  io.on('connection', (socket) => {
    // A handler that throws logs the error instead of stopping the server
    proteggiGestori(socket);
    const utenteId = socket.utente.utenteId;

    // Register the user as connected (detects the offline -> online transition)
    const eraOffline = !utentiConnessi.has(utenteId);
    if (eraOffline) {
      utentiConnessi.set(utenteId, new Set());
    }
    utentiConnessi.get(utenteId).add(socket.id);

    // Join the user's personal room
    socket.join(`utente:${utenteId}`);

    // Update the last access; announce presence (to the user's contacts) only
    // on the transition to online
    aggiornaUltimoAccesso(utenteId);
    if (eraOffline) {
      annunciaPresenza(io, utenteId, utentiConnessi);
    }

    logger.debug({ utenteId, socketId: socket.id }, 'Utente connesso via WebSocket');

    // Register the event handlers
    gestoreChatMessaggi(io, socket, utentiConnessi);
    gestoreNotifiche(io, socket, utentiConnessi);
    gestorePresenza(io, socket, utentiConnessi);

    // --- Disconnection ---
    socket.on('disconnect', (motivo) => {
      const sockets = utentiConnessi.get(utenteId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          utentiConnessi.delete(utenteId);
          // Online -> offline transition
          aggiornaUltimoAccesso(utenteId);
          annunciaPresenza(io, utenteId, utentiConnessi);
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
