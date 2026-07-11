// ============================================
// GymMaster — Routes Novità (storie in-app)
// Endpoint pubblico per l'app autenticata.
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

// GET /api/v1/novita — Novità attive, in ordine, per il visore storie
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
