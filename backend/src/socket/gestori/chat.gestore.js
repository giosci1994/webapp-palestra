// ============================================
// GymMaster — Gestore Socket Chat
// Gestisce gli eventi di messaggistica real-time
// ============================================

import { inviaMessaggio } from '../../services/chat.service.js';
import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';
import { inviaNotificaTelegram, escapeHtml } from '../../services/telegram.service.js';

// Notifica via Telegram i partecipanti che NON sono online (fire-and-forget)
async function notificaDestinatariOffline(conversazioneId, mittenteId, messaggio, utentiConnessi) {
  try {
    const partecipanti = await prisma.partecipanteChat.findMany({
      where: { conversazioneId, utenteId: { not: mittenteId } },
      select: { utenteId: true }
    });
    const offline = partecipanti.filter(p => !utentiConnessi.has(p.utenteId));
    if (offline.length === 0) return;

    const contenuto = messaggio.contenuto || '';
    const anteprima = contenuto.length > 120 ? contenuto.slice(0, 120) + '…' : contenuto;
    const testo = `💬 <b>${escapeHtml(messaggio.mittente?.nome || 'Qualcuno')}</b> ti ha scritto su GymMaster:\n${escapeHtml(anteprima)}`;
    for (const p of offline) {
      await inviaNotificaTelegram(p.utenteId, testo);
    }
  } catch (errore) {
    logger.error({ conversazioneId, err: errore.message }, 'Errore notifica Telegram offline');
  }
}

/**
 * Registra i gestori degli eventi chat per un socket.
 */
export function gestoreChatMessaggi(io, socket, utentiConnessi) {
  const utenteId = socket.utente.utenteId;

  // --- Invio messaggio real-time ---
  socket.on('chat:invia_messaggio', async (dati, callback) => {
    try {
      const { conversazioneId, contenuto } = dati;

      if (!conversazioneId || !contenuto || contenuto.trim().length === 0) {
        return callback?.({ errore: 'Dati messaggio non validi' });
      }

      if (contenuto.length > 2000) {
        return callback?.({ errore: 'Messaggio troppo lungo (max 2000 caratteri)' });
      }

      // Salva il messaggio nel database
      const messaggio = await inviaMessaggio(conversazioneId, utenteId, contenuto.trim());

      // Invia il messaggio a tutti i partecipanti della conversazione
      io.to(`conversazione:${conversazioneId}`).emit('chat:nuovo_messaggio', {
        messaggio
      });

      // Notifica Telegram ai destinatari offline (non blocca la risposta)
      notificaDestinatariOffline(conversazioneId, utenteId, messaggio, utentiConnessi).catch(() => {});

      callback?.({ successo: true, messaggio });
    } catch (errore) {
      logger.error({ utenteId, errore: errore.message }, 'Errore invio messaggio WebSocket');
      callback?.({ errore: errore.message });
    }
  });

  // --- Unisciti a una conversazione (room) ---
  socket.on('chat:entra_conversazione', async (dati) => {
    const conversazioneId = dati?.conversazioneId;
    if (!conversazioneId) return;
    // Verifica la partecipazione prima di unirsi alla room (evita di ricevere messaggi altrui)
    const partecipa = await prisma.partecipanteChat.findUnique({
      where: { conversazioneId_utenteId: { conversazioneId, utenteId } }
    }).catch(() => null);
    if (!partecipa) {
      logger.warn({ utenteId, conversazioneId }, 'Tentativo di entrare in una conversazione non propria');
      return;
    }
    socket.join(`conversazione:${conversazioneId}`);
    logger.debug({ utenteId, conversazioneId }, 'Utente entrato nella conversazione');
  });

  // --- Esci da una conversazione (room) ---
  socket.on('chat:esci_conversazione', (dati) => {
    const { conversazioneId } = dati;
    if (conversazioneId) {
      socket.leave(`conversazione:${conversazioneId}`);
    }
  });

  // --- Indicatore "sta scrivendo..." ---
  socket.on('chat:sta_scrivendo', (dati) => {
    const { conversazioneId } = dati;
    if (conversazioneId) {
      socket.to(`conversazione:${conversazioneId}`).emit('chat:sta_scrivendo', {
        utenteId,
        conversazioneId
      });
    }
  });

  socket.on('chat:smesso_scrivere', (dati) => {
    const { conversazioneId } = dati;
    if (conversazioneId) {
      socket.to(`conversazione:${conversazioneId}`).emit('chat:smesso_scrivere', {
        utenteId,
        conversazioneId
      });
    }
  });
}
