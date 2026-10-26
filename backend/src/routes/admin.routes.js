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
import { idNumerico, valida } from '../middleware/validazione.js';
import { ErroreConflitto, ErroreValidazione } from '../utils/errori.js';
import { t, localeDi } from '../i18n/index.js';
import {
  schemaCreaPalestra, schemaAggiornaPalestra, schemaCreaAttrezzatura, schemaElencoSuggerimenti,
  schemaApprovaSuggerimento, schemaRifiutaSuggerimento, schemaBanner, schemaCreaNovita, schemaAggiornaNovita
} from '../validators/admin.schema.js';
import { creaNotifica } from '../services/notifiche.service.js';
import { aggiornaEsercizio, creaEsercizio } from '../services/esercizi.service.js';
import { elencoDaControllare, segnaControllato, unisciAllenamenti } from '../services/allenamentiDaControllare.service.js';

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
router.post('/palestre', valida({ body: schemaCreaPalestra }), async (req, res, next) => {
  try {
    const { nomeCatena, citta, indirizzo, nazione, googlePlaceId } = req.body;
    const palestra = await prisma.palestra.create({
      data: { nomeCatena, citta, indirizzo, nazione: nazione || 'Italia', googlePlaceId: googlePlaceId || null }
    });
    res.status(201).json({ successo: true, dati: palestra });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/palestre/:id — Update a gym
router.put('/palestre/:id', valida({ body: schemaAggiornaPalestra }), async (req, res, next) => {
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

/**
 * An exercise that is in a plan, in a logged workout or in a personal record
 * cannot be deleted (the database refuses): 409 saying where it is used.
 * (Favourites go with it, a suggestion only loses its link.)
 */
async function verificaEsercizioNonInUso(id) {
  const esercizio = await prisma.esercizio.findUnique({
    where: { id },
    select: { _count: { select: { eserciziScheda: true, logSerie: true, recordPersonali: true } } }
  });
  if (!esercizio) return; // the delete answers 404
  const { eserciziScheda, logSerie, recordPersonali } = esercizio._count;
  const dove = [
    eserciziScheda && t('adminRoutes.usoInSchede', { count: eserciziScheda }),
    logSerie && t('adminRoutes.usoInSerie', { count: logSerie }),
    recordPersonali && t('adminRoutes.usoInRecord', { count: recordPersonali })
  ].filter(Boolean);
  if (dove.length === 0) return;
  const elenco = new Intl.ListFormat(localeDi(), { style: 'long', type: 'conjunction' }).format(dove);
  throw new ErroreConflitto(t('adminRoutes.esercizioInUso', { dove: elenco }));
}

// DELETE /api/v1/admin/esercizi/:id — Delete an exercise
router.delete('/esercizi/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await verificaEsercizioNonInUso(id);
    try {
      await prisma.esercizio.delete({ where: { id } });
    } catch (errore) {
      // Used by someone between the check and the delete: same answer
      if (errore.code === 'P2003') await verificaEsercizioNonInUso(id);
      throw errore;
    }
    res.json({ successo: true, messaggio: t('adminRoutes.esercizioEliminato') });
  } catch (errore) { next(errore); }
});

// ============================
// EQUIPMENT
// ============================

// POST /api/v1/admin/attrezzature — Create a piece of equipment
router.post('/attrezzature', valida({ body: schemaCreaAttrezzatura }), async (req, res, next) => {
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
router.get('/suggerimenti', valida({ query: schemaElencoSuggerimenti }), async (req, res, next) => {
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
router.patch('/suggerimenti/:id/approva', valida({ body: schemaApprovaSuggerimento }), async (req, res, next) => {
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

    // The equipment must exist (the database would refuse a wrong id)
    const attrezzaturaId = attrezzaturaRichiestaId ? parseInt(attrezzaturaRichiestaId) : null;
    if (attrezzaturaId && !await prisma.attrezzatura.findUnique({ where: { id: attrezzaturaId }, select: { id: true } })) {
      throw new ErroreValidazione(t('adminRoutes.attrezzaturaNonTrovata'));
    }

    // Create the real exercise (uses the fields edited by the admin or the original ones)
    const esercizio = await prisma.esercizio.create({
      data: {
        nome: nome || suggerimento.nome,
        gruppoMuscoloPrimario: gruppoMuscoloPrimario || suggerimento.gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: (gruppoMuscoloSecondario !== undefined ? gruppoMuscoloSecondario : suggerimento.gruppoMuscoloSecondario) || null,
        attrezzaturaRichiestaId: attrezzaturaId,
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
router.patch('/suggerimenti/:id/rifiuta', valida({ body: schemaRifiutaSuggerimento }), async (req, res, next) => {
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
router.put('/banner', valida({ body: schemaBanner }), async (req, res, next) => {
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
// WORKOUTS TO CHECK
// ============================
// Corrected, closed and deleted through /sessioni/:id, as the owner would

// GET /api/v1/admin/allenamenti — Workouts left open, overlapping, closed by the server, too long or empty
router.get('/allenamenti', async (req, res, next) => {
  try {
    res.json({ successo: true, dati: await elencoDaControllare() });
  } catch (errore) { next(errore); }
});

// POST /api/v1/admin/allenamenti/unisci — { ids }: merged into one free workout
router.post('/allenamenti/unisci', async (req, res, next) => {
  try {
    res.json({ successo: true, dati: await unisciAllenamenti(req.body?.ids, req.app.get('io')) });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/admin/allenamenti/:id/controllato — It is fine: it leaves the list
router.patch('/allenamenti/:id/controllato', async (req, res, next) => {
  try {
    await segnaControllato(parseInt(req.params.id));
    res.json({ successo: true });
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
router.post('/novita', valida({ body: schemaCreaNovita }), async (req, res, next) => {
  try {
    const { titolo, sottotitolo, punti, icona, immagine, ctaTesto, ctaRotta, coloreInizio, coloreFine, attiva, ordine } = req.body;
    if (!titolo?.trim()) return res.status(400).json({ successo: false, messaggio: t('adminRoutes.titoloObbligatorio') });
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
router.put('/novita/:id', valida({ body: schemaAggiornaNovita }), async (req, res, next) => {
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

