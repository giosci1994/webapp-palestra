// ============================================
// GymMaster — Routes Utenti
// /api/v1/utenti/*
// ============================================

import { Router } from 'express';
import { listaUtenti, profilo, approva, banna, cambiaRuolo, elimina, aggiornaProfilo, cambiaPassword, infoApp } from '../controllers/utenti.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { autorizza } from '../middleware/autorizzazione.js';

const router = Router();

// Tutte le rotte richiedono autenticazione
router.use(verificaToken);

// GET /api/v1/utenti/profilo — Profilo dell'utente corrente
router.get('/profilo', profilo);

// PATCH /api/v1/utenti/profilo — Aggiorna profilo
router.patch('/profilo', aggiornaProfilo);

// POST /api/v1/utenti/cambia-password — Cambia password
router.post('/cambia-password', cambiaPassword);

// GET /api/v1/utenti/info-app — Info tecniche dell'applicazione
router.get('/info-app', infoApp);

// GET /api/v1/utenti/cerca?q=nome — Cerca utenti per nome
router.get('/cerca', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ successo: true, dati: [] });
    }
    const { default: prisma } = await import('../config/database.js');
    const utenti = await prisma.utente.findMany({
      where: {
        stato: 'ATTIVO',
        id: { not: req.utente.id },
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { id: true, nome: true, ruolo: true },
      take: 10
    });
    res.json({ successo: true, dati: utenti });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/utenti/account — Elimina definitivamente il proprio account
// Richiede la password: e' irreversibile, e un token rubato o una sessione
// lasciata aperta non devono poter cancellare l'account di qualcuno.
router.delete('/account', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const { default: argon2 } = await import('argon2');
    const { ErroreValidazione, ErroreNonTrovato, ErroreNonAutorizzato } = await import('../utils/errori.js');
    const { eliminaAccount } = await import('../services/eliminazioneAccount.service.js');

    const { password, conferma } = req.body || {};

    if (conferma !== 'ELIMINA') {
      throw new ErroreValidazione('Conferma mancante');
    }
    if (!password || typeof password !== 'string') {
      throw new ErroreValidazione('Password richiesta per confermare l\'eliminazione');
    }

    const utente = await prisma.utente.findUnique({
      where: { id: req.utente.id },
      select: { id: true, passwordHash: true, ruolo: true }
    });
    if (!utente) throw new ErroreNonTrovato('Utente');

    if (!await argon2.verify(utente.passwordHash, password)) {
      throw new ErroreNonAutorizzato('Password non corretta');
    }

    // L'ultimo amministratore non puo' sparire: resterebbe un'installazione
    // senza nessuno in grado di amministrarla.
    if (utente.ruolo === 'SUPERADMIN') {
      const altri = await prisma.utente.count({ where: { ruolo: 'SUPERADMIN', id: { not: utente.id } } });
      if (altri === 0) {
        throw new ErroreNonAutorizzato('Sei l\'unico amministratore: nominane un altro prima di eliminare l\'account');
      }
    }

    const riepilogo = await eliminaAccount(utente.id);

    // Senza rimuovere il cookie il browser continuerebbe a tentare di rinnovare
    // la sessione di un utente che non esiste piu'.
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ successo: true, messaggio: 'Account eliminato definitivamente', dati: riepilogo });
  } catch (errore) { next(errore); }
});

// POST /api/v1/utenti/reset-statistiche
router.post('/reset-statistiche', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    await prisma.utente.update({
      where: { id: req.utente.id },
      data: { dataResetStatistiche: new Date() }
    });
    res.json({ successo: true, messaggio: 'Statistiche azzerate con successo' });
  } catch (errore) { next(errore); }
});

// POST /api/v1/utenti/reset-gamification
router.post('/reset-gamification', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    await prisma.utente.update({
      where: { id: req.utente.id },
      data: { dataResetGamification: new Date(), puntiEsperienza: 0 }
    });
    res.json({ successo: true, messaggio: 'Progressi gamification azzerati con successo' });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/utenti/completa-profilo — Wizard onboarding
router.patch('/completa-profilo', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const {
      tipoAccount, immagineProfilo, dataNascita, genere,
      pesoKg, altezzaCm, obiettivoFitness,
      preferenzeVisibilita, gamificationAttiva,
      accettaToS, accettaPrivacy,
      bio, specializzazioni, anniEsperienza, certificazioni, contattoPubblico, tariffaIndicativa
    } = req.body;

    const datiAggiornamento = {
      profiloCompletato: true,
      ...(immagineProfilo !== undefined && { immagineProfilo }),
      ...(dataNascita && { dataNascita: new Date(dataNascita) }),
      ...(genere && { genere }),
      ...(pesoKg && { pesoKg: parseFloat(pesoKg) }),
      ...(altezzaCm && { altezzaCm: parseInt(altezzaCm) }),
      ...(obiettivoFitness && { obiettivoFitness }),
      ...(preferenzeVisibilita && { preferenzeVisibilita: JSON.stringify(preferenzeVisibilita) }),
      ...(gamificationAttiva !== undefined && { gamificationAttiva }),
      ...(accettaToS && { accettazioneToS: new Date() }),
      ...(accettaPrivacy && { accettazionePrivacy: new Date() }),
      // Profilo professionale (onboarding PT)
      ...(bio !== undefined && { bio }),
      ...(specializzazioni !== undefined && { specializzazioni: Array.isArray(specializzazioni) ? JSON.stringify(specializzazioni) : specializzazioni }),
      ...(anniEsperienza !== undefined && anniEsperienza !== '' && anniEsperienza !== null && { anniEsperienza: parseInt(anniEsperienza) || null }),
      ...(certificazioni !== undefined && { certificazioni }),
      ...(contattoPubblico !== undefined && { contattoPubblico }),
      ...(tariffaIndicativa !== undefined && { tariffaIndicativa }),
    };

    // Gestione richiesta ruolo PT
    if (tipoAccount === 'PERSONAL_TRAINER' && req.utente.ruolo === 'UTENTE') {
      datiAggiornamento.ruoloRichiesto = 'PERSONAL_TRAINER';
      // Notifica admin via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.emit('notifica:admin', {
          tipo: 'richiesta_ruolo',
          titolo: 'Richiesta ruolo Personal Trainer',
          messaggio: `${req.utente.nome} ha richiesto il ruolo di Personal Trainer.`,
          utenteId: req.utente.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    const utenteAggiornato = await prisma.utente.update({
      where: { id: req.utente.id },
      data: datiAggiornamento,
      select: {
        id: true, nome: true, email: true, ruolo: true, stato: true,
        immagineProfilo: true, dataNascita: true, genere: true,
        pesoKg: true, altezzaCm: true, obiettivoFitness: true,
        preferenzeVisibilita: true, profiloCompletato: true,
        gamificationAttiva: true, ruoloRichiesto: true,
        palestraId: true, puntiEsperienza: true
      }
    });

    res.json({ successo: true, dati: utenteAggiornato });
  } catch (errore) { next(errore); }
});

// ============================
// COLLEGAMENTO BOT TELEGRAM
// ============================

// POST /api/v1/utenti/telegram/genera-codice — Genera codice/deep-link di collegamento
router.post('/telegram/genera-codice', async (req, res, next) => {
  try {
    const { generaCodiceCollegamento } = await import('../services/bot.service.js');
    const dati = await generaCodiceCollegamento(req.utente.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/telegram/stato — Stato del collegamento
router.get('/telegram/stato', async (req, res, next) => {
  try {
    const { statoCollegamento } = await import('../services/bot.service.js');
    const dati = await statoCollegamento(req.utente.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/utenti/telegram — Scollega il bot
router.delete('/telegram', async (req, res, next) => {
  try {
    const { scollegaTelegram } = await import('../services/bot.service.js');
    await scollegaTelegram(req.utente.id);
    res.json({ successo: true, messaggio: 'Telegram scollegato' });
  } catch (errore) { next(errore); }
});

// ============================
// ISCRIZIONE PERSONAL TRAINER
// ============================

// GET /api/v1/utenti/personal-trainers — Lista PT disponibili
router.get('/personal-trainers', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const trainers = await prisma.utente.findMany({
      where: { ruolo: 'PERSONAL_TRAINER', stato: 'ATTIVO' },
      select: {
        id: true, nome: true, immagineProfilo: true, bio: true,
        obiettivoFitness: true, dataRegistrazione: true, specializzazioni: true,
        _count: {
          select: {
            clientiComePT: { where: { stato: 'ATTIVA' } },
            schedeCreate: true
          }
        }
      }
    });
    res.json({ successo: true, dati: trainers });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/personal-trainers/:id — Profilo pubblico di un PT + sue schede globali
router.get('/personal-trainers/:id', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ successo: false, messaggio: 'ID non valido' });

    const pt = await prisma.utente.findFirst({
      where: { id, ruolo: 'PERSONAL_TRAINER', stato: 'ATTIVO' },
      select: {
        id: true, nome: true, immagineProfilo: true, bio: true,
        obiettivoFitness: true, dataRegistrazione: true,
        specializzazioni: true, anniEsperienza: true, certificazioni: true,
        contattoPubblico: true, tariffaIndicativa: true,
        palestra: { select: { nomeCatena: true, citta: true } },
        _count: {
          select: {
            clientiComePT: { where: { stato: 'ATTIVA' } },
            schedeCreate: true
          }
        }
      }
    });
    if (!pt) return res.status(404).json({ successo: false, messaggio: 'Personal Trainer non trovato' });

    const schede = await prisma.schedaAllenamento.findMany({
      where: { creatoreId: id, visibilita: 'GLOBALE' },
      select: {
        id: true, titolo: true, livello: true, descrizione: true,
        _count: { select: { esercizi: true, sessioni: true } }
      },
      orderBy: { creatoIl: 'desc' },
      take: 20
    });

    res.json({ successo: true, dati: { ...pt, schede } });
  } catch (errore) { next(errore); }
});

// POST /api/v1/utenti/richiedi-pt — L'utente richiede di diventare Personal Trainer
router.post('/richiedi-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    if (req.utente.ruolo !== 'UTENTE') {
      return res.status(400).json({ successo: false, messaggio: 'Solo gli utenti standard possono richiedere il ruolo PT' });
    }
    await prisma.utente.update({
      where: { id: req.utente.id },
      data: { ruoloRichiesto: 'PERSONAL_TRAINER' }
    });
    const io = req.app.get('io');
    if (io) {
      io.emit('notifica:admin', {
        tipo: 'richiesta_ruolo',
        titolo: 'Richiesta ruolo Personal Trainer',
        messaggio: `${req.utente.nome} ha richiesto il ruolo di Personal Trainer.`,
        utenteId: req.utente.id,
        timestamp: new Date().toISOString()
      });
    }
    res.json({ successo: true, messaggio: 'Richiesta inviata. Un amministratore la valuterà a breve.' });
  } catch (errore) { next(errore); }
});

// POST /api/v1/utenti/iscrizione-pt — Invia richiesta iscrizione a un PT
router.post('/iscrizione-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const { trainerId, messaggio } = req.body;
    const utenteId = req.utente.id;

    // Verifica di non essere già iscritto a un PT
    const iscrizioneEsistente = await prisma.iscrizionePT.findFirst({
      where: { utenteId, stato: { in: ['IN_ATTESA', 'ATTIVA'] } }
    });

    if (iscrizioneEsistente) {
      return res.status(400).json({
        successo: false,
        messaggio: iscrizioneEsistente.stato === 'IN_ATTESA'
          ? 'Hai già una richiesta in attesa'
          : 'Sei già iscritto presso un Personal Trainer'
      });
    }

    // Verifica che il trainer esista e sia PT
    const trainer = await prisma.utente.findFirst({
      where: { id: parseInt(trainerId), ruolo: 'PERSONAL_TRAINER', stato: 'ATTIVO' }
    });

    if (!trainer) {
      return res.status(404).json({ successo: false, messaggio: 'Personal Trainer non trovato' });
    }

    const iscrizione = await prisma.iscrizionePT.create({
      data: {
        utenteId,
        trainerId: parseInt(trainerId),
        messaggioRichiesta: messaggio || null
      },
      include: {
        trainer: { select: { id: true, nome: true } }
      }
    });

    // Notifica il PT
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${trainerId}`).emit('notifica:nuova', {
        tipo: 'nuova_iscrizione',
        titolo: 'Nuova richiesta di iscrizione! 🆕',
        messaggio: `${req.utente.nome} vuole iscriversi come tuo cliente.`,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({ successo: true, dati: iscrizione });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/utenti/iscrizione-pt — Annulla iscrizione / termina rapporto
router.delete('/iscrizione-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: req.utente.id, stato: { in: ['IN_ATTESA', 'ATTIVA'] } }
    });

    if (!iscrizione) {
      return res.status(404).json({ successo: false, messaggio: 'Nessuna iscrizione attiva' });
    }

    await prisma.iscrizionePT.update({
      where: { id: iscrizione.id },
      data: { stato: 'TERMINATA', dataRisposta: new Date() }
    });

    res.json({ successo: true, messaggio: 'Iscrizione terminata' });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/mio-pt — Info sul PT attuale dell'utente
router.get('/mio-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: req.utente.id, stato: { in: ['IN_ATTESA', 'ATTIVA'] } },
      include: {
        trainer: {
          select: {
            id: true, nome: true, email: true, immagineProfilo: true,
            bio: true, obiettivoFitness: true,
            _count: {
              select: { clientiComePT: { where: { stato: 'ATTIVA' } } }
            }
          }
        }
      }
    });

    if (!iscrizione) {
      return res.json({ successo: true, dati: null });
    }

    // Se iscrizione attiva, recupera anche i prossimi appuntamenti
    let prossimiAppuntamenti = [];
    if (iscrizione.stato === 'ATTIVA') {
      prossimiAppuntamenti = await prisma.appuntamentoPT.findMany({
        where: {
          clienteId: req.utente.id,
          dataOra: { gte: new Date() },
          completato: false
        },
        orderBy: { dataOra: 'asc' },
        take: 5
      });
    }

    res.json({
      successo: true,
      dati: { ...iscrizione, prossimiAppuntamenti }
    });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/mio-pt/dashboard — Dashboard completa per il tab "Allenamento con PT"
router.get('/mio-pt/dashboard', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const utenteId = req.utente.id;

    // Iscrizione attiva
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId, stato: 'ATTIVA' },
      include: {
        trainer: {
          select: {
            id: true, nome: true, email: true, immagineProfilo: true,
            bio: true, obiettivoFitness: true,
            _count: {
              select: { clientiComePT: { where: { stato: 'ATTIVA' } } }
            }
          }
        }
      }
    });

    if (!iscrizione) {
      return res.json({ successo: true, dati: null });
    }

    const trainerId = iscrizione.trainerId;

    const [annunci, schedeAssegnate, appuntamenti, appuntamentiCompletati] = await Promise.all([
      // Ultimi annunci del PT
      prisma.annuncioPT.findMany({
        where: { trainerId },
        orderBy: { creatoIl: 'desc' },
        take: 20
      }),
      // Schede assegnate dal PT (con suffisso "da PT")
      prisma.schedaAllenamento.findMany({
        where: {
          creatoreId: utenteId,
          titolo: { contains: '(da PT)' }
        },
        include: {
          esercizi: {
            include: { esercizio: { select: { nome: true, gruppoMuscoloPrimario: true } } },
            orderBy: { ordineEsecuzione: 'asc' }
          },
          _count: { select: { sessioni: true } }
        },
        orderBy: { creatoIl: 'desc' }
      }),
      // Prossimi appuntamenti
      prisma.appuntamentoPT.findMany({
        where: {
          clienteId: utenteId,
          dataOra: { gte: new Date() }
        },
        orderBy: { dataOra: 'asc' },
        take: 10
      }),
      // Appuntamenti completati (statistiche)
      prisma.appuntamentoPT.count({
        where: { clienteId: utenteId, completato: true }
      })
    ]);

    // Calcola giorni di iscrizione
    const giorniIscritto = Math.floor((Date.now() - new Date(iscrizione.dataRichiesta).getTime()) / (1000 * 60 * 60 * 24));

    res.json({
      successo: true,
      dati: {
        trainer: iscrizione.trainer,
        dataIscrizione: iscrizione.dataRichiesta,
        giorniIscritto,
        annunci,
        schedeAssegnate,
        appuntamenti,
        statistiche: {
          appuntamentiCompletati,
          schedeAssegnate: schedeAssegnate.length,
          appuntamentiFuturi: appuntamenti.length
        }
      }
    });
  } catch (errore) { next(errore); }
});

// --- Rotte Solo SuperAdmin ---

// Impedisce a un admin di eseguire azioni distruttive sul proprio account (auto-ban/declassamento/eliminazione)
const vietaSuSeStesso = (req, res, next) => {
  if (parseInt(req.params.id) === req.utente.id) {
    return res.status(400).json({ successo: false, messaggio: 'Non puoi eseguire questa azione sul tuo stesso account' });
  }
  next();
};

// GET /api/v1/utenti — Lista tutti gli utenti
router.get('/', autorizza('SUPERADMIN'), listaUtenti);

// PATCH /api/v1/utenti/:id/approva — Approva un utente
router.patch('/:id/approva', autorizza('SUPERADMIN'), approva);

// PATCH /api/v1/utenti/:id/banna — Banna un utente
router.patch('/:id/banna', autorizza('SUPERADMIN'), vietaSuSeStesso, banna);

// PATCH /api/v1/utenti/:id/ruolo — Cambia ruolo
router.patch('/:id/ruolo', autorizza('SUPERADMIN'), vietaSuSeStesso, cambiaRuolo);

// DELETE /api/v1/utenti/:id — Elimina utente
router.delete('/:id', autorizza('SUPERADMIN'), vietaSuSeStesso, elimina);

export default router;
