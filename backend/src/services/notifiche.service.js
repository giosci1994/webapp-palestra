// ============================================
// GymMaster — Notifications service
// Persistence + real-time delivery
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { inviaPush } from './push.service.js';
import { linguaDiUtenteId, traduciPer } from '../i18n/destinatario.js';

// How many notifications to keep per user: past this threshold the oldest
// ones are deleted, so the table does not grow forever.
const MAX_PER_UTENTE = 100;

/**
 * Creates a notification and delivers it in real time if the user is connected.
 *
 * Until now notifications were only a volatile socket event: whoever was not
 * connected at that moment lost them. Here they are saved first and then
 * emitted, so they are still there when the user comes back.
 *
 * @param {import('socket.io').Server|null} io - Socket.io instance (may be missing)
 * @param {number} utenteId - Recipient
 * @param {{tipo?: string, titolo: string, messaggio: string, percorso?: string}} dati
 */
export async function creaNotifica(io, utenteId, { tipo = 'SISTEMA', titolo, messaggio, percorso = null, variabili = {} }) {
  try {
    // Title and message may be translation keys: they are saved in the
    // language of whoever receives the notification
    const lingua = await linguaDiUtenteId(utenteId);
    titolo = traduciPer(lingua, titolo, variabili);
    messaggio = traduciPer(lingua, messaggio, variabili);

    const notifica = await prisma.allenamentoNotifica.create({
      data: { utenteId, tipo, titolo, messaggio, percorso }
    });

    // Emitting must never make the action that generated the notification
    // fail: if the socket is not available the notification stays in the DB.
    try {
      io?.to(`utente:${utenteId}`).emit('notifica:nuova', notifica);
    } catch (err) {
      logger.warn({ err, utenteId }, 'Notifica salvata ma non emessa via socket');
    }

    // And on the phone, even with the app closed (if the user turned on push
    // notifications; with the app open the service worker leaves it to the
    // notification bell)
    inviaPush(utenteId, { titolo, messaggio, percorso: percorso || '/', tag: tipo }).catch(() => {});

    potaVecchie(utenteId).catch(() => {});
    return notifica;
  } catch (err) {
    // A missed notification must never break the main operation
    logger.error({ err, utenteId, tipo }, 'Creazione notifica fallita');
    return null;
  }
}

/** Deletes the oldest notifications past the per-user threshold. */
async function potaVecchie(utenteId) {
  const totale = await prisma.allenamentoNotifica.count({ where: { utenteId } });
  if (totale <= MAX_PER_UTENTE) return;

  const daTenere = await prisma.allenamentoNotifica.findMany({
    where: { utenteId },
    orderBy: { creatoIl: 'desc' },
    take: MAX_PER_UTENTE,
    select: { id: true }
  });
  await prisma.allenamentoNotifica.deleteMany({
    where: { utenteId, id: { notIn: daTenere.map(n => n.id) } }
  });
}

/** The user's notifications, most recent first. */
export async function elenco(utenteId, { limite = 30, soloNonLette = false } = {}) {
  return prisma.allenamentoNotifica.findMany({
    where: { utenteId, ...(soloNonLette ? { letta: false } : {}) },
    orderBy: { creatoIl: 'desc' },
    take: Math.min(Math.max(parseInt(limite, 10) || 30, 1), 100)
  });
}

/** How many unread notifications the user has. */
export function contaNonLette(utenteId) {
  return prisma.allenamentoNotifica.count({ where: { utenteId, letta: false } });
}

/** Marks a notification as read. The filter on utenteId keeps other users' notifications untouched. */
export async function segnaLetta(utenteId, notificaId) {
  const esito = await prisma.allenamentoNotifica.updateMany({
    where: { id: notificaId, utenteId },
    data: { letta: true }
  });
  return esito.count > 0;
}

/** Marks all of the user's notifications as read. */
export async function segnaTutteLette(utenteId) {
  const esito = await prisma.allenamentoNotifica.updateMany({
    where: { utenteId, letta: false },
    data: { letta: true }
  });
  return esito.count;
}

/**
 * Reminder of the workouts scheduled for today.
 *
 * The server calls it periodically. It is written so it can run several
 * times a day without duplicating anything: before sending, it checks whether
 * a reminder created today already exists for that user, which makes the
 * operation safe even after a process restart.
 */
export async function inviaPromemoriaAllenamenti(io) {
  const adesso = new Date();
  const oggi = new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate()));
  const inizioGiornata = new Date(adesso);
  inizioGiornata.setHours(0, 0, 0, 0);

  const previsti = await prisma.allenamentoPianificato.findMany({
    where: { data: oggi, stato: 'PIANIFICATO' },
    include: { scheda: { select: { titolo: true } } }
  });
  if (previsti.length === 0) return 0;

  // Group by user: a single reminder even with several plans in the day
  const perUtente = new Map();
  for (const p of previsti) {
    if (!perUtente.has(p.utenteId)) perUtente.set(p.utenteId, []);
    perUtente.get(p.utenteId).push(p.scheda.titolo);
  }

  let inviati = 0;
  for (const [utenteId, titoli] of perUtente) {
    const giaInviato = await prisma.allenamentoNotifica.findFirst({
      where: { utenteId, tipo: 'PROMEMORIA_ALLENAMENTO', creatoIl: { gte: inizioGiornata } },
      select: { id: true }
    });
    if (giaInviato) continue;

    // This runs on a timer, outside any request: the title is a key (with a
    // plural count) that creaNotifica translates for the user; the message is
    // just the plan titles
    await creaNotifica(io, utenteId, {
      tipo: 'PROMEMORIA_ALLENAMENTO',
      titolo: 'notificheService.promemoriaAllenamento',
      variabili: { count: titoli.length },
      messaggio: titoli.join(' · '),
      percorso: '/pianificazione'
    });
    inviati++;
  }

  if (inviati > 0) logger.info({ inviati }, 'Promemoria allenamenti inviati');
  return inviati;
}
