// ============================================
// GymMaster — Exercise & Gym Routes
// Reading the exercise and gym catalogue
// ============================================

import { Router } from 'express';
import { verificaToken, verificaTokenOpzionale } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione } from '../utils/errori.js';
import { idNumerico } from '../middleware/validazione.js';
import { t } from '../i18n/index.js';
import { FUSO_ORARIO, orarioLocale } from '../utils/date.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

// --- Exercise List (with advanced filters) ---
router.get('/esercizi', verificaToken, async (req, res, next) => {
  try {
    const { gruppo, attrezzaturaId, ricerca, bodyRegion, difficulty, mechanics } = req.query;
    const filtri = {};

    if (gruppo) filtri.gruppoMuscoloPrimario = gruppo;
    if (attrezzaturaId) filtri.attrezzaturaRichiestaId = parseInt(attrezzaturaId);
    if (bodyRegion) filtri.bodyRegion = bodyRegion;
    if (difficulty) filtri.difficulty = difficulty;
    if (mechanics) filtri.mechanics = mechanics;
    // The search looks at both names: whoever types "affondo" and whoever
    // types "lunge" must find the same entries.
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

    // The alphabetical order must follow the name actually shown, which is
    // the Italian one when there is one: orderBy cannot express that.
    const mostrato = (e) => e.nomeIt || e.nome;
    esercizi.sort((a, b) =>
      a.gruppoMuscoloPrimario.localeCompare(b.gruppoMuscoloPrimario, 'it') ||
      mostrato(a).localeCompare(mostrato(b), 'it'));

    res.json({ successo: true, dati: esercizi });
  } catch (errore) { next(errore); }
});

// --- Favourite exercises: the star, for each user ---

/** The exercise id from the route; 404 if the exercise does not exist */
async function esercizioDaRotta(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroreValidazione(t('catalogoRoutes.esercizioNonValido'));
  const esiste = await prisma.esercizio.count({ where: { id } });
  if (!esiste) throw new ErroreNonTrovato(t('catalogoRoutes.esercizioNonTrovato'));
  return id;
}

// GET /api/v1/esercizi/preferiti — The ids of the favourite exercises, most recent first
router.get('/esercizi/preferiti', verificaToken, async (req, res, next) => {
  try {
    const preferiti = await prisma.esercizioPreferito.findMany({
      where: { utenteId: req.utente.id },
      orderBy: { creatoIl: 'desc' },
      select: { esercizioId: true }
    });
    res.json({ successo: true, dati: preferiti.map(p => p.esercizioId) });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/esercizi/:id/preferito — Adds the star (repeating it changes nothing)
router.put('/esercizi/:id/preferito', verificaToken, async (req, res, next) => {
  try {
    const esercizioId = await esercizioDaRotta(req);
    await prisma.esercizioPreferito.upsert({
      where: { utenteId_esercizioId: { utenteId: req.utente.id, esercizioId } },
      create: { utenteId: req.utente.id, esercizioId },
      update: {}
    });
    res.json({ successo: true });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/esercizi/:id/preferito — Removes the star (even if it was not there)
router.delete('/esercizi/:id/preferito', verificaToken, async (req, res, next) => {
  try {
    const esercizioId = await esercizioDaRotta(req);
    await prisma.esercizioPreferito.deleteMany({ where: { utenteId: req.utente.id, esercizioId } });
    res.json({ successo: true });
  } catch (errore) { next(errore); }
});

// --- Gym List ---
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

// --- Gym Crowd Levels (Google Maps scraping data) ---
router.get('/palestre/:id/affluenza', verificaTokenOpzionale, async (req, res, next) => {
  try {
    const palestraId = parseInt(req.params.id);
    if (isNaN(palestraId)) return res.status(400).json({ successo: false, errore: t('catalogoRoutes.palestraIdNonValido') });

    // The day and hour of the gym (0 = Monday), whatever the user's time zone
    const { ora: oraCorrente, giornoSettimana } = orarioLocale(new Date(), FUSO_ORARIO);

    // Data for the whole day (24 hours, only valid hours 0-23)
    const datiGiornata = await prisma.afluenzaPalestra.findMany({
      where: { palestraId, giornoSettimana, ora: { gte: 0, lte: 23 } },
      orderBy: { ora: 'asc' }
    });

    // Data for the current hour
    const datoOraCorrente = datiGiornata.find(d => d.ora === oraCorrente);

    // The "real time" figure is only valid when just collected: the scraper
    // runs every 30 minutes, so after 90 minutes it counts as expired and we
    // fall back to the historical average instead of showing a misleading live.
    const LIMITE_FRESCHEZZA_MS = 90 * 60 * 1000;
    const liveValido = (dato) =>
      dato?.liveLivello != null &&
      dato.aggiornatoIl != null &&
      (Date.now() - new Date(dato.aggiornatoIl).getTime()) <= LIMITE_FRESCHEZZA_MS;

    const liveCorrente = liveValido(datoOraCorrente) ? datoOraCorrente : null;

    // Level as text
    let livelloTesto = t('catalogoRoutes.livello.nessunDato');
    let livelloColore = 'grigio';
    if (datoOraCorrente) {
      const pct = liveCorrente?.liveLivello ?? datoOraCorrente.livelloPercentuale;
      if (pct <= 30) { livelloTesto = t('catalogoRoutes.livello.poco'); livelloColore = 'verde'; }
      else if (pct <= 60) { livelloTesto = t('catalogoRoutes.livello.medio'); livelloColore = 'giallo'; }
      else { livelloTesto = t('catalogoRoutes.livello.molto'); livelloColore = 'rosso'; }
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

// --- Best times to train ---
// The scraper collects 168 readings per gym (7 days x 24 hours): here they
// are read to answer the practical question "when will I find fewer people?".
router.get('/palestre/:id/affluenza/migliori-orari', verificaTokenOpzionale, async (req, res, next) => {
  try {
    const palestraId = parseInt(req.params.id);
    if (isNaN(palestraId)) return res.status(400).json({ successo: false, errore: t('catalogoRoutes.palestraIdNonValido') });

    // Time window considered: at night the gym is almost always empty, but
    // suggesting 4 a.m. would not help anyone.
    const da = Math.min(Math.max(parseInt(req.query.da) || 6, 0), 23);
    const a = Math.min(Math.max(parseInt(req.query.a) || 22, 0), 23);
    if (da > a) return res.status(400).json({ successo: false, errore: t('catalogoRoutes.fasciaOrariaRovesciata') });

    const righe = await prisma.afluenzaPalestra.findMany({
      where: { palestraId, ora: { gte: da, lte: a } },
      select: { giornoSettimana: true, ora: true, livelloPercentuale: true },
      orderBy: [{ giornoSettimana: 'asc' }, { ora: 'asc' }]
    });

    if (righe.length === 0) {
      return res.json({ successo: true, dati: { disponibile: false, fascia: { da, a }, perGiorno: [], migliori: [] } });
    }

    const media = righe.reduce((somma, r) => somma + r.livelloPercentuale, 0) / righe.length;

    // For each day: the three least crowded hours and the day's average
    const perGiornoMappa = new Map();
    for (const r of righe) {
      if (!perGiornoMappa.has(r.giornoSettimana)) perGiornoMappa.set(r.giornoSettimana, []);
      perGiornoMappa.get(r.giornoSettimana).push(r);
    }

    const perGiorno = [...perGiornoMappa.entries()]
      .map(([giorno, ore]) => ({
        giornoSettimana: giorno,
        media: Math.round(ore.reduce((somma, o) => somma + o.livelloPercentuale, 0) / ore.length),
        migliori: [...ore]
          .sort((x, y) => x.livelloPercentuale - y.livelloPercentuale || x.ora - y.ora)
          .slice(0, 3)
          .map(o => ({ ora: o.ora, livello: o.livelloPercentuale }))
      }))
      .sort((x, y) => x.giornoSettimana - y.giornoSettimana);

    // The best slots of the whole week
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

// --- Equipment List ---
router.get('/attrezzature', verificaToken, async (req, res, next) => {
  try {
    const attrezzature = await prisma.attrezzatura.findMany({
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }]
    });

    res.json({ successo: true, dati: attrezzature });
  } catch (errore) { next(errore); }
});

export default router;
