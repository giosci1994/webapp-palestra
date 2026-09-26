// ============================================
// GymMaster — Routes Statistiche
// Dati aggregati per grafici e report utente
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { gruppiDiEsercizio, GRUPPI_PRINCIPALI, GRUPPI_NON_MUSCOLARI } from '../utils/gruppiMuscolari.js';

const router = Router();
router.use(verificaToken);

const SETTIMANA = 7 * 86400000;

/** Inizio (lunedi' 00:00 UTC) della settimana di una data, in millisecondi. */
function lunediUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.getTime();
}

// GET /api/v1/statistiche/riepilogo — Riepilogo generale utente
router.get('/riepilogo', async (req, res, next) => {
  try {
    const utenteId = req.utente.id;
    const utenteDb = await prisma.utente.findUnique({ where: { id: utenteId }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    // Sessioni totali e volume
    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: { utenteId, dataFine: { not: null }, dataInizio: { gte: resetDate } },
      select: { durataMinuti: true, volumeTotaleKg: true, dataInizio: true }
    });

    const totaleSessioni = sessioni.length;
    const totaleDurata = sessioni.reduce((s, x) => s + (x.durataMinuti || 0), 0);
    const totaleVolume = sessioni.reduce((s, x) => s + (x.volumeTotaleKg || 0), 0);

    // Record personali
    const totaleRecord = await prisma.recordPersonale.count({ 
      where: { utenteId, dataRecord: { gte: resetDate } } 
    });

    // Streak (giorni consecutivi con almeno una sessione)
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

    // Schede create
    const schedeCreate = await prisma.schedaAllenamento.count({ where: { creatoreId: utenteId } });

    // Settimane (lun-dom) con almeno un allenamento. Chi si allena tre volte a
    // settimana ha quasi sempre la serie di giorni a 0 o 1: quella di
    // settimane dice davvero se sei costante. La settimana in corso non
    // interrompe la serie finche' non e' finita.
    const settimaneAttive = new Set(sessioni.map(s => lunediUTC(s.dataInizio)));
    const questaSettimana = lunediUTC(new Date());
    let settimaneDiFila = 0;
    for (let w = settimaneAttive.has(questaSettimana) ? questaSettimana : questaSettimana - SETTIMANA;
         settimaneAttive.has(w); w -= SETTIMANA) {
      settimaneDiFila++;
    }
    // Ultime 12 settimane, dalla piu' vecchia a quella in corso
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

// GET /api/v1/statistiche/sessioni — Storico sessioni per grafico timeline
router.get('/sessioni', async (req, res, next) => {
  try {
    const { giorni = 30 } = req.query;
    const da = new Date();
    da.setDate(da.getDate() - parseInt(giorni));

    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);
    const filterDa = da > resetDate ? da : resetDate;

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: {
        utenteId: req.utente.id,
        dataFine: { not: null },
        dataInizio: { gte: filterDa }
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

    // Aggrega per giorno
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

// GET /api/v1/statistiche/gruppi-muscolari — Distribuzione per gruppo muscolare
router.get('/gruppi-muscolari', async (req, res, next) => {
  try {
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    const logSerie = await prisma.logSerie.findMany({
      where: {
        sessione: { utenteId: req.utente.id, dataInizio: { gte: resetDate } },
        completato: true
      },
      include: {
        esercizio: { select: { gruppoMuscoloPrimario: true } }
      }
    });

    const conteggio = {};
    logSerie.forEach(l => {
      const gruppo = l.esercizio.gruppoMuscoloPrimario;
      if (!conteggio[gruppo]) conteggio[gruppo] = { nome: gruppo, serie: 0, volume: 0 };
      conteggio[gruppo].serie++;
      conteggio[gruppo].volume += l.pesoEffettivo * l.repEffettive;
    });

    res.json({
      successo: true,
      dati: Object.values(conteggio).sort((a, b) => b.serie - a.serie)
    });
  } catch (errore) { next(errore); }
});

/** true se la serie `a` e' migliore di `b`: prima il peso, poi le ripetizioni, poi i minuti. */
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

// Oltre le 12 ripetizioni la stima del massimale non e' affidabile
const RIPETIZIONI_MAX_STIMA = 12;

/** Massimale stimato con la formula di Epley, al mezzo chilo; null dove non ha senso. */
function stimaMassimale(peso, rip) {
  if (!(peso > 0) || rip < 2 || rip > RIPETIZIONI_MAX_STIMA) return null;
  return Math.round(peso * (1 + rip / 30) * 2) / 2;
}

const unDecimale = (n) => Math.round(n * 10) / 10;

// GET /api/v1/statistiche/muscoli?giorni=30 — Gruppi muscolari nel periodo, esercizi e carichi
//
// Per gruppo: serie nel periodo (primario 1, secondario 0,5: vedi
// utils/gruppiMuscolari.js), serie a settimana e ultima volta allenato, anche
// indirettamente (ultimaData) e direttamente (ultimaDataDiretta). Per esercizio, su tutto lo storico: carico dell'ultima volta,
// massimale (serie da 1 ripetizione) e massimale stimato dalle serie di lavoro.
// Il periodo cambia colori e conteggi, non i dettagli degli esercizi: un
// massimale di maggio resta visibile anche guardando gli ultimi 30 giorni.
router.get('/muscoli', async (req, res, next) => {
  try {
    const giorni = Math.min(Math.max(parseInt(req.query.giorni) || 30, 1), 3650);
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);
    const inizioPeriodo = new Date(Date.now() - giorni * 86400000);

    const serie = await prisma.logSerie.findMany({
      where: { completato: true, sessione: { utenteId: req.utente.id, dataInizio: { gte: resetDate } } },
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
      // A parita' di valore vince il piu' recente: racconta la forza di adesso
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
    // I gruppi principali ci sono sempre, anche mai allenati: un buco si vede
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

// GET /api/v1/statistiche/record — Record personali con storico
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

// DELETE /api/v1/statistiche/record/:id — Elimina un record personale
router.delete('/record/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const record = await prisma.recordPersonale.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ successo: false, messaggio: 'Record non trovato' });
    if (record.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      return res.status(403).json({ successo: false, messaggio: 'Non autorizzato' });
    }
    await prisma.recordPersonale.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Record eliminato' });
  } catch (errore) { next(errore); }
});

// GET /api/v1/statistiche/progressione/:esercizioId — Andamento dell'esercizio nel tempo
//
// Un punto per giorno: la serie migliore (peso, a parita' le ripetizioni), il
// massimale stimato migliore della giornata e l'eventuale massimale vero
// (serie da 1 ripetizione). Per il corpo libero conta chi ha fatto piu'
// ripetizioni, per il cardio i minuti.
router.get('/progressione/:esercizioId', async (req, res, next) => {
  try {
    const esercizioId = parseInt(req.params.esercizioId);
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    const serie = await prisma.logSerie.findMany({
      where: {
        esercizioId,
        completato: true,
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

// GET /api/v1/statistiche/frequenza — Allenamenti fatti e programmati, ultime 12 settimane
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
      // Tutti quelli messi in calendario, anche saltati: erano comunque programmati
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

export default router;
