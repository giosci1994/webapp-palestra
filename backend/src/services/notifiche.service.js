// ============================================
// GymMaster — Servizio Notifiche
// Persistenza + emissione real-time
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';

// Quante notifiche tenere per utente: oltre questa soglia le più vecchie
// vengono eliminate, così la tabella non cresce senza fine.
const MAX_PER_UTENTE = 100;

/**
 * Crea una notifica e la consegna in tempo reale se l'utente è collegato.
 *
 * Le notifiche erano finora solo un evento socket volatile: chi non era
 * collegato in quel momento le perdeva. Qui vengono prima salvate e poi
 * emesse, così restano disponibili al rientro.
 *
 * @param {import('socket.io').Server|null} io - Istanza Socket.io (può mancare)
 * @param {number} utenteId - Destinatario
 * @param {{tipo?: string, titolo: string, messaggio: string, percorso?: string}} dati
 */
export async function creaNotifica(io, utenteId, { tipo = 'SISTEMA', titolo, messaggio, percorso = null }) {
  try {
    const notifica = await prisma.allenamentoNotifica.create({
      data: { utenteId, tipo, titolo, messaggio, percorso }
    });

    // L'emissione non deve poter far fallire l'azione che ha generato la
    // notifica: se il socket non è disponibile la notifica resta comunque a DB.
    try {
      io?.to(`utente:${utenteId}`).emit('notifica:nuova', notifica);
    } catch (err) {
      logger.warn({ err, utenteId }, 'Notifica salvata ma non emessa via socket');
    }

    potaVecchie(utenteId).catch(() => {});
    return notifica;
  } catch (err) {
    // Una notifica mancata non deve mai rompere l'operazione principale
    logger.error({ err, utenteId, tipo }, 'Creazione notifica fallita');
    return null;
  }
}

/** Elimina le notifiche più vecchie oltre la soglia per utente. */
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

/** Elenco notifiche dell'utente, più recenti per prime. */
export async function elenco(utenteId, { limite = 30, soloNonLette = false } = {}) {
  return prisma.allenamentoNotifica.findMany({
    where: { utenteId, ...(soloNonLette ? { letta: false } : {}) },
    orderBy: { creatoIl: 'desc' },
    take: Math.min(Math.max(parseInt(limite, 10) || 30, 1), 100)
  });
}

/** Quante notifiche non lette ha l'utente. */
export function contaNonLette(utenteId) {
  return prisma.allenamentoNotifica.count({ where: { utenteId, letta: false } });
}

/** Segna una notifica come letta. Il filtro su utenteId impedisce di toccare quelle altrui. */
export async function segnaLetta(utenteId, notificaId) {
  const esito = await prisma.allenamentoNotifica.updateMany({
    where: { id: notificaId, utenteId },
    data: { letta: true }
  });
  return esito.count > 0;
}

/** Segna come lette tutte le notifiche dell'utente. */
export async function segnaTutteLette(utenteId) {
  const esito = await prisma.allenamentoNotifica.updateMany({
    where: { utenteId, letta: false },
    data: { letta: true }
  });
  return esito.count;
}

/**
 * Promemoria degli allenamenti in programma oggi.
 *
 * Viene richiamato periodicamente dal server. È scritto per poter essere
 * eseguito più volte al giorno senza duplicare nulla: prima di inviare
 * controlla se per quell'utente esiste già un promemoria creato oggi, cosa che
 * rende l'operazione sicura anche dopo un riavvio del processo.
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

  // Raggruppa per utente: un solo promemoria anche con più schede in giornata
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

    await creaNotifica(io, utenteId, {
      tipo: 'PROMEMORIA_ALLENAMENTO',
      titolo: titoli.length === 1 ? 'Oggi ti aspetta un allenamento' : `Oggi ti aspettano ${titoli.length} allenamenti`,
      messaggio: titoli.join(' · '),
      percorso: '/pianificazione'
    });
    inviati++;
  }

  if (inviati > 0) logger.info({ inviati }, 'Promemoria allenamenti inviati');
  return inviati;
}
