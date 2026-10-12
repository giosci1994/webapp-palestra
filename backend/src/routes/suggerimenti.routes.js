// ============================================
// GymMaster — Exercise Suggestion Routes
// New exercises proposed by users
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { t, linguaDiUtente } from '../i18n/index.js';

const router = Router();
router.use(verificaToken);

// POST /api/v1/suggerimenti-esercizi — Send a proposal
router.post('/', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaSuggerita, descrizione } = req.body;

    if (!nome?.trim() || !gruppoMuscoloPrimario?.trim()) {
      return res.status(400).json({
        successo: false,
        messaggio: t('suggerimentiRoutes.nomeEGruppoObbligatori')
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

    // Notify the connected admins via Socket.io
    const io = req.app.get('io');
    if (io) {
      // Find every admin
      const admins = await prisma.utente.findMany({
        where: { ruolo: 'SUPERADMIN', stato: 'ATTIVO' },
        select: { id: true, lingua: true, linguaApp: true }
      });

      // Each admin gets the text in their own language, not the requester's
      for (const admin of admins) {
        const lingua = linguaDiUtente(admin);
        io.to(`utente:${admin.id}`).emit('notifica:nuova', {
          tipo: 'suggerimento_esercizio',
          titolo: t('suggerimentiRoutes.nuovoSuggerimentoTitolo', {}, lingua),
          messaggio: t('suggerimentiRoutes.nuovoSuggerimentoMessaggio', { utente: req.utente.nome, esercizio: nome }, lingua),
          dati: { suggerimentoId: suggerimento.id },
          timestamp: new Date().toISOString()
        });
      }
    }

    res.status(201).json({
      successo: true,
      messaggio: t('suggerimentiRoutes.suggerimentoInviato'),
      dati: suggerimento
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/suggerimenti-esercizi — List of your own proposals
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
