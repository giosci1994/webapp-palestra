// ============================================
// GymMaster — Misurazioni composizione corporea
// L'utente gestisce le proprie; il PT può aggiungerle ai suoi clienti.
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

const num = (v) => (v === '' || v === undefined || v === null || isNaN(parseFloat(v))) ? null : parseFloat(v);
const intero = (v) => (v === '' || v === undefined || v === null || isNaN(parseInt(v))) ? null : parseInt(v);

function costruisciDati(body) {
  return {
    data: body.data ? new Date(body.data) : new Date(),
    peso: num(body.peso),
    bmi: num(body.bmi),
    grassoCorporeoPct: num(body.grassoCorporeoPct),
    muscoloScheletricoPct: num(body.muscoloScheletricoPct),
    massaMagraKg: num(body.massaMagraKg),
    grassoSottocutaneoPct: num(body.grassoSottocutaneoPct),
    grassoViscerale: num(body.grassoViscerale),
    acquaPct: num(body.acquaPct),
    massaMuscolareKg: num(body.massaMuscolareKg),
    massaOsseaKg: num(body.massaOsseaKg),
    proteinePct: num(body.proteinePct),
    bmr: intero(body.bmr),
    etaMetabolica: intero(body.etaMetabolica),
    note: body.note || null
  };
}

// Calcola il BMI dal peso e dall'altezza dell'utente, se non fornito
async function calcolaBmiSeMancante(dati, utenteId) {
  if (dati.bmi == null && dati.peso != null) {
    const u = await prisma.utente.findUnique({ where: { id: utenteId }, select: { altezzaCm: true } });
    if (u?.altezzaCm) dati.bmi = Math.round((dati.peso / Math.pow(u.altezzaCm / 100, 2)) * 10) / 10;
  }
}

// Verifica che l'utente sia il PT (attivo) del cliente indicato
async function isPTDelCliente(ptId, clienteId) {
  const isc = await prisma.iscrizionePT.findFirst({
    where: { trainerId: ptId, utenteId: clienteId, stato: 'ATTIVA' },
    select: { id: true }
  });
  return !!isc;
}

// GET /api/v1/misurazioni — le proprie misurazioni
router.get('/', async (req, res, next) => {
  try {
    const lista = await prisma.misurazioneCorporea.findMany({
      where: { utenteId: req.utente.id },
      orderBy: { data: 'desc' }
    });
    res.json({ successo: true, dati: lista });
  } catch (errore) { next(errore); }
});

// POST /api/v1/misurazioni — aggiunge una propria misurazione
router.post('/', async (req, res, next) => {
  try {
    const dati = costruisciDati(req.body);
    await calcolaBmiSeMancante(dati, req.utente.id);
    const m = await prisma.misurazioneCorporea.create({ data: { ...dati, utenteId: req.utente.id } });
    res.status(201).json({ successo: true, dati: m });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/misurazioni/:id — elimina una propria misurazione
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const m = await prisma.misurazioneCorporea.findUnique({ where: { id }, select: { utenteId: true } });
    if (!m) return res.status(404).json({ successo: false, messaggio: 'Misurazione non trovata' });
    if (m.utenteId !== req.utente.id) return res.status(403).json({ successo: false, messaggio: 'Non autorizzato' });
    await prisma.misurazioneCorporea.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Misurazione eliminata' });
  } catch (errore) { next(errore); }
});

// GET /api/v1/misurazioni/cliente/:id — il PT vede le misurazioni di un suo cliente
router.get('/cliente/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    if (!(await isPTDelCliente(req.utente.id, clienteId))) {
      return res.status(403).json({ successo: false, messaggio: 'Non sei il Personal Trainer di questo cliente' });
    }
    const lista = await prisma.misurazioneCorporea.findMany({
      where: { utenteId: clienteId },
      orderBy: { data: 'desc' }
    });
    res.json({ successo: true, dati: lista });
  } catch (errore) { next(errore); }
});

// POST /api/v1/misurazioni/cliente/:id — il PT aggiunge una misurazione a un suo cliente
router.post('/cliente/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    if (!(await isPTDelCliente(req.utente.id, clienteId))) {
      return res.status(403).json({ successo: false, messaggio: 'Non sei il Personal Trainer di questo cliente' });
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
