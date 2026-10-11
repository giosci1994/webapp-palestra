// ============================================
// GymMaster — Chat service
// Business logic for messaging and contacts
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreConflitto, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';

/**
 * Sends a contact request to another user.
 */
export async function inviaRichiestaContatto(mittenteId, destinatarioId) {
  if (mittenteId === destinatarioId) {
    throw new ErroreValidazione('Non puoi inviare una richiesta a te stesso');
  }

  // Check that the recipient exists
  const destinatario = await prisma.utente.findUnique({ where: { id: destinatarioId } });
  if (!destinatario) throw new ErroreNonTrovato('Utente destinatario non trovato');

  // Check whether a request already exists (in either direction)
  const richiestaEsistente = await prisma.richiestaContatto.findFirst({
    where: {
      OR: [
        { mittenteId, destinatarioId },
        { mittenteId: destinatarioId, destinatarioId: mittenteId }
      ]
    }
  });

  if (richiestaEsistente) {
    if (richiestaEsistente.stato === 'BLOCCATA') {
      throw new ErroreNonAutorizzato('Non puoi contattare questo utente');
    }
    throw new ErroreConflitto('Esiste già una richiesta di contatto con questo utente');
  }

  const richiesta = await prisma.richiestaContatto.create({
    data: { mittenteId, destinatarioId },
    include: {
      mittente: { select: { id: true, nome: true } },
      destinatario: { select: { id: true, nome: true } }
    }
  });

  logger.info({ mittenteId, destinatarioId }, 'Richiesta di contatto inviata');
  return richiesta;
}

/**
 * Answers a contact request (accept, decline, block).
 */
export async function rispondiRichiestaContatto(richiestaId, utenteId, stato) {
  const richiesta = await prisma.richiestaContatto.findUnique({
    where: { id: richiestaId }
  });

  if (!richiesta) throw new ErroreNonTrovato('Richiesta di contatto non trovata');
  if (richiesta.destinatarioId !== utenteId) {
    throw new ErroreNonAutorizzato('Puoi rispondere solo alle tue richieste');
  }
  if (richiesta.stato !== 'IN_ATTESA') {
    throw new ErroreValidazione('Questa richiesta ha già ricevuto una risposta');
  }

  const richiestaAggiornata = await prisma.richiestaContatto.update({
    where: { id: richiestaId },
    data: { stato, dataRisposta: new Date() }
  });

  // If accepted, create the conversation
  if (stato === 'ACCETTATA') {
    // Pick the chat type based on the role
    const mittente = await prisma.utente.findUnique({
      where: { id: richiesta.mittenteId },
      select: { ruolo: true }
    });
    const destinatario = await prisma.utente.findUnique({
      where: { id: richiesta.destinatarioId },
      select: { ruolo: true }
    });

    const tipo = (mittente.ruolo === 'PERSONAL_TRAINER' || destinatario.ruolo === 'PERSONAL_TRAINER')
      ? 'PERSONAL_TRAINER'
      : 'PRIVATA';

    const conversazione = await prisma.conversazione.create({
      data: {
        tipo,
        partecipanti: {
          create: [
            { utenteId: richiesta.mittenteId },
            { utenteId: richiesta.destinatarioId }
          ]
        }
      },
      include: {
        partecipanti: {
          include: { utente: { select: { id: true, nome: true, ruolo: true } } }
        }
      }
    });

    logger.info({ conversazioneId: conversazione.id }, 'Conversazione creata');
    return { richiesta: richiestaAggiornata, conversazione };
  }

  return { richiesta: richiestaAggiornata };
}

/**
 * Gets the contact requests the user received.
 */
export async function ottieniRichiesteRicevute(utenteId) {
  return prisma.richiestaContatto.findMany({
    where: { destinatarioId: utenteId, stato: 'IN_ATTESA' },
    include: {
      mittente: { select: { id: true, nome: true, ruolo: true } }
    },
    orderBy: { dataRichiesta: 'desc' }
  });
}

/**
 * Gets the user's conversations.
 */
export async function ottieniConversazioni(utenteId) {
  return prisma.conversazione.findMany({
    where: {
      partecipanti: { some: { utenteId } }
    },
    include: {
      partecipanti: {
        include: { utente: { select: { id: true, nome: true, ruolo: true } } }
      },
      messaggi: {
        orderBy: { inviatoIl: 'desc' },
        take: 1, // Only the latest message, for the preview
        select: { contenuto: true, inviatoIl: true, mittenteId: true, letto: true }
      }
    },
    orderBy: { creatoIl: 'desc' }
  });
}

/**
 * Gets a conversation's messages (paginated).
 */
export async function ottieniMessaggi(conversazioneId, utenteId, { pagina = 1, limite = 50 }) {
  // Check that the user is a participant
  const partecipazione = await prisma.partecipanteChat.findUnique({
    where: {
      conversazioneId_utenteId: { conversazioneId, utenteId }
    }
  });

  if (!partecipazione) {
    throw new ErroreNonAutorizzato('Non fai parte di questa conversazione');
  }

  const [messaggi, totale] = await Promise.all([
    prisma.messaggio.findMany({
      where: { conversazioneId },
      include: {
        mittente: { select: { id: true, nome: true, ruolo: true } }
      },
      orderBy: { inviatoIl: 'desc' },
      skip: (pagina - 1) * limite,
      take: limite
    }),
    prisma.messaggio.count({ where: { conversazioneId } })
  ]);

  // Mark the others' messages as read
  await prisma.messaggio.updateMany({
    where: {
      conversazioneId,
      mittenteId: { not: utenteId },
      letto: false
    },
    data: { letto: true }
  });

  return {
    messaggi: messaggi.reverse(), // Chronological order
    paginazione: { pagina, limite, totale, pagine: Math.ceil(totale / limite) }
  };
}

/**
 * Sends a message in a conversation.
 */
export async function inviaMessaggio(conversazioneId, mittenteId, contenuto) {
  // Check participation
  const partecipazione = await prisma.partecipanteChat.findUnique({
    where: {
      conversazioneId_utenteId: { conversazioneId, utenteId: mittenteId }
    }
  });

  if (!partecipazione) {
    throw new ErroreNonAutorizzato('Non fai parte di questa conversazione');
  }

  const messaggio = await prisma.messaggio.create({
    data: { conversazioneId, mittenteId, contenuto },
    include: {
      mittente: { select: { id: true, nome: true, ruolo: true } }
    }
  });

  return messaggio;
}

/**
 * Cleans up expired messages based on each user's retention.
 */
export async function pulisciMessaggiScaduti() {
  // Find users with a retention set (> 0 days)
  const utentiConRetention = await prisma.utente.findMany({
    where: { chatRetentionGiorni: { gt: 0 } },
    select: { id: true, chatRetentionGiorni: true }
  });

  let messaggiEliminati = 0;

  for (const utente of utentiConRetention) {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - utente.chatRetentionGiorni);

    const risultato = await prisma.messaggio.deleteMany({
      where: {
        mittenteId: utente.id,
        inviatoIl: { lt: dataLimite }
      }
    });

    messaggiEliminati += risultato.count;
  }

  if (messaggiEliminati > 0) {
    logger.info({ messaggiEliminati }, 'Pulizia messaggi scaduti completata');
  }

  return messaggiEliminati;
}

/**
 * Counts the unread messages addressed to the user.
 * Leaves out the user's own messages: "unread" only makes sense for received ones.
 */
export async function contaNonLetti(utenteId) {
  return prisma.messaggio.count({
    where: {
      letto: false,
      mittenteId: { not: utenteId },
      conversazione: { partecipanti: { some: { utenteId } } }
    }
  });
}
