// ============================================
// GymMaster — Socket handlers that cannot crash the server
// ============================================
//
// An exception thrown by a socket handler is not caught by anyone: it becomes
// an uncaughtException and the process exits (server.js). A client can send
// any event with any data, so every handler registered on the socket is
// wrapped: an error is logged and the server goes on.

import logger from '../utils/logger.js';

export function proteggiGestori(socket) {
  const registra = socket.on.bind(socket);
  socket.on = (evento, gestore) => registra(evento, (...argomenti) => {
    const segnala = (errore) => logger.error(
      { evento, utenteId: socket.utente?.utenteId, errore: errore?.message },
      'Errore in un gestore WebSocket'
    );
    try {
      const esito = gestore(...argomenti);
      if (esito && typeof esito.catch === 'function') esito.catch(segnala);
    } catch (errore) {
      segnala(errore);
    }
  });
  return socket;
}
