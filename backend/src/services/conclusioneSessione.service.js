// ============================================
// GymMaster — Fine di un allenamento
// ============================================
//
// Chiudere un allenamento: durata, volume, calendario e record personali.
// Lo fa chi tocca "Termina", e lo fa il server con gli allenamenti rimasti
// aperti.
//
// Un allenamento dimenticato aperto e chiuso giorni dopo durava giorni (in
// produzione 21, 72 e 93 ore) e falsava durate medie, recupero e badge. Da
// quando le serie hanno l'orario di registrazione, la fine vera e' l'ultima
// serie.

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { giornoLocale, FUSO_ORARIO } from '../utils/date.js';
import { creaNotifica } from './notifiche.service.js';
import { diLavoro, volumeDi } from '../utils/tipiSerie.js';

const MINUTO = 60 * 1000;

/** Senza serie nuove da tanto, l'allenamento e' stato dimenticato aperto */
export const MINUTI_INATTIVITA = 120;

/**
 * Un allenamento aperto senza serie si elimina solo dopo un giorno: le serie
 * possono essere ancora su un telefono senza rete, in coda, e arrivare tardi
 */
export const ORE_SESSIONE_VUOTA = 24;

/** Per le serie registrate prima che avessero un orario: minuti stimati a serie */
const MINUTI_PER_SERIE = 3;

/**
 * Quando e' finito un allenamento che si chiude adesso.
 * Se l'ultima attivita' (l'ultima serie, o l'inizio se non ce ne sono) e'
 * recente, adesso; se no l'allenamento e' stato dimenticato aperto e finisce
 * con l'ultima serie. Le serie senza orario (registrate prima che lo avessero)
 * valgono MINUTI_PER_SERIE minuti l'una dall'inizio.
 * @param {Date} dataInizio
 * @param {{ registrataIl: Date | null }[]} serie - tutte, anche quelle saltate
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
 * Chiude un allenamento: fine (vedi fineEffettiva), durata, volume delle serie
 * completate, calendario del giorno segnato come fatto, record personali di
 * chi si e' allenato.
 * @param {object} sessione - la riga di sessioni_allenamento
 * @param {{ noteFinali?: string, adesso?: Date }} [opzioni]
 */
export async function concludiSessione(sessione, { noteFinali, adesso = new Date() } = {}) {
  const serie = await prisma.logSerie.findMany({ where: { sessioneId: sessione.id } });
  const completate = serie.filter(s => s.completato);
  // Il riscaldamento non e' volume (utils/tipiSerie.js)
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

  // Se quel giorno questa scheda era in calendario, risulta fatta
  await prisma.allenamentoPianificato.updateMany({
    where: {
      utenteId: sessione.utenteId,
      schedaId: sessione.schedaId,
      data: giornoLocale(sessione.dataInizio),
      stato: 'PIANIFICATO',
      sessioneId: null
    },
    data: { stato: 'COMPLETATO', sessioneId: sessione.id }
  });

  // I record sono di chi si e' allenato, anche se a chiudere e' il superadmin,
  // e del giorno dell'allenamento: chiuso tardi (dimenticato aperto, o con le
  // serie arrivate dopo da un telefono senza rete) non diventano di oggi
  const recordPersonali = await controllaRecord(sessione.utenteId, completate, fine);

  return { sessione: aggiornata, recordPersonali, dimenticata };
}

const formatoGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO_ORARIO, weekday: 'long', day: 'numeric', month: 'long' });
const formatoOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO_ORARIO, hour: '2-digit', minute: '2-digit' });

/**
 * Il controllo periodico (server.js): gli allenamenti fermi da piu' di
 * MINUTI_INATTIVITA minuti vengono chiusi all'ultima serie, e chi si allenava
 * riceve una notifica. Quelli senza nemmeno una serie dopo ORE_SESSIONE_VUOTA
 * ore non erano allenamenti: si eliminano.
 * @returns {Promise<{ chiuse: number, eliminate: number }>}
 */
export async function chiudiSessioniDimenticate(io, adesso = new Date()) {
  const aperte = await prisma.sessioneAllenamento.findMany({
    where: { dataFine: null, dataInizio: { lt: new Date(adesso.getTime() - MINUTI_INATTIVITA * MINUTO) } },
    include: {
      logSerie: { select: { registrataIl: true } },
      scheda: { select: { titolo: true } }
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

    const { sessione } = await concludiSessione(aperta, { adesso });
    chiuse++;
    await creaNotifica(io, aperta.utenteId, {
      tipo: 'SISTEMA',
      titolo: 'Allenamento chiuso',
      messaggio: `Avevi lasciato aperto «${aperta.scheda.titolo}» di ${formatoGiorno.format(aperta.dataInizio)}: `
        + `l'ho chiuso all'ultima serie, alle ${formatoOra.format(sessione.dataFine)}. Puoi correggerlo dallo Storico.`,
      percorso: '/storico'
    });
  }

  if (chiuse || eliminate) logger.info({ chiuse, eliminate }, 'Allenamenti dimenticati aperti');
  return { chiuse, eliminate };
}

/**
 * Nuovi record personali dalle serie date: un record nuovo per ogni esercizio
 * in cui il peso massimo supera quello di prima. Contano le serie di lavoro:
 * riscaldamento e drop no.
 */
export async function controllaRecord(utenteId, serie, dataRecord = null) {
  const recordAggiornati = [];

  // Raggruppa serie per esercizio e trova il peso max
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
