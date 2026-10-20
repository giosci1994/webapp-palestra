// ============================================
// GymMaster — Notifications service
// Persistence + real-time delivery
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { inviaPush } from './push.service.js';
import { escapeHtml, inviaNotificaTelegram } from './telegram.service.js';
import { linguaDiUtenteId, traduciPer } from '../i18n/destinatario.js';
import { fusoDi, giornoLocale, inizioGiorno, orarioLocale } from '../utils/date.js';

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

    // And on Telegram for whoever does not have the app open, if they linked
    // it in Profile (as for chat messages)
    avvisaSuTelegram(io, utenteId, { titolo, messaggio, percorso, lingua }).catch(() => {});

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

/** The page of the app as a full link, for messages outside the app; null without APP_URL */
function linkApp(percorso) {
  if (!process.env.APP_URL) return null;
  try { return new URL(percorso || '/', process.env.APP_URL).href; } catch { return null; }
}

/**
 * The notification on Telegram, if the user has no connection open (the app
 * is closed or in the background) and linked Telegram. Title, text and a
 * link to the page, in the user's language.
 */
async function avvisaSuTelegram(io, utenteId, { titolo, messaggio, percorso, lingua }) {
  const collegato = io ? (await io.in(`utente:${utenteId}`).fetchSockets()).length > 0 : false;
  if (collegato) return;
  const righe = [`🔔 <b>${escapeHtml(titolo)}</b>`];
  if (messaggio) righe.push(escapeHtml(messaggio));
  const link = linkApp(percorso);
  if (link) righe.push(`<a href="${escapeHtml(link).replace(/"/g, '&quot;')}">${escapeHtml(traduciPer(lingua, 'notificheService.telegramApri'))}</a>`);
  await inviaNotificaTelegram(utenteId, righe.join('\n'));
}

/**
 * The same notification for every active admin, each in their own language
 * (exercise suggestions, requests to become a personal trainer).
 * @returns {Promise<number>} how many admins it reached
 */
export async function notificaAdmin(io, dati) {
  const admin = await prisma.utente.findMany({ where: { ruolo: 'SUPERADMIN', stato: 'ATTIVO' }, select: { id: true } });
  await Promise.all(admin.map(({ id }) => creaNotifica(io, id, dati)));
  return admin.length;
}

/** Marks all of the user's notifications as read. */
export async function segnaTutteLette(utenteId) {
  const esito = await prisma.allenamentoNotifica.updateMany({
    where: { utenteId, letta: false },
    data: { letta: true }
  });
  return esito.count;
}

/** Not before this hour, in the user's own time zone */
const ORA_PROMEMORIA = 8;

/**
 * Reminder of the workouts scheduled for today, from 8 in the morning: today
 * and the hour are each user's own (their time zone, utils/date.js).
 *
 * The server calls it every hour. It is written so it can run several times
 * a day without duplicating anything: before sending, it checks whether a
 * reminder was created since the user's local midnight, which makes the
 * operation safe even after a process restart.
 */
export async function inviaPromemoriaAllenamenti(io, adesso = new Date()) {
  // Today is a different calendar day across time zones: the schedule is read
  // from yesterday to tomorrow (UTC), then each plan is checked in its user's
  const giorno = 86400000;
  const oggiUTC = giornoLocale(adesso, 'UTC').getTime();
  const previsti = await prisma.allenamentoPianificato.findMany({
    where: { data: { gte: new Date(oggiUTC - giorno), lte: new Date(oggiUTC + giorno) }, stato: 'PIANIFICATO' },
    include: { scheda: { select: { titolo: true } }, utente: { select: { fusoOrario: true } } }
  });

  // Group by user: a single reminder even with several plans in the day
  const perUtente = new Map();
  for (const p of previsti) {
    const fuso = fusoDi(p.utente);
    if (p.data.getTime() !== giornoLocale(adesso, fuso).getTime()) continue;
    if (orarioLocale(adesso, fuso).ora < ORA_PROMEMORIA) continue;
    if (!perUtente.has(p.utenteId)) perUtente.set(p.utenteId, { fuso, titoli: [] });
    perUtente.get(p.utenteId).titoli.push(p.scheda.titolo);
  }

  let inviati = 0;
  for (const [utenteId, { fuso, titoli }] of perUtente) {
    const giaInviato = await prisma.allenamentoNotifica.findFirst({
      where: { utenteId, tipo: 'PROMEMORIA_ALLENAMENTO', creatoIl: { gte: inizioGiorno(adesso, fuso) } },
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
