// ============================================
// GymMaster — Routes Gamification
// Leaderboard, badge e punti XP
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import prisma from '../config/database.js';

const router = Router();
router.use(verificaToken);

// Badge definitions
const BADGE = [
  // --- Sessioni ---
  { id: 'primo_allenamento', nome: 'Prima Volta', icona: '🎯', desc: 'Completa il primo allenamento', xp: 50, check: (s) => s.sessioni >= 1 },
  { id: 'costante', nome: 'Costante', icona: '📅', desc: '10 sessioni completate', xp: 100, check: (s) => s.sessioni >= 10 },
  { id: 'veterano', nome: 'Veterano', icona: '🏅', desc: '50 sessioni completate', xp: 300, check: (s) => s.sessioni >= 50 },
  { id: 'centurione', nome: 'Centurione', icona: '💯', desc: '100 sessioni completate', xp: 500, check: (s) => s.sessioni >= 100 },
  { id: 'duecento_sessioni', nome: 'Instancabile', icona: '🦾', desc: '200 sessioni completate', xp: 800, check: (s) => s.sessioni >= 200 },
  // --- Volume ---
  { id: 'tonnellata', nome: 'Tonnellata', icona: '🏋️', desc: '1.000 kg di volume totale', xp: 100, check: (s) => s.volume >= 1000 },
  { id: 'mostro', nome: 'Mostro', icona: '👹', desc: '10.000 kg di volume totale', xp: 300, check: (s) => s.volume >= 10000 },
  { id: 'titano', nome: 'Titano', icona: '⚡', desc: '100.000 kg di volume totale', xp: 1000, check: (s) => s.volume >= 100000 },
  { id: 'atlas', nome: 'Atlas', icona: '🌍', desc: '500.000 kg di volume totale', xp: 2000, check: (s) => s.volume >= 500000 },
  { id: 'volume_millionario', nome: 'Milionario', icona: '💰', desc: '1.000.000 kg di volume totale', xp: 3000, check: (s) => s.volume >= 1000000 },
  // --- Record ---
  { id: 'primo_record', nome: 'Primo Record', icona: '🎖️', desc: 'Stabilisci il primo record personale', xp: 50, check: (s) => s.record >= 1 },
  { id: 'recordman', nome: 'Recordman', icona: '🏆', desc: 'Stabilisci 5 record personali', xp: 150, check: (s) => s.record >= 5 },
  { id: 'recordman_elite', nome: 'Recordman Elite', icona: '👑', desc: '20 record personali', xp: 400, check: (s) => s.record >= 20 },
  // --- Durata ---
  { id: 'maratoneta', nome: 'Maratoneta', icona: '🏃', desc: '10 ore di allenamento totali', xp: 200, check: (s) => s.durata >= 600 },
  { id: 'maratoneta_pro', nome: 'Ultra Maratoneta', icona: '🏅', desc: '50 ore di allenamento totali', xp: 500, check: (s) => s.durata >= 3000 },
  // --- Schede ---
  { id: 'creatore', nome: 'Creatore', icona: '📋', desc: 'Crea 3 schede di allenamento', xp: 100, check: (s) => s.schede >= 3 },
  { id: 'creatore_pro', nome: 'Architect', icona: '🏗️', desc: 'Crea 10 schede di allenamento', xp: 300, check: (s) => s.schede >= 10 },
  // --- Social ---
  { id: 'sociale', nome: 'Sociale', icona: '💬', desc: 'Invia 10 messaggi in chat', xp: 50, check: (s) => s.messaggi >= 10 },
  { id: 'chatterbox', nome: 'Chatterbox', icona: '🗣️', desc: 'Invia 100 messaggi in chat', xp: 150, check: (s) => s.messaggi >= 100 },
  // --- Streak ---
  { id: 'streak_7', nome: 'Settimana Perfetta', icona: '🔥', desc: '7 giorni di streak', xp: 200, check: (s) => s.streak >= 7 },
  { id: 'streak_30', nome: 'Mese Perfetto', icona: '🌟', desc: '30 giorni di streak', xp: 500, check: (s) => s.streak >= 30 },
  { id: 'streak_100', nome: 'Centuria', icona: '💎', desc: '100 giorni di streak', xp: 1000, check: (s) => s.streak >= 100 },
];

// Livelli XP
function calcolaLivello(xp) {
  if (xp < 100) return { livello: 1, nome: 'Principiante', prossimo: 100 };
  if (xp < 300) return { livello: 2, nome: 'Apprendista', prossimo: 300 };
  if (xp < 600) return { livello: 3, nome: 'Intermedio', prossimo: 600 };
  if (xp < 1000) return { livello: 4, nome: 'Avanzato', prossimo: 1000 };
  if (xp < 1500) return { livello: 5, nome: 'Esperto', prossimo: 1500 };
  if (xp < 2500) return { livello: 6, nome: 'Maestro', prossimo: 2500 };
  if (xp < 4000) return { livello: 7, nome: 'Campione', prossimo: 4000 };
  if (xp < 6000) return { livello: 8, nome: 'Leggenda', prossimo: 6000 };
  if (xp < 9000) return { livello: 9, nome: 'Mito', prossimo: 9000 };
  if (xp < 13000) return { livello: 10, nome: 'Divinità', prossimo: 13000 };
  if (xp < 18000) return { livello: 11, nome: 'Titano Supremo', prossimo: 18000 };
  return { livello: 12, nome: 'Immortale', prossimo: null };
}

// GET /api/v1/gamification/profilo — Profilo gamification utente
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
    const giorniSet = new Set(sessioni.map(s => s.dataInizio.toISOString().split('T')[0]));
    const giorniOrd = [...giorniSet].sort().reverse();
    let streak = 0;
    for (let i = 0; i < giorniOrd.length; i++) {
      const atteso = new Date(); atteso.setDate(atteso.getDate() - i);
      if (giorniOrd[i] === atteso.toISOString().split('T')[0]) streak++; else break;
    }

    const stats = { sessioni: sessioni.length, volume, durata, record, schede, messaggi, streak };
    const badgeSbloccati = BADGE.filter(b => b.check(stats));
    const xpTotale = badgeSbloccati.reduce((s, b) => s + b.xp, 0);
    const livello = calcolaLivello(xpTotale);

    // Aggiorna XP nel DB
    await prisma.utente.update({ where: { id: uid }, data: { puntiEsperienza: xpTotale } });

    res.json({ successo: true, dati: {
      xp: xpTotale, livello, stats,
      badge: BADGE.map(b => ({ ...b, sbloccato: b.check(stats), check: undefined })),
      badgeSbloccati: badgeSbloccati.length, badgeTotali: BADGE.length
    }});
  } catch (errore) { next(errore); }
});

// GET /api/v1/gamification/leaderboard — Classifica
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

// GET /api/v1/gamification/profilo-pubblico/:id — Profilo pubblico utente (rispetta privacy)
router.get('/profilo-pubblico/:id', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const utente = await prisma.utente.findUnique({
      where: { id: targetId },
      select: {
        id: true, nome: true, ruolo: true, stato: true, immagineProfilo: true,
        puntiEsperienza: true, bio: true, dataRegistrazione: true,
        preferenzeVisibilita: true, gamificationAttiva: true,
        // Campi condizionali (filtrati dopo)
        palestraId: true, pesoKg: true, altezzaCm: true,
        dataNascita: true, obiettivoFitness: true, genere: true,
        palestra: { select: { nomeCatena: true, citta: true } }
      }
    });

    if (!utente || utente.stato !== 'ATTIVO') {
      return res.status(404).json({ successo: false, messaggio: 'Utente non trovato' });
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
      // Campi condizionali privacy
      ...(vis.palestra && utente.palestra && { palestra: utente.palestra }),
      ...(vis.peso && utente.pesoKg && { pesoKg: utente.pesoKg }),
      ...(vis.altezza && utente.altezzaCm && { altezzaCm: utente.altezzaCm }),
      ...(vis.eta && utente.dataNascita && { dataNascita: utente.dataNascita }),
      ...(vis.obiettivo && utente.obiettivoFitness && { obiettivoFitness: utente.obiettivoFitness }),
    };

    // Statistiche allenamento (se condivise)
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

    // Schede globali create
    const schedeGlobali = await prisma.schedaAllenamento.findMany({
      where: { creatoreId: targetId, visibilita: 'GLOBALE' },
      select: { id: true, titolo: true, livello: true, creatoIl: true,
        _count: { select: { esercizi: true } } },
      orderBy: { creatoIl: 'desc' },
      take: 10
    });
    profilo.schedeGlobali = schedeGlobali;

    // Record personali (se condivisi)
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

// GET /api/v1/gamification/classifica-record — Top 3 per esercizio (peso max)
router.get('/classifica-record', async (req, res, next) => {
  try {
    // Prendi tutti i record di utenti attivi con gamification attiva
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

    // Raggruppa per esercizio, prendi top 3
    const perEsercizio = {};
    for (const r of records) {
      const eid = r.esercizioId;
      if (!perEsercizio[eid]) {
        perEsercizio[eid] = {
          esercizio: r.esercizio,
          top: []
        };
      }
      // Evita duplicati stesso utente (prendi solo il miglior record)
      if (perEsercizio[eid].top.length < 3 && !perEsercizio[eid].top.find(t => t.utente.id === r.utenteId)) {
        perEsercizio[eid].top.push({
          utente: r.utente,
          pesoMax: r.pesoMaxRaggiunto,
          data: r.dataRecord
        });
      }
    }

    // Ordina esercizi per numero di partecipanti (più popolari prima)
    const classifica = Object.values(perEsercizio)
      .sort((a, b) => b.top.length - a.top.length || b.top[0]?.pesoMax - a.top[0]?.pesoMax);

    res.json({ successo: true, dati: classifica });
  } catch (errore) { next(errore); }
});

export default router;
