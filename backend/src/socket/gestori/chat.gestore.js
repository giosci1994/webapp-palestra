// ============================================
// GymMaster — Chat socket handler
// Handles the real-time messaging events
// ============================================

import { inviaMessaggio } from '../../services/chat.service.js';
import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';
import { inviaNotificaTelegram, escapeHtml } from '../../services/telegram.service.js';
import { inviaPush } from '../../services/push.service.js';

// Notifies the other participants (fire-and-forget): a push to everyone (with
// the app open the service worker leaves it to the chat; messages of the same
// conversation replace each other) and Telegram to those who are not connected
async function notificaDestinatari(conversazioneId, mittenteId, messaggio, utentiConnessi) {
  try {
    const partecipanti = await prisma.partecipanteChat.findMany({
      where: { conversazioneId, utenteId: { not: mittenteId } },
      select: { utenteId: true }
    });
    const contenuto = messaggio.contenuto || '';
    const anteprima = contenuto.length > 120 ? contenuto.slice(0, 120) + '…' : contenuto;

    for (const p of partecipanti) {
      inviaPush(p.utenteId, {
        titolo: `💬 ${messaggio.mittente?.nome || 'Nuovo messaggio'}`,
        messaggio: anteprima,
        percorso: `/chat/${conversazioneId}`,
        tag: `chat-${conversazioneId}`
      }).catch(() => {});
    }

    const offline = partecipanti.filter(p => !utentiConnessi.has(p.utenteId));
    if (offline.length === 0) return;
    const testo = `💬 <b>${escapeHtml(messaggio.mittente?.nome || 'Qualcuno')}</b> ti ha scritto su GymMaster:\n${escapeHtml(anteprima)}`;
    for (const p of offline) {
      await inviaNotificaTelegram(p.utenteId, testo);
    }
  } catch (errore) {
    logger.error({ conversazioneId, err: errore.message }, 'Errore notifica Telegram offline');
  }
}

/**
 * Registers the chat event handlers for a socket.
 */
export function gestoreChatMessaggi(io, socket, utentiConnessi) {
  const utenteId = socket.utente.utenteId;

  // --- Real-time message sending ---
  socket.on('chat:invia_messaggio', async (dati, callback) => {
    try {
      const { conversazioneId, contenuto } = dati;

      if (!conversazioneId || !contenuto || contenuto.trim().length === 0) {
        return callback?.({ errore: 'Dati messaggio non validi' });
      }

      if (contenuto.length > 2000) {
        return callback?.({ errore: 'Messaggio troppo lungo (max 2000 caratteri)' });
      }

      // Save the message in the database
      const messaggio = await inviaMessaggio(conversazioneId, utenteId, contenuto.trim());

      // Send the message to all the participants of the conversation
      io.to(`conversazione:${conversazioneId}`).emit('chat:nuovo_messaggio', {
        messaggio
      });

      // Push and Telegram to the recipients (does not block the response)
      notificaDestinatari(conversazioneId, utenteId, messaggio, utentiConnessi).catch(() => {});

      callback?.({ successo: true, messaggio });
    } catch (errore) {
      logger.error({ utenteId, errore: errore.message }, 'Errore invio messaggio WebSocket');
      callback?.({ errore: errore.message });
    }
  });

  // --- Join a conversation (room) ---
  socket.on('chat:entra_conversazione', async (dati) => {
    const conversazioneId = dati?.conversazioneId;
    if (!conversazioneId) return;
    // Check participation before joining the room (avoids receiving other people's messages)
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

  // --- Leave a conversation (room) ---
  socket.on('chat:esci_conversazione', (dati) => {
    const { conversazioneId } = dati;
    if (conversazioneId) {
      socket.leave(`conversazione:${conversazioneId}`);
    }
  });

  // --- "sta scrivendo..." (typing) indicator ---
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
