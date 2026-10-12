// ============================================
// GymMaster — Statistics Routes
// Aggregated data for the user's charts and reports
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { gruppiDiEsercizio, GRUPPI_PRINCIPALI, GRUPPI_NON_MUSCOLARI } from '../utils/gruppiMuscolari.js';
import { consiglioAllenamento } from '../services/consiglio.service.js';
import { giornoLocale } from '../utils/date.js';
import { idNumerico } from '../middleware/validazione.js';
import { SOLO_LAVORO } from '../utils/tipiSerie.js';
import { t } from '../i18n/index.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.param('esercizioId', idNumerico);
router.use(verificaToken);

const SETTIMANA = 7 * 86400000;

/** Start (Monday 00:00 UTC) of the week of a date, in milliseconds. */
function lunediUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.getTime();
}

// GET /api/v1/statistiche/riepilogo — General user summary
router.get('/riepilogo', async (req, res, next) => {
  try {
    const utenteId = req.utente.id;
    const utenteDb = await prisma.utente.findUnique({ where: { id: utenteId }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    // Total sessions and volume
    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: { utenteId, dataFine: { not: null }, dataInizio: { gte: resetDate } },
      select: { durataMinuti: true, volumeTotaleKg: true, dataInizio: true }
    });

    const totaleSessioni = sessioni.length;
    const totaleDurata = sessioni.reduce((s, x) => s + (x.durataMinuti || 0), 0);
    const totaleVolume = sessioni.reduce((s, x) => s + (x.volumeTotaleKg || 0), 0);

    // Personal records
    const totaleRecord = await prisma.recordPersonale.count({ 
      where: { utenteId, dataRecord: { gte: resetDate } } 
    });

    // Streak (consecutive days with at least one session)
    const giorniAllenamento = [...new Set(
      sessioni.map(s => s.dataInizio.toISOString().split('T')[0])
    )].sort().reverse();

    let streak = 0;
    const oggi = new Date().toISOString().split('T')[0];
    for (let i = 0; i < giorniAllenamento.length; i++) {
      const giorno = new Date(giorniAllenamento[i]);
      const atteso = new Date();
      atteso.setDate(atteso.getDate() - i);
      if (giorno.toISOString().split('T')[0] === atteso.toISOString().split('T')[0]) {
        streak++;
      } else break;
    }

    // Plans created
    const schedeCreate = await prisma.schedaAllenamento.count({ where: { creatoreId: utenteId } });

    // Weeks (Mon-Sun) with at least one workout. Someone who trains three
    // times a week almost always has a day streak of 0 or 1: the week streak
    // really tells whether you are consistent. The current week does not
    // break the streak until it is over.
    const settimaneAttive = new Set(sessioni.map(s => lunediUTC(s.dataInizio)));
    const questaSettimana = lunediUTC(new Date());
    let settimaneDiFila = 0;
    for (let w = settimaneAttive.has(questaSettimana) ? questaSettimana : questaSettimana - SETTIMANA;
         settimaneAttive.has(w); w -= SETTIMANA) {
      settimaneDiFila++;
    }
    // Last 12 weeks, from the oldest to the current one
    const ultimeSettimane = Array.from({ length: 12 }, (_, i) => settimaneAttive.has(questaSettimana - (11 - i) * SETTIMANA));

    res.json({
      successo: true,
      dati: {
        totaleSessioni,
        totaleDurata,
        totaleVolume: Math.round(totaleVolume),
        totaleRecord,
        streak,
        schedeCreate,
        settimaneDiFila,
        ultimeSettimane
      }
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/sessioni — Session history for the timeline chart
router.get('/sessioni', async (req, res, next) => {
  try {
    const { giorni = 30 } = req.query;
    const da = new Date();
    da.setDate(da.getDate() - parseInt(giorni));

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: {
        utenteId: req.utente.id,
        dataFine: { not: null },
        dataInizio: { gte: da }
      },
      select: {
        id: true,
        dataInizio: true,
        durataMinuti: true,
        volumeTotaleKg: true,
        scheda: { select: { titolo: true } }
      },
      orderBy: { dataInizio: 'asc' }
    });

    // Aggregate by day
    const perGiorno = {};
    sessioni.forEach(s => {
      const giorno = s.dataInizio.toISOString().split('T')[0];
      if (!perGiorno[giorno]) {
        perGiorno[giorno] = { data: giorno, sessioni: 0, durata: 0, volume: 0 };
      }
      perGiorno[giorno].sessioni++;
      perGiorno[giorno].durata += s.durataMinuti || 0;
      perGiorno[giorno].volume += s.volumeTotaleKg || 0;
    });

    res.json({ successo: true, dati: Object.values(perGiorno) });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/consiglio — The plan to do now, with the reason why
// (replaces /gruppi-muscolari, from which the dashboard derived the advice
// with a vocabulary of groups different from the catalogue's)
router.get('/consiglio', async (req, res, next) => {
  try {
    res.json({ successo: true, dati: await consiglioAllenamento(req.utente.id) });
  } catch (errore) { next(errore); }
});

/** true if set `a` is better than `b`: first the weight, then the reps, then the minutes. */
function serieMigliore(a, b) {
  if (!b) return true;
  const pa = [a.pesoEffettivo || 0, a.repEffettive || 0, a.durataMinuti || 0];
  const pb = [b.pesoEffettivo || 0, b.repEffettive || 0, b.durataMinuti || 0];
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

const inSintesi = (s) => ({
  data: s.sessione.dataInizio,
  peso: s.pesoEffettivo,
  rep: s.repEffettive,
  minuti: s.durataMinuti
});

// Above 12 reps the estimate of the max is not reliable
const RIPETIZIONI_MAX_STIMA = 12;

/** Max estimated with the Epley formula, to the nearest half kilo; null where it makes no sense. */
function stimaMassimale(peso, rip) {
  if (!(peso > 0) || rip < 2 || rip > RIPETIZIONI_MAX_STIMA) return null;
  return Math.round(peso * (1 + rip / 30) * 2) / 2;
}

const unDecimale = (n) => Math.round(n * 10) / 10;

// GET /api/v1/statistiche/muscoli?giorni=30 — Muscle groups in the period, exercises and loads
//
// Per group: sets in the period (primary 1, secondary 0.5: see
// utils/gruppiMuscolari.js), sets per week and the last time trained, both
// indirectly (ultimaData) and directly (ultimaDataDiretta). Per exercise, over
// the whole history: the load of the last time, the max (1-rep sets) and the
// max estimated from the working sets.
// The period changes colours and counts, not the exercise details: a max
// from May stays visible even when looking at the last 30 days.
router.get('/muscoli', async (req, res, next) => {
  try {
    const giorni = Math.min(Math.max(parseInt(req.query.giorni) || 30, 1), 3650);
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);
    const inizioPeriodo = new Date(Date.now() - giorni * 86400000);

    // The working sets: warm-up and drop sets are not sets for the muscle
    const serie = await prisma.logSerie.findMany({
      where: { completato: true, ...SOLO_LAVORO, sessione: { utenteId: req.utente.id, dataInizio: { gte: resetDate } } },
      select: {
        sessioneId: true, pesoEffettivo: true, repEffettive: true, durataMinuti: true,
        esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } },
        sessione: { select: { dataInizio: true } }
      }
    });

    const esercizi = new Map();
    const gruppi = new Map();
    const gruppo = (nome) => {
      if (!gruppi.has(nome)) {
        gruppi.set(nome, { nome, seriePeriodo: 0, serieDirettePeriodo: 0, ultimaData: null, ultimaDataDiretta: null, esercizi: new Set(), eserciziSecondari: new Set() });
      }
      return gruppi.get(nome);
    };

    for (const s of serie) {
      const e = s.esercizio;
      const data = s.sessione.dataInizio;
      const nelPeriodo = data >= inizioPeriodo;

      let v = esercizi.get(e.id);
      if (!v) {
        v = { id: e.id, nome: e.nome, nomeIt: e.nomeIt, serie: 0, seriePeriodo: 0, sessioni: new Set(),
              ultimaSessione: null, serieUltima: null, massimale: null, stimato: null };
        esercizi.set(e.id, v);
      }
      v.serie++;
      if (nelPeriodo) v.seriePeriodo++;
      v.sessioni.add(s.sessioneId);
      if (!v.ultimaSessione || data > v.ultimaSessione.data) {
        v.ultimaSessione = { id: s.sessioneId, data };
        v.serieUltima = s;
      } else if (s.sessioneId === v.ultimaSessione.id && serieMigliore(s, v.serieUltima)) {
        v.serieUltima = s;
      }
      // On equal values the most recent wins: it tells today's strength
      const piuRecente = (prec) => data > prec.data;
      if (s.repEffettive === 1 && s.pesoEffettivo > 0 &&
          (!v.massimale || s.pesoEffettivo > v.massimale.peso || (s.pesoEffettivo === v.massimale.peso && piuRecente(v.massimale)))) {
        v.massimale = { peso: s.pesoEffettivo, data };
      }
      const stima = stimaMassimale(s.pesoEffettivo, s.repEffettive);
      if (stima != null && (!v.stimato || stima > v.stimato.peso || (stima === v.stimato.peso && piuRecente(v.stimato)))) {
        v.stimato = { peso: stima, data, daPeso: s.pesoEffettivo, daRip: s.repEffettive };
      }

      for (const { gruppo: nome, peso, secondario } of gruppiDiEsercizio(e.gruppoMuscoloPrimario, e.gruppoMuscoloSecondario)) {
        const g = gruppo(nome);
        if (!g.ultimaData || data > g.ultimaData) g.ultimaData = data;
        if (!secondario && (!g.ultimaDataDiretta || data > g.ultimaDataDiretta)) g.ultimaDataDiretta = data;
        (secondario ? g.eserciziSecondari : g.esercizi).add(e.id);
        if (nelPeriodo) {
          g.seriePeriodo += peso;
          if (!secondario) g.serieDirettePeriodo += peso;
        }
      }
    }
    // The main groups are always there, even if never trained: a gap shows
    for (const nome of GRUPPI_PRINCIPALI) gruppo(nome);

    const settimane = giorni / 7;
    res.json({
      successo: true,
      dati: {
        periodo: { giorni, da: inizioPeriodo, settimane: unDecimale(settimane) },
        gruppi: [...gruppi.values()]
          .map(g => ({
            nome: g.nome,
            muscolare: !GRUPPI_NON_MUSCOLARI.has(g.nome),
            seriePeriodo: unDecimale(g.seriePeriodo),
            serieDirettePeriodo: unDecimale(g.serieDirettePeriodo),
            serieSettimanali: unDecimale(g.seriePeriodo / settimane),
            ultimaData: g.ultimaData,
            ultimaDataDiretta: g.ultimaDataDiretta,
            esercizi: [...g.esercizi],
            eserciziSecondari: [...g.eserciziSecondari].filter(id => !g.esercizi.has(id))
          }))
          .sort((a, b) => b.seriePeriodo - a.seriePeriodo || (b.ultimaData || 0) - (a.ultimaData || 0)),
        esercizi: Object.fromEntries([...esercizi.values()].map(v => [v.id, {
          id: v.id, nome: v.nome, nomeIt: v.nomeIt,
          serie: v.serie, seriePeriodo: v.seriePeriodo, sessioni: v.sessioni.size,
          ultimo: inSintesi(v.serieUltima),
          massimale: v.massimale,
          stimato: v.stimato
        }]))
      }
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/record — Personal records with history
router.get('/record', async (req, res, next) => {
  try {
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    const record = await prisma.recordPersonale.findMany({
      where: { utenteId: req.utente.id, dataRecord: { gte: resetDate } },
      include: { esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
      orderBy: { dataRecord: 'desc' }
    });

    res.json({ successo: true, dati: record });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/statistiche/record/:id — Delete a personal record
router.delete('/record/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const record = await prisma.recordPersonale.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ successo: false, messaggio: t('statisticheRoutes.recordNonTrovato') });
    if (record.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      return res.status(403).json({ successo: false, messaggio: t('statisticheRoutes.nonAutorizzato') });
    }
    await prisma.recordPersonale.delete({ where: { id } });
    res.json({ successo: true, messaggio: t('statisticheRoutes.recordEliminato') });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/progressione/:esercizioId — The exercise's trend over time
//
// One point per day: the best set (weight, then reps on a tie), the best
// estimated max of the day and the true max, if any (1-rep set). For
// bodyweight exercises the set with the most reps counts, for cardio the
// minutes.
router.get('/progressione/:esercizioId', async (req, res, next) => {
  try {
    const esercizioId = parseInt(req.params.esercizioId);
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    const serie = await prisma.logSerie.findMany({
      where: {
        esercizioId,
        completato: true,
        ...SOLO_LAVORO,
        sessione: { utenteId: req.utente.id, dataInizio: { gte: resetDate } }
      },
      select: {
        pesoEffettivo: true, repEffettive: true, durataMinuti: true,
        sessione: { select: { dataInizio: true } }
      },
      orderBy: { sessione: { dataInizio: 'asc' } }
    });

    const perGiorno = new Map();
    for (const s of serie) {
      const giorno = s.sessione.dataInizio.toISOString().split('T')[0];
      let p = perGiorno.get(giorno);
      if (!p) {
        p = { data: giorno, migliore: null, stimato: null, massimale: null };
        perGiorno.set(giorno, p);
      }
      if (serieMigliore(s, p.migliore)) p.migliore = s;
      const stima = stimaMassimale(s.pesoEffettivo, s.repEffettive);
      if (stima != null && (p.stimato == null || stima > p.stimato)) p.stimato = stima;
      if (s.repEffettive === 1 && s.pesoEffettivo > 0 && (p.massimale == null || s.pesoEffettivo > p.massimale)) {
        p.massimale = s.pesoEffettivo;
      }
    }

    res.json({
      successo: true,
      dati: [...perGiorno.values()].map(p => ({
        data: p.data,
        peso: p.migliore.pesoEffettivo,
        rip: p.migliore.repEffettive,
        minuti: p.migliore.durataMinuti,
        stimato: p.stimato,
        massimale: p.massimale
      }))
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/frequenza — Workouts done and scheduled, last 12 weeks
router.get('/frequenza', async (req, res, next) => {
  try {
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);
    const questaSettimana = lunediUTC(new Date());
    const inizio = new Date(questaSettimana - 11 * SETTIMANA);
    const fine = new Date(questaSettimana + SETTIMANA);

    const [sessioni, piani] = await Promise.all([
      prisma.sessioneAllenamento.findMany({
        where: {
          utenteId: req.utente.id,
          dataFine: { not: null },
          dataInizio: { gte: inizio > resetDate ? inizio : resetDate, lt: fine }
        },
        select: { dataInizio: true }
      }),
      // Everything put on the calendar, skipped ones too: they were scheduled anyway
      prisma.allenamentoPianificato.findMany({
        where: { utenteId: req.utente.id, data: { gte: inizio, lt: fine } },
        select: { data: true }
      })
    ]);

    const settimane = Array.from({ length: 12 }, (_, i) => ({
      settimana: new Date(questaSettimana - (11 - i) * SETTIMANA).toISOString().split('T')[0],
      fatti: 0,
      programmati: 0
    }));
    const indice = (d) => 11 - Math.round((questaSettimana - lunediUTC(d)) / SETTIMANA);
    for (const s of sessioni) {
      const i = indice(s.dataInizio);
      if (i >= 0 && i < 12) settimane[i].fatti++;
    }
    for (const p of piani) {
      const i = indice(p.data);
      if (i >= 0 && i < 12) settimane[i].programmati++;
    }

    res.json({ successo: true, dati: settimane });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/attivita-annuale — Workouts and completed sets per
// local calendar day, over the last 53 weeks (the GitHub-style grid)
const GIORNI_ATTIVITA = 53 * 7;
router.get('/attivita-annuale', async (req, res, next) => {
  try {
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);
    // One extra day: the first local day starts the evening before in UTC
    const inizio = new Date(Date.now() - (GIORNI_ATTIVITA + 1) * 86400000);

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: {
        utenteId: req.utente.id,
        dataFine: { not: null },
        dataInizio: { gte: inizio > resetDate ? inizio : resetDate }
      },
      select: { dataInizio: true, _count: { select: { logSerie: { where: { completato: true, ...SOLO_LAVORO } } } } }
    });

    const perGiorno = new Map();
    for (const s of sessioni) {
      const giorno = giornoLocale(s.dataInizio).toISOString().slice(0, 10);
      const voce = perGiorno.get(giorno) || { giorno, allenamenti: 0, serie: 0 };
      voce.allenamenti++;
      voce.serie += s._count.logSerie;
      perGiorno.set(giorno, voce);
    }

    res.json({ successo: true, dati: [...perGiorno.values()].sort((a, b) => a.giorno.localeCompare(b.giorno)) });
  } catch (errore) { next(errore); }
});

export default router;
