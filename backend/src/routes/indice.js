// ============================================
// GymMaster — Main Router
// Mounts every API sub-router
// ============================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import autenticazioneRoutes from './autenticazione.routes.js';
import utentiRoutes from './utenti.routes.js';
import chatRoutes from './chat.routes.js';
import assistenteRoutes from './assistente.routes.js';
import schedeRoutes from './schede.routes.js';
import catalogoRoutes from './catalogo.routes.js';
import sessioniRoutes from './sessioni.routes.js';
import statisticheRoutes from './statistiche.routes.js';
import adminRoutes from './admin.routes.js';
import gamificationRoutes from './gamification.routes.js';
import suggerimentiRoutes from './suggerimenti.routes.js';
import ptRoutes from './pt.routes.js';
import botRoutes from './bot.routes.js';
import novitaRoutes from './novita.routes.js';
import misurazioniRoutes from './misurazioni.routes.js';
import pianificazioneRoutes from './pianificazione.routes.js';
import notificheRoutes from './notifiche.routes.js';

const router = Router();

// Reads the version from version.json once at startup (with a fallback)
const VERSIONE_APP = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const versionPath = path.resolve(dir, '../../../version.json');
    return JSON.parse(fs.readFileSync(versionPath, 'utf8')).versione || '1.0.0';
  } catch {
    return '1.0.0';
  }
})();

// --- Health Check ---
router.get('/salute', (req, res) => {
  res.json({
    successo: true,
    messaggio: 'GymMaster API funzionante 💪',
    versione: VERSIONE_APP,
    timestamp: new Date().toISOString()
  });
});

// --- Global Banner ---
router.get('/banner', (req, res) => {
  try {
    const bannerPath = path.resolve('prisma/dati/banner.json');
    if (fs.existsSync(bannerPath)) {
      const dati = JSON.parse(fs.readFileSync(bannerPath, 'utf8'));
      res.json({ successo: true, dati });
    } else {
      res.json({ successo: true, dati: { visibile: false, testo: '' } });
    }
  } catch (err) {
    res.status(500).json({ successo: false, messaggio: 'Errore lettura banner' });
  }
});

// --- Mount sub-routers ---
router.use('/auth', autenticazioneRoutes);
router.use('/utenti', utentiRoutes);
router.use('/chat', chatRoutes);
router.use('/assistente', assistenteRoutes);
router.use('/schede', schedeRoutes);
router.use('/', catalogoRoutes);          // /esercizi, /palestre, /attrezzature
router.use('/sessioni', sessioniRoutes);
router.use('/statistiche', statisticheRoutes);
router.use('/admin', adminRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/suggerimenti-esercizi', suggerimentiRoutes);
router.use('/pt', ptRoutes);
router.use('/bot', botRoutes);            // Internal routes for the Telegram bot (X-Bot-Secret)
router.use('/novita', novitaRoutes);      // In-app "what's new" (stories)
router.use('/misurazioni', misurazioniRoutes); // Body composition (time series)
router.use('/pianificazione', pianificazioneRoutes); // Calendar of scheduled workouts
router.use('/notifiche', notificheRoutes);           // In-app notifications

// --- 404 for API routes not found ---
router.use('*', (req, res) => {
  res.status(404).json({
    successo: false,
    codice: 'ROTTA_NON_TROVATA',
    messaggio: `La rotta ${req.method} ${req.originalUrl} non esiste`
  });
});

export default router;
