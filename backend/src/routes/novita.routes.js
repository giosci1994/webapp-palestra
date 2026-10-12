// ============================================
// GymMaster — "What's New" Routes (in-app stories)
// For every signed-in user, not only admins.
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { storiaInLingua } from '../utils/novitaRilascio.js';

const router = Router();
router.use(verificaToken);

// GET /api/v1/novita — Active "what's new" items, in order, for the story viewer,
// in the language of the app when the story has it
router.get('/', async (req, res, next) => {
  try {
    const novita = await prisma.novita.findMany({
      where: { attiva: true },
      orderBy: [{ ordine: 'asc' }, { creatoIl: 'desc' }]
    });
    res.json({ successo: true, dati: novita.map(riga => storiaInLingua(riga, req.lingua)) });
  } catch (errore) { next(errore); }
});

export default router;
