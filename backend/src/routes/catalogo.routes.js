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
    // La ricerca interroga entrambi i nomi: chi scrive "affondo" e chi scrive
    // "lunge" deve trovare le stesse voci.
    if (ricerca) {
      filtri.OR = [
        { nome: { contains: ricerca, mode: 'insensitive' } },
        { nomeIt: { contains: ricerca, mode: 'insensitive' } }
      ];
    }

    const esercizi = await prisma.esercizio.findMany({
      where: filtri,
      include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } },
      orderBy: [{ gruppoMuscoloPrimario: 'asc' }]
    });

    // L'ordinamento alfabetico deve seguire il nome effettivamente mostrato,
    // che è quello italiano quando c'è: non si può esprimere in orderBy.
    const mostrato = (e) => e.nomeIt || e.nome;
    esercizi.sort((a, b) =>
      a.gruppoMuscoloPrimario.localeCompare(b.gruppoMuscoloPrimario, 'it') ||
      mostrato(a).localeCompare(mostrato(b), 'it'));

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

    // Il dato "in tempo reale" vale solo se appena raccolto: lo scraper gira
    // ogni 30 minuti, quindi oltre i 90 minuti e' da considerarsi scaduto e si
    // ricade sulla media storica invece di mostrare un live fuorviante.
    const LIMITE_FRESCHEZZA_MS = 90 * 60 * 1000;
    const liveValido = (dato) =>
      dato?.liveLivello != null &&
      dato.aggiornatoIl != null &&
      (Date.now() - new Date(dato.aggiornatoIl).getTime()) <= LIMITE_FRESCHEZZA_MS;

    const liveCorrente = liveValido(datoOraCorrente) ? datoOraCorrente : null;

    // Livello testuale
    let livelloTesto = 'Nessun dato';
    let livelloColore = 'grigio';
    if (datoOraCorrente) {
      const pct = liveCorrente?.liveLivello ?? datoOraCorrente.livelloPercentuale;
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
        liveLivello: liveCorrente?.liveLivello ?? null,
        liveDescrizione: liveCorrente?.liveDescrizione ?? null,
        livelloPercentuale: datoOraCorrente?.livelloPercentuale ?? null,
        aggiornatoIl: datoOraCorrente?.aggiornatoIl ?? null,
        graficoGiornata: datiGiornata.map(d => ({
          ora: d.ora,
          livello: d.livelloPercentuale,
          live: liveValido(d) ? d.liveLivello : null
        }))
      }
    });
  } catch (errore) { next(errore); }
});

// --- Migliori orari per allenarsi ---
// Lo scraper raccoglie 168 rilevazioni per palestra (7 giorni x 24 ore): qui
// vengono lette per rispondere alla domanda pratica "quando trovo meno gente?".
router.get('/palestre/:id/affluenza/migliori-orari', verificaTokenOpzionale, async (req, res, next) => {
  try {
    const palestraId = parseInt(req.params.id);
    if (isNaN(palestraId)) return res.status(400).json({ successo: false, errore: 'ID palestra non valido' });

    // Fascia oraria considerata: di notte la palestra e' quasi sempre vuota, ma
    // suggerire le 4 del mattino non aiuterebbe nessuno.
    const da = Math.min(Math.max(parseInt(req.query.da) || 6, 0), 23);
    const a = Math.min(Math.max(parseInt(req.query.a) || 22, 0), 23);
    if (da > a) return res.status(400).json({ successo: false, errore: 'Fascia oraria rovesciata' });

    const righe = await prisma.afluenzaPalestra.findMany({
      where: { palestraId, ora: { gte: da, lte: a } },
      select: { giornoSettimana: true, ora: true, livelloPercentuale: true },
      orderBy: [{ giornoSettimana: 'asc' }, { ora: 'asc' }]
    });

    if (righe.length === 0) {
      return res.json({ successo: true, dati: { disponibile: false, fascia: { da, a }, perGiorno: [], migliori: [] } });
    }

    const media = righe.reduce((t, r) => t + r.livelloPercentuale, 0) / righe.length;

    // Per ogni giorno: le tre ore meno affollate e la media della giornata
    const perGiornoMappa = new Map();
    for (const r of righe) {
      if (!perGiornoMappa.has(r.giornoSettimana)) perGiornoMappa.set(r.giornoSettimana, []);
      perGiornoMappa.get(r.giornoSettimana).push(r);
    }

    const perGiorno = [...perGiornoMappa.entries()]
      .map(([giorno, ore]) => ({
        giornoSettimana: giorno,
        media: Math.round(ore.reduce((t, o) => t + o.livelloPercentuale, 0) / ore.length),
        migliori: [...ore]
          .sort((x, y) => x.livelloPercentuale - y.livelloPercentuale || x.ora - y.ora)
          .slice(0, 3)
          .map(o => ({ ora: o.ora, livello: o.livelloPercentuale }))
      }))
      .sort((x, y) => x.giornoSettimana - y.giornoSettimana);

    // Le fasce migliori in assoluto della settimana
    const migliori = [...righe]
      .sort((x, y) => x.livelloPercentuale - y.livelloPercentuale || x.giornoSettimana - y.giornoSettimana || x.ora - y.ora)
      .slice(0, 5)
      .map(r => ({ giornoSettimana: r.giornoSettimana, ora: r.ora, livello: r.livelloPercentuale }));

    const giornoPiuTranquillo = [...perGiorno].sort((x, y) => x.media - y.media)[0];

    res.json({
      successo: true,
      dati: {
        disponibile: true,
        fascia: { da, a },
        mediaGenerale: Math.round(media),
        rilevazioni: righe.length,
        giornoPiuTranquillo: giornoPiuTranquillo?.giornoSettimana ?? null,
        perGiorno,
        migliori
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
