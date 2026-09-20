// ============================================
// GymMaster — Gestore Socket Notifiche
// Gestisce gli eventi di notifica real-time
// ============================================

import logger from '../../utils/logger.js';
import { segnaLetta, creaNotifica as creaNotificaPersistita } from '../../services/notifiche.service.js';

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

  socket.on('notifica:letta', async (dati) => {
    const notificaId = parseInt(dati?.notificaId, 10);
    if (Number.isNaN(notificaId)) return;
    try {
      // segnaLetta filtra per utenteId: nessuno puo' marcare le notifiche altrui
      await segnaLetta(socket.utente.utenteId, notificaId);
      logger.debug({ utenteId: socket.utente.utenteId, notificaId }, 'Notifica segnata come letta');
    } catch (err) {
      logger.warn({ err, notificaId }, 'Impossibile segnare la notifica come letta');
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
  // Deprecata: emetteva soltanto, senza salvare nulla, quindi chi non era
  // collegato perdeva la notifica. Usare creaNotifica dal servizio, che
  // persiste e poi emette. Mantenuta come semplice rimando per compatibilita'.
  return creaNotificaPersistita(io, utenteId, notifica);
}
