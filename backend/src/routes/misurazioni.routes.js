// ============================================
// GymMaster — Body composition measurements
// Users manage their own; a personal trainer can add them for their clients.
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { idNumerico } from '../middleware/validazione.js';
import { t } from '../i18n/index.js';
import { ErroreValidazione } from '../utils/errori.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.use(verificaToken);

// Largest value of each numeric field (all start from 0), and whether it is a
// whole number. They are physical limits: a weight of 99999 kg is a typo.
const LIMITI = {
  peso: { massimo: 1000 },
  bmi: { massimo: 200 },
  grassoCorporeoPct: { massimo: 100 },
  muscoloScheletricoPct: { massimo: 100 },
  massaMagraKg: { massimo: 1000 },
  grassoSottocutaneoPct: { massimo: 100 },
  grassoViscerale: { massimo: 100 },
  acquaPct: { massimo: 100 },
  massaMuscolareKg: { massimo: 1000 },
  massaOsseaKg: { massimo: 1000 },
  proteinePct: { massimo: 100 },
  bmr: { massimo: 20000, intero: true },
  etaMetabolica: { massimo: 150, intero: true }
};
const NOTE_MAX = 2000;
const DATA_MINIMA = new Date('1900-01-01T00:00:00Z');
const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

const vuoto = (v) => v === undefined || v === null || v === '';

/**
 * A numeric field of the body. Empty values (null, '') and text that is not a
 * number are saved empty, as the app has always done; a value that is not a
 * number or text, or outside the field's limits, is refused.
 */
function leggiNumero(body, campo) {
  const valore = body[campo];
  if (vuoto(valore)) return null;
  const { massimo, intero } = LIMITI[campo];
  const nome = t(`misurazioniRoutes.campi.${campo}`);
  if (typeof valore !== 'number' && typeof valore !== 'string') {
    throw new ErroreValidazione(t('misurazioniRoutes.numeroNonValido', { campo: nome }));
  }
  const n = typeof valore === 'number' ? valore : (intero ? parseInt(valore) : parseFloat(valore));
  if (isNaN(n)) return null;
  if (!Number.isFinite(n) || n < 0 || n > massimo) {
    throw new ErroreValidazione(t('misurazioniRoutes.numeroFuoriIntervallo', { campo: nome, max: massimo }));
  }
  return intero ? Math.trunc(n) : n;
}

/** The date of the measurement: an ISO date or date-time, not in the future; now when missing */
function leggiData(valore) {
  if (vuoto(valore)) return new Date();
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(valore)) {
    throw new ErroreValidazione(t('misurazioniRoutes.dataNonValida'));
  }
  const data = new Date(valore);
  if (isNaN(data.getTime()) || data < DATA_MINIMA) throw new ErroreValidazione(t('misurazioniRoutes.dataNonValida'));
  // A day of tolerance for time zones and clocks that are a little ahead
  if (data.getTime() > Date.now() + UN_GIORNO_MS) throw new ErroreValidazione(t('misurazioniRoutes.dataNelFuturo'));
  return data;
}

function leggiNote(valore) {
  if (vuoto(valore)) return null;
  // A NUL character cannot be stored by the database
  if (typeof valore !== 'string' || valore.includes('\u0000')) throw new ErroreValidazione(t('misurazioniRoutes.noteNonValide'));
  if (valore.length > NOTE_MAX) throw new ErroreValidazione(t('misurazioniRoutes.noteTroppoLunghe', { max: NOTE_MAX }));
  return valore;
}

function costruisciDati(body) {
  return {
    data: leggiData(body.data),
    peso: leggiNumero(body, 'peso'),
    bmi: leggiNumero(body, 'bmi'),
    grassoCorporeoPct: leggiNumero(body, 'grassoCorporeoPct'),
    muscoloScheletricoPct: leggiNumero(body, 'muscoloScheletricoPct'),
    massaMagraKg: leggiNumero(body, 'massaMagraKg'),
    grassoSottocutaneoPct: leggiNumero(body, 'grassoSottocutaneoPct'),
    grassoViscerale: leggiNumero(body, 'grassoViscerale'),
    acquaPct: leggiNumero(body, 'acquaPct'),
    massaMuscolareKg: leggiNumero(body, 'massaMuscolareKg'),
    massaOsseaKg: leggiNumero(body, 'massaOsseaKg'),
    proteinePct: leggiNumero(body, 'proteinePct'),
    bmr: leggiNumero(body, 'bmr'),
    etaMetabolica: leggiNumero(body, 'etaMetabolica'),
    note: leggiNote(body.note)
  };
}

// Computes the BMI from the user's weight and height, if not provided
async function calcolaBmiSeMancante(dati, utenteId) {
  if (dati.bmi == null && dati.peso != null) {
    const u = await prisma.utente.findUnique({ where: { id: utenteId }, select: { altezzaCm: true } });
    if (u?.altezzaCm) dati.bmi = Math.round((dati.peso / Math.pow(u.altezzaCm / 100, 2)) * 10) / 10;
  }
}

// Checks that the user is the (active) personal trainer of the given client
async function isPTDelCliente(ptId, clienteId) {
  const isc = await prisma.iscrizionePT.findFirst({
    where: { trainerId: ptId, utenteId: clienteId, stato: 'ATTIVA' },
    select: { id: true }
  });
  return !!isc;
}

// GET /api/v1/misurazioni — your own measurements
router.get('/', async (req, res, next) => {
  try {
    const lista = await prisma.misurazioneCorporea.findMany({
      where: { utenteId: req.utente.id },
      orderBy: { data: 'desc' }
    });
    res.json({ successo: true, dati: lista });
  } catch (errore) { next(errore); }
});

// POST /api/v1/misurazioni — adds one of your own measurements
router.post('/', async (req, res, next) => {
  try {
    const dati = costruisciDati(req.body);
    await calcolaBmiSeMancante(dati, req.utente.id);
    const m = await prisma.misurazioneCorporea.create({ data: { ...dati, utenteId: req.utente.id } });
    res.status(201).json({ successo: true, dati: m });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/misurazioni/:id — deletes one of your own measurements
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const m = await prisma.misurazioneCorporea.findUnique({ where: { id }, select: { utenteId: true } });
    if (!m) return res.status(404).json({ successo: false, messaggio: t('misurazioniRoutes.misurazioneNonTrovata') });
    if (m.utenteId !== req.utente.id) return res.status(403).json({ successo: false, messaggio: t('misurazioniRoutes.nonAutorizzato') });
    await prisma.misurazioneCorporea.delete({ where: { id } });
    res.json({ successo: true, messaggio: t('misurazioniRoutes.misurazioneEliminata') });
  } catch (errore) { next(errore); }
});

// GET /api/v1/misurazioni/cliente/:id — the personal trainer sees a client's measurements
router.get('/cliente/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    if (!(await isPTDelCliente(req.utente.id, clienteId))) {
      return res.status(403).json({ successo: false, messaggio: t('misurazioniRoutes.nonSeiIlPtDelCliente') });
    }
    const lista = await prisma.misurazioneCorporea.findMany({
      where: { utenteId: clienteId },
      orderBy: { data: 'desc' }
    });
    res.json({ successo: true, dati: lista });
  } catch (errore) { next(errore); }
});

// POST /api/v1/misurazioni/cliente/:id — the personal trainer adds a measurement for a client
router.post('/cliente/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    if (!(await isPTDelCliente(req.utente.id, clienteId))) {
      return res.status(403).json({ successo: false, messaggio: t('misurazioniRoutes.nonSeiIlPtDelCliente') });
    }
    const dati = costruisciDati(req.body);
    await calcolaBmiSeMancante(dati, clienteId);
    const m = await prisma.misurazioneCorporea.create({
      data: { ...dati, utenteId: clienteId, inseritaDaPTId: req.utente.id }
    });
    res.status(201).json({ successo: true, dati: m });
  } catch (errore) { next(errore); }
});

export default router;
