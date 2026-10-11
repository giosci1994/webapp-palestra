// ============================================
// GymMaster — Notifications socket handler
// Handles the real-time notification events
// ============================================

import logger from '../../utils/logger.js';
import { segnaLetta, creaNotifica as creaNotificaPersistita } from '../../services/notifiche.service.js';

/**
 * Registers the notification handlers for a socket.
 * Notifications are sent to the user's personal room.
 */
export function gestoreNotifiche(io, socket, utentiConnessi) {
  // Notifications are saved and emitted by services/notifiche.service.js
  // (creaNotifica): contact requests, plans, reminders, records and more.

  // Notifications are emitted by the server, not by the client
  // This handler only handles the read confirmations

  socket.on('notifica:letta', async (dati) => {
    const notificaId = parseInt(dati?.notificaId, 10);
    if (Number.isNaN(notificaId)) return;
    try {
      // segnaLetta filters by utenteId: nobody can mark other people's notifications
      await segnaLetta(socket.utente.utenteId, notificaId);
      logger.debug({ utenteId: socket.utente.utenteId, notificaId }, 'Notifica segnata come letta');
    } catch (err) {
      logger.warn({ err, notificaId }, 'Impossibile segnare la notifica come letta');
    }
  });
}

/**
 * Sends a notification to a specific user.
 * Usable from any backend service.
 *
 * @param {import('socket.io').Server} io - Socket.io instance
 * @param {number} utenteId - ID of the recipient user
 * @param {Object} notifica - Notification object
 * @param {string} notifica.tipo - Type (e.g. 'nuova_richiesta', 'messaggio', 'record')
 * @param {string} notifica.titolo - Title of the notification
 * @param {string} notifica.messaggio - Body of the notification
 * @param {Object} [notifica.dati] - Extra data
 */
export function inviaNotifica(io, utenteId, notifica) {
  // Deprecated: it only emitted, without saving anything, so whoever was not
  // connected lost the notification. Use creaNotifica from the service, which
  // persists and then emits. Kept as a simple forward for compatibility.
  return creaNotificaPersistita(io, utenteId, notifica);
}
