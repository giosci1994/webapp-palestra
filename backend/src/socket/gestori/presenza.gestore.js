// ============================================
// GymMaster — Presence socket handler
// Online / last seen, only between people who share a conversation
// ============================================
//
// The app shows presence in one place: the header of a conversation
// (Conversazione.jsx), about the other participant. So a user's presence
// reaches only the people who share a conversation with them, and a request
// for someone else's presence is answered only about such a person.

import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';

/** The users who share at least one conversation with utenteId */
export async function contattiDi(utenteId) {
  const righe = await prisma.partecipanteChat.findMany({
    where: { utenteId: { not: utenteId }, conversazione: { partecipanti: { some: { utenteId } } } },
    distinct: ['utenteId'],
    select: { utenteId: true }
  });
  return righe.map(r => r.utenteId);
}

/** True when the two users share a conversation */
export async function condividonoConversazione(utenteId, altroId) {
  const riga = await prisma.partecipanteChat.findFirst({
    where: { utenteId: altroId, conversazione: { partecipanti: { some: { utenteId } } } },
    select: { utenteId: true }
  });
  return !!riga;
}

/**
 * Tells a user's contacts that they went online or offline. The state is read
 * when the message leaves, not when it was decided: a connection and a
 * disconnection close together cannot arrive in the wrong order and leave the
 * wrong state.
 */
export async function annunciaPresenza(io, utenteId, utentiConnessi) {
  try {
    const contatti = await contattiDi(utenteId);
    if (contatti.length === 0) return;
    io.to(contatti.map(id => `utente:${id}`)).emit('presenza:cambio', { utenteId, online: utentiConnessi.has(utenteId) });
  } catch (errore) {
    logger.error({ utenteId, errore: errore.message }, 'Errore annuncio presenza');
  }
}

/**
 * Registers presenza:richiedi: one-off request for a user's status (opening a
 * conversation). No answer about someone the user shares no conversation with.
 */
export function gestorePresenza(io, socket, utentiConnessi) {
  const utenteId = socket.utente.utenteId;

  socket.on('presenza:richiedi', async (dati) => {
    const altroId = dati?.utenteId;
    if (!Number.isInteger(altroId) || altroId < 1 || altroId === utenteId) return;
    if (!(await condividonoConversazione(utenteId, altroId).catch(() => false))) return;

    const online = utentiConnessi.has(altroId);
    let ultimoAccesso = null;
    if (!online) {
      try {
        const altro = await prisma.utente.findUnique({ where: { id: altroId }, select: { ultimoAccesso: true } });
        ultimoAccesso = altro?.ultimoAccesso || null;
      } catch { /* ignore */ }
    }
    socket.emit('presenza:cambio', { utenteId: altroId, online, ultimoAccesso });
  });
}
