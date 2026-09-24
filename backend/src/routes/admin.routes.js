// ============================================
// GymMaster — Routes Admin (Palestre + Esercizi)
// CRUD completo per SuperAdmin
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

const router = Router();
router.use(verificaToken);
router.use(autorizza('SUPERADMIN'));

// PUT /api/v1/admin/utenti/:id/reset-password — Genera una password temporanea casuale
router.put('/utenti/:id/reset-password', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) return res.status(400).json({ successo: false, messaggio: 'ID non valido' });
    // Password temporanea casuale (l'admin la comunica all'utente, che poi la cambia)
    const passwordTemporanea = crypto.randomBytes(9).toString('base64url'); // ~12 caratteri
    const hash = await argon2.hash(passwordTemporanea);
    await prisma.utente.update({
      where: { id: targetId },
      data: { passwordHash: hash }
    });
    logger.warn({ adminId: req.utente.id, targetId }, 'Admin ha resettato la password di un utente');
    res.json({ successo: true, messaggio: 'Password resettata', dati: { passwordTemporanea } });
  } catch (errore) { next(errore); }
});

// ============================
// PALESTRE
// ============================

// POST /api/v1/admin/palestre — Crea palestra
router.post('/palestre', async (req, res, next) => {
  try {
    const { nomeCatena, citta, indirizzo, nazione, googlePlaceId } = req.body;
    const palestra = await prisma.palestra.create({
      data: { nomeCatena, citta, indirizzo, nazione: nazione || 'Italia', googlePlaceId: googlePlaceId || null }
    });
    res.status(201).json({ successo: true, dati: palestra });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/palestre/:id — Aggiorna palestra
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

// DELETE /api/v1/admin/palestre/:id — Elimina palestra
router.delete('/palestre/:id', async (req, res, next) => {
  try {
    await prisma.palestra.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: 'Palestra eliminata' });
  } catch (errore) { next(errore); }
});

// ============================
// ESERCIZI
// ============================

// POST /api/v1/admin/esercizi — Crea esercizio
router.post('/esercizi', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaRichiestaId, descrizione, linkVideo,
            difficulty, bodyRegion, mechanics, posture, movementPattern, laterality, forceType, classification } = req.body;
    const esercizio = await prisma.esercizio.create({
      data: {
        nome,
        gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: gruppoMuscoloSecondario || null,
        attrezzaturaRichiestaId: attrezzaturaRichiestaId ? parseInt(attrezzaturaRichiestaId) : null,
        descrizione: descrizione || null,
        linkVideo: linkVideo || null,
        difficulty: difficulty || null,
        bodyRegion: bodyRegion || null,
        mechanics: mechanics || null,
        posture: posture || null,
        movementPattern: movementPattern || null,
        laterality: laterality || null,
        forceType: forceType || null,
        classification: classification || null,
      },
      include: { attrezzatura: { select: { id: true, nome: true } } }
    });
    res.status(201).json({ successo: true, dati: esercizio });
  } catch (errore) { next(errore); }
});

// PUT /api/v1/admin/esercizi/:id — Aggiorna esercizio
router.put('/esercizi/:id', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaRichiestaId, descrizione, linkVideo,
            difficulty, bodyRegion, mechanics, posture, movementPattern, laterality, forceType, classification } = req.body;
    const esercizio = await prisma.esercizio.update({
      where: { id: parseInt(req.params.id) },
      data: {
        nome,
        gruppoMuscoloPrimario,
        gruppoMuscoloSecondario,
        attrezzaturaRichiestaId: attrezzaturaRichiestaId ? parseInt(attrezzaturaRichiestaId) : null,
        descrizione,
        linkVideo,
        difficulty: difficulty || null,
        bodyRegion: bodyRegion || null,
        mechanics: mechanics || null,
        posture: posture || null,
        movementPattern: movementPattern || null,
        laterality: laterality || null,
        forceType: forceType || null,
        classification: classification || null,
      },
      include: { attrezzatura: { select: { id: true, nome: true } } }
    });
    res.json({ successo: true, dati: esercizio });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/admin/esercizi/:id — Elimina esercizio
router.delete('/esercizi/:id', async (req, res, next) => {
  try {
    await prisma.esercizio.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: 'Esercizio eliminato' });
  } catch (errore) { next(errore); }
});

// ============================
// ATTREZZATURE
// ============================

// POST /api/v1/admin/attrezzature — Crea attrezzatura
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
// SUGGERIMENTI ESERCIZI
// ============================

// GET /api/v1/admin/suggerimenti — Lista tutti i suggerimenti
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

// GET /api/v1/admin/suggerimenti/conteggio — Conteggio suggerimenti pendenti
router.get('/suggerimenti/conteggio', async (req, res, next) => {
  try {
    const conteggio = await prisma.suggerimentoEsercizio.count({
      where: { stato: 'IN_ATTESA' }
    });
    res.json({ successo: true, dati: { pendenti: conteggio } });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/admin/suggerimenti/:id/approva — Approva e crea esercizio
router.patch('/suggerimenti/:id/approva', async (req, res, next) => {
  try {
    const suggerimentoId = parseInt(req.params.id);
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaRichiestaId, descrizione, linkVideo } = req.body;

    // Trova il suggerimento
    const suggerimento = await prisma.suggerimentoEsercizio.findUnique({
      where: { id: suggerimentoId },
      include: { utente: { select: { id: true, nome: true } } }
    });

    if (!suggerimento) {
      return res.status(404).json({ successo: false, messaggio: 'Suggerimento non trovato' });
    }

    if (suggerimento.stato !== 'IN_ATTESA') {
      return res.status(400).json({ successo: false, messaggio: 'Suggerimento già gestito' });
    }

    // Crea l'esercizio reale (usa i campi modificati dall'admin o quelli originali)
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

    // Aggiorna il suggerimento come approvato
    await prisma.suggerimentoEsercizio.update({
      where: { id: suggerimentoId },
      data: {
        stato: 'APPROVATO',
        esercizioCreato: esercizio.id,
        gestitoIl: new Date()
      }
    });

    // Notifica l'utente che ha suggerito
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${suggerimento.utenteId}`).emit('notifica:nuova', {
        tipo: 'suggerimento_approvato',
        titolo: 'Esercizio approvato! 🎉',
        messaggio: `Il tuo suggerimento "${suggerimento.nome}" è stato aggiunto al catalogo!`,
        dati: { esercizioId: esercizio.id },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      successo: true,
      messaggio: 'Suggerimento approvato ed esercizio creato',
      dati: esercizio
    });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/admin/suggerimenti/:id/rifiuta — Rifiuta suggerimento
router.patch('/suggerimenti/:id/rifiuta', async (req, res, next) => {
  try {
    const suggerimentoId = parseInt(req.params.id);
    const { motivoRifiuto } = req.body;

    const suggerimento = await prisma.suggerimentoEsercizio.findUnique({
      where: { id: suggerimentoId },
      include: { utente: { select: { id: true, nome: true } } }
    });

    if (!suggerimento) {
      return res.status(404).json({ successo: false, messaggio: 'Suggerimento non trovato' });
    }

    if (suggerimento.stato !== 'IN_ATTESA') {
      return res.status(400).json({ successo: false, messaggio: 'Suggerimento già gestito' });
    }

    await prisma.suggerimentoEsercizio.update({
      where: { id: suggerimentoId },
      data: {
        stato: 'RIFIUTATO',
        motivoRifiuto: motivoRifiuto || null,
        gestitoIl: new Date()
      }
    });

    // Notifica l'utente
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${suggerimento.utenteId}`).emit('notifica:nuova', {
        tipo: 'suggerimento_rifiutato',
        titolo: 'Suggerimento non approvato',
        messaggio: motivoRifiuto
          ? `"${suggerimento.nome}" non è stato approvato: ${motivoRifiuto}`
          : `"${suggerimento.nome}" non è stato approvato.`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ successo: true, messaggio: 'Suggerimento rifiutato' });
  } catch (errore) { next(errore); }
});

// ============================
// BANNER GLOBALE
// ============================

// PUT /api/v1/admin/banner — Modifica banner
router.put('/banner', async (req, res, next) => {
  try {
    const { visibile, testo } = req.body;
    const bannerPath = path.resolve('prisma/dati/banner.json');
    const dati = { visibile: !!visibile, testo: testo || '' };
    fs.writeFileSync(bannerPath, JSON.stringify(dati, null, 2), 'utf8');
    
    // Notifica opzionale per aggiornamento real-time (opzionale)
    const io = req.app.get('io');
    if (io) {
      io.emit('notifica:banner_aggiornato', dati);
    }
    
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// ============================
// NOVITÀ (storie in-app)
// ============================

function normalizzaPunti(punti) {
  if (punti === undefined) return undefined;
  if (!punti) return null;
  return typeof punti === 'string' ? punti : JSON.stringify(punti);
}

// GET /api/v1/admin/novita — tutte (anche disattivate)
router.get('/novita', async (req, res, next) => {
  try {
    const novita = await prisma.novita.findMany({ orderBy: [{ ordine: 'asc' }, { creatoIl: 'desc' }] });
    res.json({ successo: true, dati: novita });
  } catch (errore) { next(errore); }
});

// POST /api/v1/admin/novita — crea
router.post('/novita', async (req, res, next) => {
  try {
    const { titolo, sottotitolo, punti, icona, immagine, ctaTesto, ctaRotta, coloreInizio, coloreFine, attiva, ordine } = req.body;
    if (!titolo) return res.status(400).json({ successo: false, messaggio: 'Titolo obbligatorio' });
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

// PUT /api/v1/admin/novita/:id — aggiorna
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

// DELETE /api/v1/admin/novita/:id — elimina
router.delete('/novita/:id', async (req, res, next) => {
  try {
    await prisma.novita.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ successo: true, messaggio: 'Novità eliminata' });
  } catch (errore) { next(errore); }
});

export default router;

