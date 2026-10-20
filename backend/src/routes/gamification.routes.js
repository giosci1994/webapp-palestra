// ============================================
// GymMaster — Gamification Routes
// Leaderboard, badges and XP points
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';
import { idNumerico } from '../middleware/validazione.js';
import { t } from '../i18n/index.js';
import { giorniDiFila } from '../utils/date.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.use(verificaToken);

// Badge definitions: the name and description are in the translation files
// (gamificationRoutes.badge.<chiave>) and are translated when the response is built
const BADGE = [
  // --- Sessions ---
  { id: 'primo_allenamento', chiave: 'primaVolta', icona: '🎯', xp: 50, check: (s) => s.sessioni >= 1 },
  { id: 'costante', chiave: 'costante', icona: '📅', xp: 100, check: (s) => s.sessioni >= 10 },
  { id: 'veterano', chiave: 'veterano', icona: '🏅', xp: 300, check: (s) => s.sessioni >= 50 },
  { id: 'centurione', chiave: 'centurione', icona: '💯', xp: 500, check: (s) => s.sessioni >= 100 },
  { id: 'duecento_sessioni', chiave: 'instancabile', icona: '🦾', xp: 800, check: (s) => s.sessioni >= 200 },
  // --- Volume ---
  { id: 'tonnellata', chiave: 'tonnellata', icona: '🏋️', xp: 100, check: (s) => s.volume >= 1000 },
  { id: 'mostro', chiave: 'mostro', icona: '👹', xp: 300, check: (s) => s.volume >= 10000 },
  { id: 'titano', chiave: 'titano', icona: '⚡', xp: 1000, check: (s) => s.volume >= 100000 },
  { id: 'atlas', chiave: 'atlas', icona: '🌍', xp: 2000, check: (s) => s.volume >= 500000 },
  { id: 'volume_millionario', chiave: 'milionario', icona: '💰', xp: 3000, check: (s) => s.volume >= 1000000 },
  // --- Records ---
  { id: 'primo_record', chiave: 'primoRecord', icona: '🎖️', xp: 50, check: (s) => s.record >= 1 },
  { id: 'recordman', chiave: 'recordman', icona: '🏆', xp: 150, check: (s) => s.record >= 5 },
  { id: 'recordman_elite', chiave: 'recordmanElite', icona: '👑', xp: 400, check: (s) => s.record >= 20 },
  // --- Duration ---
  { id: 'maratoneta', chiave: 'maratoneta', icona: '🏃', xp: 200, check: (s) => s.durata >= 600 },
  { id: 'maratoneta_pro', chiave: 'ultraMaratoneta', icona: '🏅', xp: 500, check: (s) => s.durata >= 3000 },
  // --- Plans ---
  { id: 'creatore', chiave: 'creatore', icona: '📋', xp: 100, check: (s) => s.schede >= 3 },
  { id: 'creatore_pro', chiave: 'architect', icona: '🏗️', xp: 300, check: (s) => s.schede >= 10 },
  // --- Social ---
  { id: 'sociale', chiave: 'sociale', icona: '💬', xp: 50, check: (s) => s.messaggi >= 10 },
  { id: 'chatterbox', chiave: 'chatterbox', icona: '🗣️', xp: 150, check: (s) => s.messaggi >= 100 },
  // --- Streak ---
  { id: 'streak_7', chiave: 'settimanaPerfetta', icona: '🔥', xp: 200, check: (s) => s.streak >= 7 },
  { id: 'streak_30', chiave: 'mesePerfetto', icona: '🌟', xp: 500, check: (s) => s.streak >= 30 },
  { id: 'streak_100', chiave: 'centuria', icona: '💎', xp: 1000, check: (s) => s.streak >= 100 },
];

// XP levels
function calcolaLivello(xp) {
  if (xp < 100) return { livello: 1, nome: t('gamificationRoutes.livello.principiante'), prossimo: 100 };
  if (xp < 300) return { livello: 2, nome: t('gamificationRoutes.livello.apprendista'), prossimo: 300 };
  if (xp < 600) return { livello: 3, nome: t('gamificationRoutes.livello.intermedio'), prossimo: 600 };
  if (xp < 1000) return { livello: 4, nome: t('gamificationRoutes.livello.avanzato'), prossimo: 1000 };
  if (xp < 1500) return { livello: 5, nome: t('gamificationRoutes.livello.esperto'), prossimo: 1500 };
  if (xp < 2500) return { livello: 6, nome: t('gamificationRoutes.livello.maestro'), prossimo: 2500 };
  if (xp < 4000) return { livello: 7, nome: t('gamificationRoutes.livello.campione'), prossimo: 4000 };
  if (xp < 6000) return { livello: 8, nome: t('gamificationRoutes.livello.leggenda'), prossimo: 6000 };
  if (xp < 9000) return { livello: 9, nome: t('gamificationRoutes.livello.mito'), prossimo: 9000 };
  if (xp < 13000) return { livello: 10, nome: t('gamificationRoutes.livello.divinita'), prossimo: 13000 };
  if (xp < 18000) return { livello: 11, nome: t('gamificationRoutes.livello.titanoSupremo'), prossimo: 18000 };
  return { livello: 12, nome: t('gamificationRoutes.livello.immortale'), prossimo: null };
}

// GET /api/v1/gamification/profilo — User gamification profile
router.get('/profilo', async (req, res, next) => {
  try {
    const uid = req.utente.id;

    const utenteDb = await prisma.utente.findUnique({ where: { id: uid }, select: { dataResetGamification: true } });
    const resetDate = utenteDb?.dataResetGamification || new Date(0);

    const [sessioni, record, schede, messaggi] = await Promise.all([
      prisma.sessioneAllenamento.findMany({ where: { utenteId: uid, dataFine: { not: null }, dataInizio: { gte: resetDate } }, select: { durataMinuti: true, volumeTotaleKg: true, dataInizio: true } }),
      prisma.recordPersonale.count({ where: { utenteId: uid, dataRecord: { gte: resetDate } } }),
      prisma.schedaAllenamento.count({ where: { creatoreId: uid, creatoIl: { gte: resetDate } } }),
      prisma.messaggio.count({ where: { mittenteId: uid, inviatoIl: { gte: resetDate } } })
    ]);

    const volume = sessioni.reduce((s, x) => s + (x.volumeTotaleKg || 0), 0);
    const durata = sessioni.reduce((s, x) => s + (x.durataMinuti || 0), 0);
    // Consecutive local days with a workout, up to today (the user's time zone)
    const streak = giorniDiFila(sessioni.map(s => s.dataInizio));

    const stats = { sessioni: sessioni.length, volume, durata, record, schede, messaggi, streak };
    const badgeSbloccati = BADGE.filter(b => b.check(stats));
    const xpTotale = badgeSbloccati.reduce((s, b) => s + b.xp, 0);
    const livello = calcolaLivello(xpTotale);

    // Update the XP in the DB
    await prisma.utente.update({ where: { id: uid }, data: { puntiEsperienza: xpTotale } });

    res.json({ successo: true, dati: {
      xp: xpTotale, livello, stats,
      badge: BADGE.map(({ chiave, check, ...b }) => ({
        ...b,
        nome: t(`gamificationRoutes.badge.${chiave}.nome`),
        desc: t(`gamificationRoutes.badge.${chiave}.desc`),
        sbloccato: check(stats)
      })),
      badgeSbloccati: badgeSbloccati.length, badgeTotali: BADGE.length
    }});
  } catch (errore) { next(errore); }
});

// GET /api/v1/gamification/leaderboard — Ranking
router.get('/leaderboard', async (req, res, next) => {
  try {
    const utenti = await prisma.utente.findMany({
      where: { stato: 'ATTIVO', gamificationAttiva: true },
      select: { id: true, nome: true, ruolo: true, puntiEsperienza: true, immagineProfilo: true },
      orderBy: { puntiEsperienza: 'desc' },
      take: 50
    });

    const classifica = utenti.map((u, i) => ({
      posizione: i + 1, ...u, livello: calcolaLivello(u.puntiEsperienza)
    }));

    const posizioneUtente = classifica.findIndex(u => u.id === req.utente.id) + 1;

    res.json({ successo: true, dati: { classifica, posizioneUtente } });
  } catch (errore) { next(errore); }
});

// GET /api/v1/gamification/profilo-pubblico/:id — Public user profile (respects privacy)
router.get('/profilo-pubblico/:id', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const utente = await prisma.utente.findUnique({
      where: { id: targetId },
      select: {
        id: true, nome: true, ruolo: true, stato: true, immagineProfilo: true,
        puntiEsperienza: true, bio: true, dataRegistrazione: true,
        preferenzeVisibilita: true, gamificationAttiva: true,
        // Conditional fields (filtered later)
        palestraId: true, pesoKg: true, altezzaCm: true,
        dataNascita: true, obiettivoFitness: true, genere: true,
        palestra: { select: { nomeCatena: true, citta: true } }
      }
    });

    if (!utente || utente.stato !== 'ATTIVO') {
      return res.status(404).json({ successo: false, messaggio: t('gamificationRoutes.utenteNonTrovato') });
    }

    // Parse privacy
    let vis = { palestra: true, peso: false, altezza: false, eta: false, obiettivo: true, statistiche: false, record: true };
    try { vis = { ...vis, ...JSON.parse(utente.preferenzeVisibilita || '{}') }; } catch {}

    const profilo = {
      id: utente.id,
      nome: utente.nome,
      ruolo: utente.ruolo,
      immagineProfilo: utente.immagineProfilo,
      bio: utente.bio,
      puntiEsperienza: utente.puntiEsperienza,
      livello: calcolaLivello(utente.puntiEsperienza),
      dataRegistrazione: utente.dataRegistrazione,
      // Privacy-dependent fields
      ...(vis.palestra && utente.palestra && { palestra: utente.palestra }),
      ...(vis.peso && utente.pesoKg && { pesoKg: utente.pesoKg }),
      ...(vis.altezza && utente.altezzaCm && { altezzaCm: utente.altezzaCm }),
      ...(vis.eta && utente.dataNascita && { dataNascita: utente.dataNascita }),
      ...(vis.obiettivo && utente.obiettivoFitness && { obiettivoFitness: utente.obiettivoFitness }),
    };

    // Workout statistics (if shared)
    if (vis.statistiche) {
      const sessioni = await prisma.sessioneAllenamento.findMany({
        where: { utenteId: targetId, dataFine: { not: null } },
        select: { durataMinuti: true, volumeTotaleKg: true }
      });
      profilo.statistiche = {
        sessioni: sessioni.length,
        volume: Math.round(sessioni.reduce((s, x) => s + (x.volumeTotaleKg || 0), 0)),
        durata: sessioni.reduce((s, x) => s + (x.durataMinuti || 0), 0)
      };
    }

    // Global plans created
    const schedeGlobali = await prisma.schedaAllenamento.findMany({
      where: { creatoreId: targetId, visibilita: 'GLOBALE' },
      select: { id: true, titolo: true, livello: true, creatoIl: true,
        _count: { select: { esercizi: true } } },
      orderBy: { creatoIl: 'desc' },
      take: 10
    });
    profilo.schedeGlobali = schedeGlobali;

    // Personal records (if shared)
    if (vis.record) {
      const records = await prisma.recordPersonale.findMany({
        where: { utenteId: targetId },
        include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
        orderBy: { pesoMaxRaggiunto: 'desc' },
        take: 15
      });
      profilo.record = records;
    }

    res.json({ successo: true, dati: profilo });
  } catch (errore) { next(errore); }
});

// GET /api/v1/gamification/classifica-record — Top 3 per exercise (max weight)
router.get('/classifica-record', async (req, res, next) => {
  try {
    // Get every record of active users with gamification on
    const records = await prisma.recordPersonale.findMany({
      where: {
        utente: { stato: 'ATTIVO', gamificationAttiva: true }
      },
      include: {
        esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } },
        utente: { select: { id: true, nome: true, immagineProfilo: true } }
      },
      orderBy: { pesoMaxRaggiunto: 'desc' }
    });

    // Group by exercise, take the top 3
    const perEsercizio = {};
    for (const r of records) {
      const eid = r.esercizioId;
      if (!perEsercizio[eid]) {
        perEsercizio[eid] = {
          esercizio: r.esercizio,
          top: []
        };
      }
      // Avoid duplicates of the same user (take only the best record)
      if (perEsercizio[eid].top.length < 3 && !perEsercizio[eid].top.find(voce => voce.utente.id === r.utenteId)) {
        perEsercizio[eid].top.push({
          utente: r.utente,
          pesoMax: r.pesoMaxRaggiunto,
          data: r.dataRecord
        });
      }
    }

    // Sort exercises by the size of their podium (up to 3), then by the best weight
    const classifica = Object.values(perEsercizio)
      .sort((a, b) => b.top.length - a.top.length || b.top[0]?.pesoMax - a.top[0]?.pesoMax);

    res.json({ successo: true, dati: classifica });
  } catch (errore) { next(errore); }
});

export default router;
