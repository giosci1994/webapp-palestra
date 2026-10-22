// ============================================
// GymMaster — Workouts to check (admin)
// ============================================
//
// Workouts that skew the statistics: left open, overlapping another one of
// the same user (a new one started while one was open), closed by the server
// because they were forgotten, too long, or without sets. The admin corrects
// them (PATCH /sessioni/:id), closes, deletes or merges them, or marks them
// as checked.

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione } from '../utils/errori.js';
import { t } from '../i18n/index.js';
import { linguaDiUtenteId } from '../i18n/destinatario.js';
import { volumeDi } from '../utils/tipiSerie.js';
import { titoloAllenamento } from '../utils/titoloAllenamento.js';
import { chiudiAperta } from './conclusioneSessione.service.js';
import { creaNotifica } from './notifiche.service.js';
import { formattaPerStorico, INCLUDI_STORICO } from '../controllers/sessioni.controller.js';
import { ID_MASSIMO } from '../middleware/validazione.js';

const MINUTO = 60 * 1000;
/** Over 4 hours it is not a workout (as DURATA_SOSPETTA_MINUTI in the app) */
export const DURATA_SOSPETTA_MINUTI = 240;
/** How far back the list looks */
const GIORNI_ELENCO = 90;

/**
 * The workouts to check, the most recent first, each with its reasons:
 * APERTO, SOVRAPPOSTO, CHIUSO_IN_AUTOMATICO, DURATA_SOSPETTA, SENZA_SERIE.
 * Those already checked are left out, unless still open.
 */
export async function elencoDaControllare(adesso = new Date()) {
  const sessioni = await prisma.sessioneAllenamento.findMany({
    where: { dataInizio: { gte: new Date(adesso.getTime() - GIORNI_ELENCO * 24 * 60 * MINUTO) } },
    include: { ...INCLUDI_STORICO, utente: { select: { id: true, nome: true } } },
    orderBy: { dataInizio: 'desc' }
  });

  const fine = s => (s.dataFine ?? adesso).getTime();
  const perUtente = Map.groupBy(sessioni, s => s.utenteId);
  const risultato = [];
  for (const s of sessioni) {
    const motivi = [];
    if (!s.dataFine) motivi.push('APERTO');
    const altre = perUtente.get(s.utenteId).filter(a => a.id !== s.id);
    if (altre.some(a => a.dataInizio.getTime() < fine(s) && s.dataInizio.getTime() < fine(a))) motivi.push('SOVRAPPOSTO');
    if (s.chiusaAutomaticamente) motivi.push('CHIUSO_IN_AUTOMATICO');
    if (s.durataMinuti > DURATA_SOSPETTA_MINUTI) motivi.push('DURATA_SOSPETTA');
    if (s.dataFine && s._count.logSerie === 0) motivi.push('SENZA_SERIE');

    if (motivi.length === 0 || (s.controllataIl && s.dataFine)) continue;
    risultato.push({ ...formattaPerStorico(s), utente: s.utente, motivi });
  }
  return risultato;
}

/**
 * An admin corrected, closed or deleted someone else's workout: the owner is
 * told, in their language. Their own workouts, no.
 * @param {{ utenteId: number, schedaId: number | null, titolo: string | null }} sessione - as it was
 * @param {'notificaCorretto' | 'notificaChiuso' | 'notificaEliminato'} messaggio
 */
export async function avvisaSeDiUnAltro(io, chi, sessione, messaggio) {
  if (chi.id === sessione.utenteId) return;
  const scheda = sessione.schedaId
    ? await prisma.schedaAllenamento.findUnique({ where: { id: sessione.schedaId }, select: { titolo: true } })
    : null;
  const lingua = await linguaDiUtenteId(sessione.utenteId);
  await creaNotifica(io, sessione.utenteId, {
    tipo: 'SISTEMA',
    titolo: 'allenamentiDaControllare.notificaTitolo',
    messaggio: `allenamentiDaControllare.${messaggio}`,
    variabili: { titolo: titoloAllenamento({ scheda, titolo: sessione.titolo }, lingua) },
    percorso: '/storico'
  });
}

/** Marks a workout as checked: it leaves the list */
export async function segnaControllato(id) {
  await prisma.sessioneAllenamento.update({ where: { id }, data: { controllataIl: new Date() } });
}

/** The ids to merge: at least two different positive integers */
function leggiIds(ids) {
  const validi = Array.isArray(ids) && ids.every(id => Number.isInteger(id) && id >= 1 && id <= ID_MASSIMO);
  const diversi = validi ? [...new Set(ids)] : [];
  if (diversi.length < 2) throw new ErroreValidazione(t('allenamentiDaControllare.almenoDue'));
  return diversi;
}

/**
 * Merges workouts of the same user into one free workout: the sets of all of
 * them, from the first start to the last end, named after what they were
 * ("Push + Gambe"). Open ones are closed first. The sets of the later
 * workouts follow those of the earlier ones in the numbering of each
 * exercise. The user gets a notification.
 * @returns the merged workout, as the history shows it
 */
export async function unisciAllenamenti(ids, io) {
  const daUnire = leggiIds(ids);
  const trovate = await prisma.sessioneAllenamento.findMany({ where: { id: { in: daUnire } }, select: { id: true, utenteId: true, dataFine: true } });
  if (trovate.length !== daUnire.length) throw new ErroreNonTrovato(t('allenamentiDaControllare.nonTrovato'));
  if (new Set(trovate.map(s => s.utenteId)).size > 1) throw new ErroreValidazione(t('allenamentiDaControllare.utentiDiversi'));

  for (const aperta of trovate.filter(s => !s.dataFine)) await chiudiAperta(aperta.id);
  // An open one without sets is deleted by chiudiAperta: the others are merged
  const sessioni = await prisma.sessioneAllenamento.findMany({
    where: { id: { in: daUnire } },
    include: { scheda: { select: { titolo: true } }, logSerie: { orderBy: { id: 'asc' } } },
    orderBy: { dataInizio: 'asc' }
  });
  if (sessioni.length === 0) throw new ErroreNonTrovato(t('allenamentiDaControllare.nonTrovato'));
  const [principale, ...altre] = sessioni;
  const utenteId = principale.utenteId;
  const lingua = await linguaDiUtenteId(utenteId);
  const titolo = [...new Set(sessioni.map(s => titoloAllenamento(s, lingua)))].join(' + ');

  await prisma.$transaction(async (tx) => {
    // The highest number already used for each exercise, working (with its
    // drop sets) and warm-up apart: the later sets go after
    const massimi = new Map();
    const chiave = s => `${s.esercizioId}:${s.tipo === 'RISCALDAMENTO' ? 'R' : 'L'}`;
    const segna = s => massimi.set(chiave(s), Math.max(massimi.get(chiave(s)) ?? 0, s.serieNumero));
    principale.logSerie.forEach(segna);
    for (const altra of altre) {
      const scarti = new Map(altra.logSerie.map(s => [chiave(s), massimi.get(chiave(s)) ?? 0]));
      for (const s of altra.logSerie) {
        const serieNumero = s.serieNumero + scarti.get(chiave(s));
        await tx.logSerie.update({ where: { id: s.id }, data: { sessioneId: principale.id, serieNumero } });
        segna({ ...s, serieNumero });
      }
    }
    // The calendar entries that pointed to the others stay done, without a link
    await tx.allenamentoPianificato.updateMany({ where: { sessioneId: { in: altre.map(s => s.id) } }, data: { sessioneId: null } });
    await tx.sessioneAllenamento.deleteMany({ where: { id: { in: altre.map(s => s.id) } } });

    const serie = sessioni.flatMap(s => s.logSerie).filter(s => s.completato);
    const inizio = principale.dataInizio;
    const fineUltima = new Date(Math.max(...sessioni.map(s => s.dataFine.getTime())));
    await tx.sessioneAllenamento.update({
      where: { id: principale.id },
      data: {
        schedaId: null,
        titolo,
        dataFine: fineUltima,
        durataMinuti: Math.round((fineUltima - inizio) / MINUTO),
        volumeTotaleKg: Math.round(volumeDi(serie) * 10) / 10,
        noteFinali: sessioni.map(s => s.noteFinali).filter(Boolean).join('\n') || null,
        chiusaAutomaticamente: false,
        controllataIl: new Date()
      }
    });
  });

  await creaNotifica(io, utenteId, {
    tipo: 'SISTEMA',
    titolo: 'allenamentiDaControllare.notificaTitolo',
    messaggio: 'allenamentiDaControllare.notificaUniti',
    variabili: { titolo, count: sessioni.length },
    percorso: '/storico'
  });

  const unita = await prisma.sessioneAllenamento.findUnique({ where: { id: principale.id }, include: INCLUDI_STORICO });
  return formattaPerStorico(unita);
}
