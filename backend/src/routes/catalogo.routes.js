// ============================================
// GymMaster — Routes Esercizi & Palestre
// Lettura catalogo esercizi e palestre
// ============================================

import { Router } from 'express';
import { verificaToken, verificaTokenOpzionale } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();

// --- Lista Esercizi (con filtri avanzati) ---
router.get('/esercizi', verificaToken, async (req, res, next) => {
  try {
    const { gruppo, attrezzaturaId, ricerca, bodyRegion, difficulty, mechanics } = req.query;
    const filtri = {};

    if (gruppo) filtri.gruppoMuscoloPrimario = gruppo;
    if (attrezzaturaId) filtri.attrezzaturaRichiestaId = parseInt(attrezzaturaId);
    if (bodyRegion) filtri.bodyRegion = bodyRegion;
    if (difficulty) filtri.difficulty = difficulty;
    if (mechanics) filtri.mechanics = mechanics;
    if (ricerca) filtri.nome = { contains: ricerca, mode: 'insensitive' };

    const esercizi = await prisma.esercizio.findMany({
      where: filtri,
      include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } },
      orderBy: [{ gruppoMuscoloPrimario: 'asc' }, { nome: 'asc' }]
    });

    res.json({ successo: true, dati: esercizi });
  } catch (errore) { next(errore); }
});

// --- Lista Palestre ---
router.get('/palestre', verificaTokenOpzionale, async (req, res, next) => {
  try {
    const palestre = await prisma.palestra.findMany({
      include: {
        attrezzature: {
          include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } }
        }
      },
      orderBy: [{ nazione: 'asc' }, { citta: 'asc' }, { nomeCatena: 'asc' }]
    });

    res.json({ successo: true, dati: palestre });
  } catch (errore) { next(errore); }
});

// --- Affluenza Palestra (dati scraping Google Maps) ---
router.get('/palestre/:id/affluenza', verificaTokenOpzionale, async (req, res, next) => {
  try {
    const palestraId = parseInt(req.params.id);
    if (isNaN(palestraId)) return res.status(400).json({ successo: false, errore: 'ID palestra non valido' });

    // Usa timezone Europe/Copenhagen per calcolo giorno/ora
    const adesso = new Date();
    const opzioniTZ = { timeZone: 'Europe/Copenhagen' };
    const oraLocale = parseInt(adesso.toLocaleString('en-US', { ...opzioniTZ, hour: 'numeric', hour12: false }));
    const giornoLocale = parseInt(adesso.toLocaleString('en-US', { ...opzioniTZ, weekday: 'narrow' }).length); // fallback
    // Calcolo giorno: 0=Lun, 6=Dom
    const giornoJS = new Date(adesso.toLocaleString('en-US', opzioniTZ)).getDay(); // 0=Sun
    const giornoSettimana = (giornoJS + 6) % 7; // 0=Lun, 6=Dom
    const oraCorrente = oraLocale;

    // Dati giornata completa (24 ore, solo ore valide 0-23)
    const datiGiornata = await prisma.afluenzaPalestra.findMany({
      where: { palestraId, giornoSettimana, ora: { gte: 0, lte: 23 } },
      orderBy: { ora: 'asc' }
    });

    // Dato ora corrente
    const datoOraCorrente = datiGiornata.find(d => d.ora === oraCorrente);

    // Livello testuale
    let livelloTesto = 'Nessun dato';
    let livelloColore = 'grigio';
    if (datoOraCorrente) {
      const pct = datoOraCorrente.liveLivello ?? datoOraCorrente.livelloPercentuale;
      if (pct <= 30) { livelloTesto = 'Poco affollata'; livelloColore = 'verde'; }
      else if (pct <= 60) { livelloTesto = 'Mediamente affollata'; livelloColore = 'giallo'; }
      else { livelloTesto = 'Molto affollata'; livelloColore = 'rosso'; }
    }

    res.json({
      successo: true,
      dati: {
        palestraId,
        giornoSettimana,
        oraCorrente,
        livelloTesto,
        livelloColore,
        liveLivello: datoOraCorrente?.liveLivello ?? null,
        liveDescrizione: datoOraCorrente?.liveDescrizione ?? null,
        livelloPercentuale: datoOraCorrente?.livelloPercentuale ?? null,
        aggiornatoIl: datoOraCorrente?.aggiornatoIl ?? null,
        graficoGiornata: datiGiornata.map(d => ({
          ora: d.ora,
          livello: d.livelloPercentuale,
          live: d.liveLivello
        }))
      }
    });
  } catch (errore) { next(errore); }
});

// --- Lista Attrezzature ---
router.get('/attrezzature', verificaToken, async (req, res, next) => {
  try {
    const attrezzature = await prisma.attrezzatura.findMany({
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }]
    });

    res.json({ successo: true, dati: attrezzature });
  } catch (errore) { next(errore); }
});

export default router;
