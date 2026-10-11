// ============================================
// GymMaster — "What's New" Routes (in-app stories)
// For every signed-in user, not only admins.
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

// GET /api/v1/novita — Active "what's new" items, in order, for the story viewer
router.get('/', async (req, res, next) => {
  try {
    const novita = await prisma.novita.findMany({
      where: { attiva: true },
      orderBy: [{ ordine: 'asc' }, { creatoIl: 'desc' }]
    });
    res.json({ successo: true, dati: novita });
  } catch (errore) { next(errore); }
});

export default router;
