// ============================================
// GymMaster — Gestore Socket Notifiche
// Gestisce gli eventi di notifica real-time
// ============================================

import logger from '../../utils/logger.js';

/**
 * Registra i gestori delle notifiche per un socket.
 * Le notifiche vengono inviate alla room personale dell'utente.
 */
export function gestoreNotifiche(io, socket, utentiConnessi) {
  // Per ora questo gestore serve come infrastruttura per notifiche future:
  // - Nuova richiesta di contatto
  // - Richiesta accettata/rifiutata
  // - Nuovo messaggio (quando non sei nella conversazione)
  // - Record personale raggiunto
  // - Approvazione account

  // Le notifiche vengono emesse dal server, non dal client
  // Questo gestore gestisce solo le conferme di lettura

  socket.on('notifica:letta', (dati) => {
    const { notificaId } = dati;
    if (notificaId) {
      logger.debug({ utenteId: socket.utente.utenteId, notificaId }, 'Notifica segnata come letta');
      // TODO: Implementare quando il modello Notifica sarà aggiunto
    }
  });
}

/**
 * Invia una notifica a un utente specifico.
 * Utilizzabile da qualsiasi service del backend.
 *
 * @param {import('socket.io').Server} io - Istanza Socket.io
 * @param {number} utenteId - ID dell'utente destinatario
 * @param {Object} notifica - Oggetto notifica
 * @param {string} notifica.tipo - Tipo (es. 'nuova_richiesta', 'messaggio', 'record')
 * @param {string} notifica.titolo - Titolo della notifica
 * @param {string} notifica.messaggio - Corpo della notifica
 * @param {Object} [notifica.dati] - Dati aggiuntivi
 */
export function inviaNotifica(io, utenteId, notifica) {
  io.to(`utente:${utenteId}`).emit('notifica:nuova', {
    ...notifica,
    timestamp: new Date().toISOString()
  });
}
