// ============================================
// GymMaster — Routes Suggerimenti Esercizi
// Proposte di nuovi esercizi dagli utenti
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

// POST /api/v1/suggerimenti-esercizi — Invia una proposta
router.post('/', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaSuggerita, descrizione } = req.body;

    if (!nome?.trim() || !gruppoMuscoloPrimario?.trim()) {
      return res.status(400).json({
        successo: false,
        messaggio: 'Nome e gruppo muscolare primario sono obbligatori'
      });
    }

    const suggerimento = await prisma.suggerimentoEsercizio.create({
      data: {
        utenteId: req.utente.id,
        nome: nome.trim(),
        gruppoMuscoloPrimario: gruppoMuscoloPrimario.trim(),
        gruppoMuscoloSecondario: gruppoMuscoloSecondario?.trim() || null,
        attrezzaturaSuggerita: attrezzaturaSuggerita?.trim() || null,
        descrizione: descrizione?.trim() || null
      },
      include: {
        utente: { select: { id: true, nome: true } }
      }
    });

    // Notifica gli admin connessi via Socket.io
    const io = req.app.get('io');
    if (io) {
      // Trova tutti gli admin
      const admins = await prisma.utente.findMany({
        where: { ruolo: 'SUPERADMIN', stato: 'ATTIVO' },
        select: { id: true }
      });

      for (const admin of admins) {
        io.to(`utente:${admin.id}`).emit('notifica:nuova', {
          tipo: 'suggerimento_esercizio',
          titolo: 'Nuovo suggerimento esercizio',
          messaggio: `${req.utente.nome} ha suggerito: "${nome}"`,
          dati: { suggerimentoId: suggerimento.id },
          timestamp: new Date().toISOString()
        });
      }
    }

    res.status(201).json({
      successo: true,
      messaggio: 'Suggerimento inviato con successo! L\'amministratore lo esaminerà.',
      dati: suggerimento
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/suggerimenti-esercizi — Lista delle proprie proposte
router.get('/', async (req, res, next) => {
  try {
    const suggerimenti = await prisma.suggerimentoEsercizio.findMany({
      where: { utenteId: req.utente.id },
      orderBy: { creatoIl: 'desc' },
      include: {
        esercizio: { select: { id: true, nome: true, nomeIt: true } }
      }
    });

    res.json({ successo: true, dati: suggerimenti });
  } catch (errore) { next(errore); }
});

export default router;
