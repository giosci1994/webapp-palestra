// ============================================
// GymMaster — Advice on which workout plan to do
// ============================================
//
// Among the available plans it picks the one that best trains the rested
// muscles without loading those still recovering, and explains why with the
// same groups and the same 48 hours as the Corpo (body) section of the stats.
//
// The advice used to be built in the dashboard from a fixed list of groups
// ("Dorso", "Gambe", "Addome"…) that the catalog does not use: "Dorso" always
// showed as never trained, no plan contained it and it fell back to the first
// plan in the list, with a text that had nothing to do with the suggested plan.

import prisma from '../config/database.js';
import { gruppiDiEsercizio, GRUPPI_NON_MUSCOLARI, GRUPPI_PRINCIPALI } from '../utils/gruppiMuscolari.js';
import { giornoLocale, giorniDiCalendario } from '../utils/date.js';
import { SOLO_LAVORO } from '../utils/tipiSerie.js';
import { t, localeDi } from '../i18n/index.js';

const ORE_RECUPERO = 48;
const GIORNI_PIANO = 7;
// The text goes in the dashboard banner, which shows two lines of it: past
// this length the second sentence gets lost, and the main reason with it
const MAX_TESTO = 70;

// How much each group weighs in the advice: big groups first, then the arms,
// then the small muscles. Without this scale a plan for tibialis and
// adductors, never trained, would come before the one for the chest.
const IMPORTANZA = {
  Petto: 1, Schiena: 1, Spalle: 1, Quadricipiti: 1, Femorali: 1, Glutei: 1,
  Bicipiti: 0.8, Tricipiti: 0.8,
  Addominali: 0.5, Polpacci: 0.5, Trapezio: 0.5, Avambracci: 0.4,
};
const IMPORTANZA_MINORE = 0.3;

const importanza = (gruppo) => IMPORTANZA[gruppo] ?? IMPORTANZA_MINORE;

/**
 * How much a group needs training: -1 if still recovering, then it grows
 * with the days of rest up to 1 (idle for two weeks or never trained).
 */
function bisogno(ultima, adesso) {
  if (!ultima) return 1;
  if (adesso - ultima < ORE_RECUPERO * 3600000) return -1;
  const giorni = giorniDiCalendario(ultima, adesso);
  if (giorni < 4) return 0.3;
  if (giorni < 7) return 0.6;
  if (giorni < 14) return 0.85;
  return 1;
}

/**
 * Scheduled sets per group, weighted as in the stats (secondary groups at
 * half), and the direct ones apart: only these say what the plan is about.
 */
function seriePerGruppo(esercizi) {
  const perGruppo = new Map();
  const diretti = new Map();
  let totale = 0;
  for (const e of esercizi) {
    const serie = e.serieTarget || 1;
    totale += serie;
    for (const { gruppo, peso, secondario } of gruppiDiEsercizio(e.esercizio.gruppoMuscoloPrimario, e.esercizio.gruppoMuscoloSecondario)) {
      if (GRUPPI_NON_MUSCOLARI.has(gruppo)) continue;
      perGruppo.set(gruppo, (perGruppo.get(gruppo) || 0) + serie * peso);
      if (!secondario) diretti.set(gruppo, (diretti.get(gruppo) || 0) + serie * peso);
    }
  }
  return { perGruppo, diretti, totale };
}

/** The groups a plan works the most, to describe it in a few words. */
export function gruppiDellaScheda(esercizi, quanti = 3) {
  return [...seriePerGruppo(esercizi).diretti]
    .sort((a, b) => b[1] - a[1] || posizione(a[0]) - posizione(b[0]))
    .slice(0, quanti)
    .map(([gruppo]) => gruppo);
}

/**
 * How useful a plan is right now: the average, per scheduled set, of the
 * need of the groups it trains. Negative if it mostly works recovering muscles.
 */
function valutaScheda(esercizi, ultimaDiretta, adesso) {
  const { perGruppo, diretti, totale } = seriePerGruppo(esercizi);
  const contributi = [...perGruppo].map(([gruppo, serie]) => {
    const b = bisogno(ultimaDiretta.get(gruppo), adesso);
    return { gruppo, serie, dirette: diretti.get(gruppo) || 0, bisogno: b, contributo: serie * importanza(gruppo) * b };
  });
  const somma = contributi.reduce((s, c) => s + c.contributo, 0);
  return { punteggio: totale ? somma / totale : 0, contributi };
}

// The sentences are built from the group names, which are Italian data
// ("Petto"): they are translated only when they go into a sentence. A name
// with no translation stays as it is.
const nomeGruppo = (nome) => {
  const chiave = `gruppi.${nome}`;
  const testo = t(chiave);
  return testo !== chiave ? testo : nome;
};
/** "Petto, Spalle e Glutei" / "Chest, Shoulders and Glutes" */
const elenco = (nomi) => new Intl.ListFormat(localeDi(), { style: 'long', type: 'conjunction' }).format(nomi.map(nomeGruppo));
// Once the groups to name are chosen, they are listed in the usual order:
// "Petto e Spalle", as in plan titles, not "Spalle e Petto"
const posizione = (gruppo) => { const i = GRUPPI_PRINCIPALI.indexOf(gruppo); return i < 0 ? GRUPPI_PRINCIPALI.length : i; };
const inOrdine = (nomi) => [...nomi].sort((a, b) => posizione(a) - posizione(b));
// Names that take a singular verb ("il petto riposa", "i glutei riposano"):
// which ones depends on the language, so the list is in the texts
const singolari = () => new Set(t('consiglioService.gruppiSingolari').split(','));
const plurale = (nomi) => nomi.length > 1 || !singolari().has(nomi[0]);
// The `count` of the sentences that change their verb: 1 singular, 2 plural
const numero = (nomi) => plurale(nomi) ? 2 : 1;

/** "Petto e Spalle riposano da 5 giorni." — the rested groups the plan trains the most. */
function fraseRiposati(riposati, ultimaDiretta, adesso) {
  const nomi = inOrdine(riposati.map(c => c.gruppo));
  const giorni = nomi.map(g => ultimaDiretta.get(g)).filter(Boolean).map(d => giorniDiCalendario(d, adesso));
  const gruppi = elenco(nomi);
  if (giorni.length === 0) return t('consiglioService.mai', { gruppi });
  const minimo = Math.min(...giorni);
  const count = numero(nomi);
  if (minimo >= 14) return t('consiglioService.riposoOltreDueSettimane', { gruppi, count });
  const almeno = giorni.length < nomi.length || giorni.some(g => g !== minimo);
  return t(almeno ? 'consiglioService.riposoDaAlmeno' : 'consiglioService.riposoDa', { gruppi, giorni: minimo, count });
}

/** "In programma domani." (tomorrow), "dopodomani" (the day after) or the weekday, for a scheduled day within seven days. */
function frasePianificata(data, oggi) {
  const giorni = Math.round((data - oggi) / 86400000);
  if (giorni === 1) return t('consiglioService.inProgrammaDomani');
  if (giorni === 2) return t('consiglioService.inProgrammaDopodomani');
  return t('consiglioService.inProgrammaGiorno', { giorno: t(`consiglioService.giorniSettimana.${data.getUTCDay()}`) });
}

/**
 * The advice for the dashboard.
 *
 * @returns {Promise<null | {
 *   motivo: 'oggi' | 'riposati' | 'inizio' | 'riposo',
 *   scheda: { id: number, titolo: string } | null,
 *   testo: string
 * }>} null if the user has no plans to suggest.
 */
export async function consiglioAllenamento(utenteId, adesso = new Date()) {
  const oggi = giornoLocale(adesso);
  const utente = await prisma.utente.findUnique({ where: { id: utenteId }, select: { dataResetStatistiche: true } });
  const inizioStoria = utente?.dataResetStatistiche || new Date(0);
  const selezioneEsercizi = {
    select: { serieTarget: true, esercizio: { select: { gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } } }
  };

  const [serie, pianiFatti, piani, sessioniPerScheda, schede] = await Promise.all([
    prisma.logSerie.findMany({
      where: { completato: true, ...SOLO_LAVORO, sessione: { utenteId, dataInizio: { gte: inizioStoria, lte: adesso } } },
      select: {
        esercizio: { select: { gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } },
        sessione: { select: { dataInizio: true } }
      }
    }),
    // A workout marked as done from the calendar, with no recorded session
    // (done offline, for example), counts as its plan
    prisma.allenamentoPianificato.findMany({
      where: { utenteId, stato: 'COMPLETATO', sessioneId: null, data: { gte: giornoLocale(inizioStoria), lte: oggi } },
      select: { data: true, scheda: { select: { esercizi: selezioneEsercizi } } }
    }),
    prisma.allenamentoPianificato.findMany({
      where: { utenteId },
      select: { schedaId: true, data: true, stato: true },
      orderBy: [{ data: 'asc' }, { id: 'asc' }]
    }),
    prisma.sessioneAllenamento.groupBy({ by: ['schedaId'], where: { utenteId }, _count: true }),
    // The same plans as "Allenati ora" (train now), plus those assigned by the personal trainer
    prisma.schedaAllenamento.findMany({
      where: { OR: [{ creatoreId: utenteId }, { visibilita: 'GLOBALE' }] },
      select: { id: true, titolo: true, creatoreId: true, esercizi: selezioneEsercizi }
    })
  ]);

  const candidate = schede.filter(s => s.esercizi.length > 0);
  if (candidate.length === 0) return null;

  // Last direct workout (primary group) of each group, and the sets of the
  // last 48 hours to tell which muscles are tired
  const ultimaDiretta = new Map();
  const serieRecenti = new Map();
  const registra = (gruppo, data, peso) => {
    if (!ultimaDiretta.has(gruppo) || data > ultimaDiretta.get(gruppo)) ultimaDiretta.set(gruppo, data);
    if (adesso - data < ORE_RECUPERO * 3600000) serieRecenti.set(gruppo, (serieRecenti.get(gruppo) || 0) + peso);
  };
  for (const s of serie) {
    for (const { gruppo, peso, secondario } of gruppiDiEsercizio(s.esercizio.gruppoMuscoloPrimario, s.esercizio.gruppoMuscoloSecondario)) {
      if (!secondario) registra(gruppo, s.sessione.dataInizio, peso);
    }
  }
  for (const p of pianiFatti) {
    // Only the date of the day is known: local noon is a plausible time
    const data = new Date(p.data.getTime() + 10 * 3600000);
    if (data > adesso) continue;
    for (const e of p.scheda.esercizi) {
      for (const { gruppo, peso, secondario } of gruppiDiEsercizio(e.esercizio.gruppoMuscoloPrimario, e.esercizio.gruppoMuscoloSecondario)) {
        if (!secondario) registra(gruppo, data, (e.serieTarget || 1) * peso);
      }
    }
  }

  const inRecupero = [...serieRecenti]
    .filter(([gruppo]) => !GRUPPI_NON_MUSCOLARI.has(gruppo) && importanza(gruppo) >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([gruppo]) => gruppo);
  const fraseRecupero = (nomi, chiave = 'consiglioService.recuperaAncora') =>
    t(chiave, { gruppi: elenco(inOrdine(nomi)), count: numero(nomi) });

  const valutata = (s) => ({ scheda: s, ...valutaScheda(s.esercizi, ultimaDiretta, adesso) });
  const riposatiDi = (v) => v.contributi
    .filter(c => c.bisogno > 0)
    .sort((a, b) => b.contributo - a.contributo)
    .slice(0, 2);

  // 1. The calendar comes first: the user (or their personal trainer) decided it
  const pianoDiOggi = piani.find(p => p.stato === 'PIANIFICATO' && p.data.getTime() === oggi.getTime());
  const schedaDiOggi = pianoDiOggi && candidate.find(s => s.id === pianoDiOggi.schedaId);
  if (schedaDiOggi) {
    const v = valutata(schedaDiOggi);
    const riposati = riposatiDi(v);
    // The warning is for the muscles the plan really trains, not for those
    // that just help out in a couple of exercises
    const stanchi = v.contributi.filter(c => c.bisogno < 0 && c.dirette >= 2 && importanza(c.gruppo) >= 0.5)
      .sort((a, b) => b.dirette - a.dirette).slice(0, 2).map(c => c.gruppo);
    let testo = t('consiglioService.inProgrammaOggi');
    if (stanchi.length) testo += ` ${fraseRecupero(stanchi, 'consiglioService.attenzioneRecupera')}`;
    else if (riposati.length) testo += ` ${fraseRiposati(riposati, ultimaDiretta, adesso)}`;
    return { motivo: 'oggi', scheda: { id: schedaDiOggi.id, titolo: schedaDiOggi.titolo }, testo };
  }

  // 2. Otherwise the best plan, preferring those the user already uses
  const usate = new Set([...sessioniPerScheda.map(s => s.schedaId), ...piani.map(p => p.schedaId)]);
  const familiarita = (s) => usate.has(s.id) ? 1 : s.creatoreId === utenteId ? 0.9 : 0.75;
  const classifica = candidate
    .map(valutata)
    .map(v => ({ ...v, voto: v.punteggio > 0 ? v.punteggio * familiarita(v.scheda) : v.punteggio }))
    .sort((a, b) => b.voto - a.voto || a.scheda.id - b.scheda.id);
  const migliore = classifica[0];

  // No plan helps without loading tired muscles
  if (migliore.voto <= 0) {
    const stanchi = inRecupero.slice(0, 2);
    return {
      motivo: 'riposo',
      scheda: null,
      testo: stanchi.length
        ? fraseRecupero(stanchi, 'consiglioService.riposoStanchi')
        : t('consiglioService.riposoTutte')
    };
  }

  const scheda = { id: migliore.scheda.id, titolo: migliore.scheda.titolo };
  if (ultimaDiretta.size === 0) {
    const principali = gruppiDellaScheda(migliore.scheda.esercizi);
    return { motivo: 'inizio', scheda, testo: t('consiglioService.inizio', { gruppi: elenco(inOrdine(principali)) }) };
  }

  const motivo = fraseRiposati(riposatiDi(migliore), ultimaDiretta, adesso);
  const prossimoPiano = piani.find(p =>
    p.stato === 'PIANIFICATO' && p.schedaId === scheda.id &&
    p.data > oggi && p.data - oggi <= GIORNI_PIANO * 86400000);
  // Of the tired muscles, name only those the suggested plan does not touch
  const gruppiScheda = new Set(migliore.contributi.map(c => c.gruppo));
  const risparmiati = inRecupero.filter(g => !gruppiScheda.has(g)).slice(0, 2);
  const aggiunta = prossimoPiano ? frasePianificata(prossimoPiano.data, oggi)
    : risparmiati.length ? fraseRecupero(risparmiati)
    : '';
  const testo = aggiunta && motivo.length + 1 + aggiunta.length <= MAX_TESTO ? `${motivo} ${aggiunta}` : motivo;

  return { motivo: 'riposati', scheda, testo };
}
