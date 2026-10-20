// ============================================
// GymMaster — Admin Routes (gyms, exercises, equipment, suggestions,
// banner, "what's new", password resets)
// Full CRUD for the SuperAdmin
// ============================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import argon2 from 'argon2';
import { verificaToken } from '../middleware/autenticazione.js';
import { autorizza } from '../middleware/autorizzazione.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { idNumerico } from '../middleware/validazione.js';
import { t } from '../i18n/index.js';
import { creaNotifica } from '../services/notifiche.service.js';
import { aggiornaEsercizio, creaEsercizio } from '../services/esercizi.service.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.use(verificaToken);
router.use(autorizza('SUPERADMIN'));

// PUT /api/v1/admin/utenti/:id/reset-password — Generate a random temporary password
router.put('/utenti/:id/reset-password', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) return res.status(400).json({ successo: false, messaggio: t('adminRoutes.idNonValido') });
    // Random temporary password (the admin passes it on to the user, who then changes it)
    const passwordTemporanea = crypto.randomBytes(9).toString('base64url'); // ~12 characters
    const hash = await argon2.hash(passwordTemporanea);
    await prisma.utente.update({
      where: { id: targetId },
      data: { passwordHash: hash }
    });
    logger.warn({ adminId: req.utente.id, targetId }, 'Admin ha resettato la password di un utente');
    res.json({ successo: true, messaggio: t('adminRoutes.passwordResettata'), dati: { passwordTemporanea } });
  } catch (errore) { next(errore); }
});

// ============================
// GYMS
// ============================

// POST /api/v1/admin/palestre — Create a gym
router.post('/palestre', async (req, res, next) => {
  try {
    const { nomeCatena, citta, indirizzo, nazione, googlePlaceId } = req.body;
    const palestra = await prisma.palestra.create({
      data: { nomeCatena, citta, indirizzo, nazione: nazione || 'Italia', googlePlaceId: googlePlaceId || null }
    });
    res.status(201).json({ successo: true, dati: palestra });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/palestre/:id — Update a gym
router.put('/palestre/:id', async (req, res, next) => {
  try {
    const { nomeCatena, citta, indirizzo, nazione, googlePlaceId } = req.body;
    const palestra = await prisma.palestra.update({
      where: { id: parseInt(req.params.id) },
      data: { nomeCatena, citta, indirizzo, nazione, googlePlaceId: googlePlaceId !== undefined ? (googlePlaceId || null) : undefined }
    });
    res.json({ successo: true, dati: palestra });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/admin/palestre/:id — Delete a gym
router.delete('/palestre/:id', async (req, res, next) => {
  try {
    await prisma.palestra.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: t('adminRoutes.palestraEliminata') });
  } catch (errore) { next(errore); }
});

// ============================
// EXERCISES
// ============================

// POST /api/v1/admin/esercizi — Create an exercise
router.post('/esercizi', async (req, res, next) => {
  try {
    res.status(201).json({ successo: true, dati: await creaEsercizio(req.body) });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/esercizi/:id — Update an exercise
router.put('/esercizi/:id', async (req, res, next) => {
  try {
    res.json({ successo: true, dati: await aggiornaEsercizio(parseInt(req.params.id), req.body) });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/admin/esercizi/:id — Delete an exercise
router.delete('/esercizi/:id', async (req, res, next) => {
  try {
    await prisma.esercizio.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: t('adminRoutes.esercizioEliminato') });
  } catch (errore) { next(errore); }
});

// ============================
// EQUIPMENT
// ============================

// POST /api/v1/admin/attrezzature — Create a piece of equipment
router.post('/attrezzature', async (req, res, next) => {
  try {
    const { nome, categoria, muscoliBersaglio } = req.body;
    const attrezzatura = await prisma.attrezzatura.create({
      data: { nome, categoria, muscoliBersaglio: muscoliBersaglio || null }
    });
    res.status(201).json({ successo: true, dati: attrezzatura });
  } catch (errore) { next(errore); }
});

// ============================
// EXERCISE SUGGESTIONS
// ============================

// GET /api/v1/admin/suggerimenti — List every suggestion
router.get('/suggerimenti', async (req, res, next) => {
  try {
    const { stato } = req.query;
    const filtri = {};
    if (stato) filtri.stato = stato;

    const suggerimenti = await prisma.suggerimentoEsercizio.findMany({
      where: filtri,
      orderBy: [{ stato: 'asc' }, { creatoIl: 'desc' }],
      include: {
        utente: { select: { id: true, nome: true, email: true } },
        esercizio: { select: { id: true, nome: true, nomeIt: true } }
      }
    });

    res.json({ successo: true, dati: suggerimenti });
  } catch (errore) { next(errore); }
});

// GET /api/v1/admin/suggerimenti/conteggio — Count of pending suggestions
router.get('/suggerimenti/conteggio', async (req, res, next) => {
  try {
    const conteggio = await prisma.suggerimentoEsercizio.count({
      where: { stato: 'IN_ATTESA' }
    });
    res.json({ successo: true, dati: { pendenti: conteggio } });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/admin/suggerimenti/:id/approva — Approve and create the exercise
router.patch('/suggerimenti/:id/approva', async (req, res, next) => {
  try {
    const suggerimentoId = parseInt(req.params.id);
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaRichiestaId, descrizione, linkVideo } = req.body;

    // Find the suggestion
    const suggerimento = await prisma.suggerimentoEsercizio.findUnique({
      where: { id: suggerimentoId },
      include: { utente: { select: { id: true, nome: true } } }
    });

    if (!suggerimento) {
      return res.status(404).json({ successo: false, messaggio: t('adminRoutes.suggerimentoNonTrovato') });
    }

    if (suggerimento.stato !== 'IN_ATTESA') {
      return res.status(400).json({ successo: false, messaggio: t('adminRoutes.suggerimentoGiaGestito') });
    }

    // Create the real exercise (uses the fields edited by the admin or the original ones)
    const esercizio = await prisma.esercizio.create({
      data: {
        nome: nome || suggerimento.nome,
        gruppoMuscoloPrimario: gruppoMuscoloPrimario || suggerimento.gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: (gruppoMuscoloSecondario !== undefined ? gruppoMuscoloSecondario : suggerimento.gruppoMuscoloSecondario) || null,
        attrezzaturaRichiestaId: attrezzaturaRichiestaId ? parseInt(attrezzaturaRichiestaId) : null,
        descrizione: (descrizione !== undefined ? descrizione : suggerimento.descrizione) || null,
        linkVideo: linkVideo || null
      },
      include: { attrezzatura: { select: { id: true, nome: true } } }
    });

    // Mark the suggestion as approved
    await prisma.suggerimentoEsercizio.update({
      where: { id: suggerimentoId },
      data: {
        stato: 'APPROVATO',
        esercizioCreato: esercizio.id,
        gestitoIl: new Date()
      }
    });

    // Notify the user who made the suggestion, in their language
    await creaNotifica(req.app.get('io'), suggerimento.utenteId, {
      titolo: 'adminRoutes.esercizioApprovatoTitolo',
      messaggio: 'adminRoutes.esercizioApprovatoMessaggio',
      variabili: { nome: suggerimento.nome },
      percorso: '/catalogo'
    });

    res.json({
      successo: true,
      messaggio: t('adminRoutes.suggerimentoApprovato'),
      dati: esercizio
    });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/admin/suggerimenti/:id/rifiuta — Reject a suggestion
router.patch('/suggerimenti/:id/rifiuta', async (req, res, next) => {
  try {
    const suggerimentoId = parseInt(req.params.id);
    const { motivoRifiuto } = req.body;

    const suggerimento = await prisma.suggerimentoEsercizio.findUnique({
      where: { id: suggerimentoId },
      include: { utente: { select: { id: true, nome: true } } }
    });

    if (!suggerimento) {
      return res.status(404).json({ successo: false, messaggio: t('adminRoutes.suggerimentoNonTrovato') });
    }

    if (suggerimento.stato !== 'IN_ATTESA') {
      return res.status(400).json({ successo: false, messaggio: t('adminRoutes.suggerimentoGiaGestito') });
    }

    await prisma.suggerimentoEsercizio.update({
      where: { id: suggerimentoId },
      data: {
        stato: 'RIFIUTATO',
        motivoRifiuto: motivoRifiuto || null,
        gestitoIl: new Date()
      }
    });

    // Notify the user, in their language
    await creaNotifica(req.app.get('io'), suggerimento.utenteId, {
      titolo: 'adminRoutes.suggerimentoRifiutatoTitolo',
      messaggio: motivoRifiuto ? 'adminRoutes.suggerimentoRifiutatoConMotivo' : 'adminRoutes.suggerimentoRifiutatoSenzaMotivo',
      variabili: { nome: suggerimento.nome, motivo: motivoRifiuto },
      percorso: '/catalogo'
    });

    res.json({ successo: true, messaggio: t('adminRoutes.suggerimentoRifiutato') });
  } catch (errore) { next(errore); }
});

// ============================
// GLOBAL BANNER
// ============================

// PUT /api/v1/admin/banner — Edit the banner
router.put('/banner', async (req, res, next) => {
  try {
    const { visibile, testo } = req.body;
    const bannerPath = path.resolve('prisma/dati/banner.json');
    const dati = { visibile: !!visibile, testo: testo || '' };
    fs.writeFileSync(bannerPath, JSON.stringify(dati, null, 2), 'utf8');
    
    // Optional notification for a real-time update (optional)
    const io = req.app.get('io');
    if (io) {
      io.emit('notifica:banner_aggiornato', dati);
    }
    
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// ============================
// WHAT'S NEW (in-app stories)
// ============================

function normalizzaPunti(punti) {
  if (punti === undefined) return undefined;
  if (!punti) return null;
  return typeof punti === 'string' ? punti : JSON.stringify(punti);
}

// GET /api/v1/admin/novita — all of them (inactive ones too)
router.get('/novita', async (req, res, next) => {
  try {
    const novita = await prisma.novita.findMany({ orderBy: [{ ordine: 'asc' }, { creatoIl: 'desc' }] });
    res.json({ successo: true, dati: novita });
  } catch (errore) { next(errore); }
});

// POST /api/v1/admin/novita — create
router.post('/novita', async (req, res, next) => {
  try {
    const { titolo, sottotitolo, punti, icona, immagine, ctaTesto, ctaRotta, coloreInizio, coloreFine, attiva, ordine } = req.body;
    if (!titolo) return res.status(400).json({ successo: false, messaggio: t('adminRoutes.titoloObbligatorio') });
    const nuova = await prisma.novita.create({
      data: {
        titolo,
        sottotitolo: sottotitolo || null,
        punti: normalizzaPunti(punti) ?? null,
        icona: icona || null,
        immagine: immagine || null,
        ctaTesto: ctaTesto || null,
        ctaRotta: ctaRotta || null,
        coloreInizio: coloreInizio || null,
        coloreFine: coloreFine || null,
        attiva: attiva !== false,
        ordine: ordine != null ? parseInt(ordine) : 0
      }
    });
    res.status(201).json({ successo: true, dati: nuova });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/novita/:id — update
router.put('/novita/:id', async (req, res, next) => {
  try {
    const { titolo, sottotitolo, punti, icona, immagine, ctaTesto, ctaRotta, coloreInizio, coloreFine, attiva, ordine } = req.body;
    const puntiNorm = normalizzaPunti(punti);
    const aggiornata = await prisma.novita.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(titolo !== undefined && { titolo }),
        ...(sottotitolo !== undefined && { sottotitolo: sottotitolo || null }),
        ...(puntiNorm !== undefined && { punti: puntiNorm }),
        ...(icona !== undefined && { icona: icona || null }),
        ...(immagine !== undefined && { immagine: immagine || null }),
        ...(ctaTesto !== undefined && { ctaTesto: ctaTesto || null }),
        ...(ctaRotta !== undefined && { ctaRotta: ctaRotta || null }),
        ...(coloreInizio !== undefined && { coloreInizio: coloreInizio || null }),
        ...(coloreFine !== undefined && { coloreFine: coloreFine || null }),
        ...(attiva !== undefined && { attiva: !!attiva }),
        ...(ordine !== undefined && { ordine: parseInt(ordine) || 0 })
      }
    });
    res.json({ successo: true, dati: aggiornata });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/admin/novita/:id — delete
router.delete('/novita/:id', async (req, res, next) => {
  try {
    await prisma.novita.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: t('adminRoutes.novitaEliminata') });
  } catch (errore) { next(errore); }
});

export default router;

