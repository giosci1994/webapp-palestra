// ============================================
// GymMaster — End of a workout
// ============================================
//
// Closing a workout: duration, volume, calendar and personal records. It
// happens when someone taps "Termina" (finish), and the server does it for
// workouts left open.
//
// A workout forgotten open and closed days later lasted days (21, 72 and 93
// hours in production) and skewed average durations, recovery and badges.
// Since sets carry the time they were logged, the real end is the last
// set.

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { fusoCorrente, fusoDi, giornoLocale } from '../utils/date.js';
import { creaNotifica } from './notifiche.service.js';
import { diLavoro, volumeDi } from '../utils/tipiSerie.js';
import { linguaDiUtenteId } from '../i18n/destinatario.js';
import { localeDi } from '../i18n/index.js';

const MINUTO = 60 * 1000;

/** With no new sets for this long, the workout was forgotten open */
export const MINUTI_INATTIVITA = 120;

/**
 * An open workout with no sets is deleted only after a day: the sets may
 * still be queued on a phone with no network, and arrive late
 */
export const ORE_SESSIONE_VUOTA = 24;

/** For sets logged before they had a time: estimated minutes per set */
const MINUTI_PER_SERIE = 3;

/**
 * The calendar entries a workout of that day marks as done. A skipped one too:
 * whoever skipped it from the reminder and then trained anyway did it.
 */
export const STATI_DA_CHIUDERE = ['PIANIFICATO', 'SALTATO'];

/**
 * When a workout being closed now actually ended.
 * If the last activity (the last set, or the start if there are none) is
 * recent, now; otherwise the workout was forgotten open and ends with the
 * last set. Sets with no time (logged before they had one) count
 * MINUTI_PER_SERIE minutes each from the start.
 * @param {Date} dataInizio
 * @param {{ registrataIl: Date | null }[]} serie - all of them, skipped ones too
 * @returns {{ fine: Date, dimenticata: boolean }}
 */
export function fineEffettiva(dataInizio, serie, adesso = new Date()) {
  const inizio = dataInizio.getTime();
  const orari = serie.filter(s => s.registrataIl).map(s => new Date(s.registrataIl).getTime());
  const ultimaAttivita = orari.length
    ? Math.max(...orari)
    : inizio + serie.length * MINUTI_PER_SERIE * MINUTO;

  if (adesso.getTime() - ultimaAttivita <= MINUTI_INATTIVITA * MINUTO) {
    return { fine: adesso, dimenticata: false };
  }
  return { fine: new Date(Math.max(ultimaAttivita, inizio)), dimenticata: true };
}

/**
 * Closes a workout: end (see fineEffettiva), duration, volume of the
 * completed sets, the day's calendar entry marked as done, personal records
 * of whoever trained.
 * @param {object} sessione - the sessioni_allenamento row
 * @param {{ noteFinali?: string, adesso?: Date, fuso?: string }} [opzioni]
 *   fuso: the user's time zone, for the day of the calendar entry (the
 *   request's by default; the timer passes the owner's)
 */
export async function concludiSessione(sessione, { noteFinali, adesso = new Date(), fuso = fusoCorrente() } = {}) {
  const serie = await prisma.logSerie.findMany({ where: { sessioneId: sessione.id } });
  const completate = serie.filter(s => s.completato);
  // Warm-up is not volume (utils/tipiSerie.js)
  const volumeTotale = volumeDi(completate);
  const { fine, dimenticata } = fineEffettiva(sessione.dataInizio, serie, adesso);

  const aggiornata = await prisma.sessioneAllenamento.update({
    where: { id: sessione.id },
    data: {
      dataFine: fine,
      durataMinuti: Math.round((fine.getTime() - sessione.dataInizio.getTime()) / MINUTO),
      volumeTotaleKg: Math.round(volumeTotale * 10) / 10,
      ...(noteFinali !== undefined && { noteFinali: noteFinali || null })
    }
  });

  // If this plan was on the calendar that day, it counts as done
  await prisma.allenamentoPianificato.updateMany({
    where: {
      utenteId: sessione.utenteId,
      schedaId: sessione.schedaId,
      data: giornoLocale(sessione.dataInizio, fuso),
      stato: { in: STATI_DA_CHIUDERE },
      sessioneId: null
    },
    data: { stato: 'COMPLETATO', sessioneId: sessione.id }
  });

  // Records belong to whoever trained, even if the superadmin closes it, and
  // to the day of the workout: when it is closed late (forgotten open, or with
  // sets arriving later from a phone with no network) they do not become today's
  const recordPersonali = await controllaRecord(sessione.utenteId, completate, fine);

  return { sessione: aggiornata, recordPersonali, dimenticata };
}

// How dates and times are written in each language (the same as the app), in the user's time zone
const formatoGiorno = (lingua, fuso) => new Intl.DateTimeFormat(localeDi(lingua), { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long' });
const formatoOra = (lingua, fuso) => new Intl.DateTimeFormat(localeDi(lingua), { timeZone: fuso, hour: '2-digit', minute: '2-digit' });

/**
 * The periodic check (server.js): workouts idle for more than
 * MINUTI_INATTIVITA minutes are closed at the last set, and whoever was
 * training gets a notification. Those without a single set after
 * ORE_SESSIONE_VUOTA hours were not workouts: they are deleted.
 * @returns {Promise<{ chiuse: number, eliminate: number }>}
 */
export async function chiudiSessioniDimenticate(io, adesso = new Date()) {
  const aperte = await prisma.sessioneAllenamento.findMany({
    where: { dataFine: null, dataInizio: { lt: new Date(adesso.getTime() - MINUTI_INATTIVITA * MINUTO) } },
    include: {
      logSerie: { select: { registrataIl: true } },
      scheda: { select: { titolo: true } },
      utente: { select: { fusoOrario: true } }
    }
  });

  let chiuse = 0;
  let eliminate = 0;
  for (const aperta of aperte) {
    if (!fineEffettiva(aperta.dataInizio, aperta.logSerie, adesso).dimenticata) continue;

    if (aperta.logSerie.length === 0) {
      if (adesso.getTime() - aperta.dataInizio.getTime() < ORE_SESSIONE_VUOTA * 60 * MINUTO) continue;
      await prisma.sessioneAllenamento.delete({ where: { id: aperta.id } });
      eliminate++;
      continue;
    }

    // No request here: the day of the workout, and the day and time inside the
    // notification, are in the user's time zone; the text in their language
    const fuso = fusoDi(aperta.utente);
    const { sessione } = await concludiSessione(aperta, { adesso, fuso });
    chiuse++;
    const lingua = await linguaDiUtenteId(aperta.utenteId);
    await creaNotifica(io, aperta.utenteId, {
      tipo: 'SISTEMA',
      titolo: 'conclusioneSessioneService.notificaTitolo',
      messaggio: 'conclusioneSessioneService.notificaMessaggio',
      variabili: {
        scheda: aperta.scheda.titolo,
        giorno: formatoGiorno(lingua, fuso).format(aperta.dataInizio),
        ora: formatoOra(lingua, fuso).format(sessione.dataFine)
      },
      percorso: '/storico'
    });
  }

  if (chiuse || eliminate) logger.info({ chiuse, eliminate }, 'Allenamenti dimenticati aperti');
  return { chiuse, eliminate };
}

/**
 * New personal records from the given sets: a new record for each exercise
 * where the top weight beats the previous one. Working sets count: warm-up
 * sets and drop sets do not.
 */
export async function controllaRecord(utenteId, serie, dataRecord = null) {
  const recordAggiornati = [];

  // Group sets by exercise and find the top weight
  const pesoPerEsercizio = {};
  for (const s of serie.filter(diLavoro)) {
    if (!pesoPerEsercizio[s.esercizioId] || s.pesoEffettivo > pesoPerEsercizio[s.esercizioId]) {
      pesoPerEsercizio[s.esercizioId] = s.pesoEffettivo;
    }
  }

  for (const [esercizioId, pesoMax] of Object.entries(pesoPerEsercizio)) {
    if (pesoMax <= 0) continue;

    const recordEsistente = await prisma.recordPersonale.findFirst({
      where: { utenteId, esercizioId: parseInt(esercizioId) },
      orderBy: { pesoMaxRaggiunto: 'desc' }
    });

    if (!recordEsistente || pesoMax > recordEsistente.pesoMaxRaggiunto) {
      const record = await prisma.recordPersonale.create({
        data: {
          utenteId,
          esercizioId: parseInt(esercizioId),
          pesoMaxRaggiunto: pesoMax,
          ...(dataRecord ? { dataRecord } : {})
        },
        include: { esercizio: { select: { nome: true, nomeIt: true } } }
      });
      recordAggiornati.push(record);
    }
  }

  return recordAggiornati;
}
