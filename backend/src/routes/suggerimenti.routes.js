// ============================================
// GymMaster — Exercise Suggestion Routes
// New exercises proposed by users
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { t } from '../i18n/index.js';
import { notificaAdmin } from '../services/notifiche.service.js';

const router = Router();
router.use(verificaToken);

// Longest texts a suggestion can carry (name, groups and equipment / description)
const TESTO_BREVE_MAX = 150;
const DESCRIZIONE_MAX = 2000;

// POST /api/v1/suggerimenti-esercizi — Send a proposal
router.post('/', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaSuggerita, descrizione } = req.body;

    // Every field is text (or missing): numbers, objects and lists are refused,
    // and so is a NUL character, which the database cannot store
    const campi = [nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaSuggerita, descrizione];
    if (campi.some(campo => campo != null && (typeof campo !== 'string' || campo.includes('\u0000')))) {
      return res.status(400).json({
        successo: false,
        messaggio: t('suggerimentiRoutes.campiNonTesto')
      });
    }

    if (!nome?.trim() || !gruppoMuscoloPrimario?.trim()) {
      return res.status(400).json({
        successo: false,
        messaggio: t('suggerimentiRoutes.nomeEGruppoObbligatori')
      });
    }

    if ([nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaSuggerita].some(campo => campo?.trim().length > TESTO_BREVE_MAX)) {
      return res.status(400).json({
        successo: false,
        messaggio: t('suggerimentiRoutes.campiTroppoLunghi', { max: TESTO_BREVE_MAX })
      });
    }
    if (descrizione?.trim().length > DESCRIZIONE_MAX) {
      return res.status(400).json({
        successo: false,
        messaggio: t('suggerimentiRoutes.descrizioneTroppoLunga', { max: DESCRIZIONE_MAX })
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

    // Every admin gets it, in their own language: saved, live and as push
    await notificaAdmin(req.app.get('io'), {
      titolo: 'suggerimentiRoutes.nuovoSuggerimentoTitolo',
      messaggio: 'suggerimentiRoutes.nuovoSuggerimentoMessaggio',
      variabili: { utente: req.utente.nome, esercizio: nome },
      percorso: '/admin/esercizi'
    });

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
