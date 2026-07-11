// ============================================
// GymMaster — Routes Statistiche
// Dati aggregati per grafici e report utente
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

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

    res.json({
      successo: true,
      dati: {
        totaleSessioni,
        totaleDurata,
        totaleVolume: Math.round(totaleVolume),
        totaleRecord,
        streak,
        schedeCreate
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

// GET /api/v1/statistiche/record — Record personali con storico
router.get('/record', async (req, res, next) => {
  try {
    const utenteDb = await prisma.utente.findUnique({ where: { id: req.utente.id }, select: { dataResetStatistiche: true } });
    const resetDate = utenteDb?.dataResetStatistiche || new Date(0);

    const record = await prisma.recordPersonale.findMany({
      where: { utenteId: req.utente.id, dataRecord: { gte: resetDate } },
      include: { esercizio: { select: { id: true, nome: true, gruppoMuscoloPrimario: true } } },
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

// GET /api/v1/statistiche/progressione/:esercizioId — Progressione peso nel tempo
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
      include: {
        sessione: { select: { dataInizio: true } }
      },
      orderBy: { sessione: { dataInizio: 'asc' } }
    });

    // Raggruppa per sessione e prendi il peso massimo
    const perSessione = {};
    serie.forEach(s => {
      const giorno = s.sessione.dataInizio.toISOString().split('T')[0];
      if (!perSessione[giorno] || s.pesoEffettivo > perSessione[giorno].pesoMax) {
        perSessione[giorno] = {
          data: giorno,
          pesoMax: s.pesoEffettivo,
          repMax: s.repEffettive
        };
      }
    });

    res.json({ successo: true, dati: Object.values(perSessione) });
  } catch (errore) { next(errore); }
});

export default router;
