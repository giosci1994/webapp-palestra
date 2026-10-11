// ============================================
// GymMaster — Personal Trainer Routes
// /api/v1/pt/*
// Every route is reserved for the personal trainer and SUPERADMIN roles
// ============================================

import { Router } from 'express';
import { verificaToken } from '../middleware/autenticazione.js';
import { autorizza } from '../middleware/autorizzazione.js';
import prisma from '../config/database.js';
import { idNumerico } from '../middleware/validazione.js';
import { SOLO_LAVORO } from '../utils/tipiSerie.js';

const router = Router();
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);
router.param('clienteId', idNumerico);
router.param('schedaId', idNumerico);
router.use(verificaToken);
router.use(autorizza('PERSONAL_TRAINER', 'SUPERADMIN'));

// ============================
// DASHBOARD (personal trainer statistics)
// ============================

// GET /api/v1/pt/dashboard — General statistics for the personal trainer
router.get('/dashboard', async (req, res, next) => {
  try {
    const trainerId = req.utente.id;
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const domani = new Date(oggi);
    domani.setDate(domani.getDate() + 1);

    const [clientiAttivi, richiesteInAttesa, appuntamentiOggi, sessioniClienti] = await Promise.all([
      // No. of active clients
      prisma.iscrizionePT.count({
        where: { trainerId, stato: 'ATTIVA' }
      }),
      // No. of pending requests
      prisma.iscrizionePT.count({
        where: { trainerId, stato: 'IN_ATTESA' }
      }),
      // No. of appointments today
      prisma.appuntamentoPT.count({
        where: {
          trainerId,
          dataOra: { gte: oggi, lt: domani }
        }
      }),
      // No. of client sessions (all of them)
      prisma.sessioneAllenamento.count({
        where: {
          utente: {
            iscrizioniComeCliente: {
              some: { trainerId, stato: 'ATTIVA' }
            }
          }
        }
      })
    ]);

    res.json({
      successo: true,
      dati: { clientiAttivi, richiesteInAttesa, appuntamentiOggi, sessioniClienti }
    });
  } catch (errore) { next(errore); }
});

// ============================
// CLIENTS
// ============================

// GET /api/v1/pt/clienti — List of active enrolled clients
router.get('/clienti', async (req, res, next) => {
  try {
    const iscrizioni = await prisma.iscrizionePT.findMany({
      where: { trainerId: req.utente.id, stato: 'ATTIVA' },
      include: {
        utente: {
          select: {
            id: true, nome: true, email: true, immagineProfilo: true,
            obiettivoFitness: true, pesoKg: true, altezzaCm: true,
            dataRegistrazione: true, ultimoAccesso: true,
            _count: {
              select: { sessioni: true, schedeCreate: true, recordPersonali: true }
            }
          }
        }
      },
      orderBy: { dataRichiesta: 'desc' }
    });

    const clienti = iscrizioni.map(i => ({
      ...i.utente,
      dataIscrizione: i.dataRichiesta,
      notePT: i.notePT,
      iscrizioneId: i.id
    }));

    res.json({ successo: true, dati: clienti });
  } catch (errore) { next(errore); }
});

// GET /api/v1/pt/clienti/:id — Full detail of a client with statistics
router.get('/clienti/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    const trainerId = req.utente.id;
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: clienteId, trainerId, stato: 'ATTIVA' }
    });
    if (!iscrizione) {
      return res.status(403).json({ successo: false, messaggio: 'Non un tuo cliente' });
    }
    const da90g = new Date(); da90g.setDate(da90g.getDate() - 90);
    const [cliente, ultime5Sessioni, record, schedeAssegnate, tutteSessioni, logSerie] = await Promise.all([
      prisma.utente.findUnique({
        where: { id: clienteId },
        select: {
          id: true, nome: true, email: true, immagineProfilo: true,
          obiettivoFitness: true, pesoKg: true, altezzaCm: true,
          genere: true, bio: true, dataNascita: true,
          puntiEsperienza: true, dataRegistrazione: true, dataResetStatistiche: true,
          _count: { select: { sessioni: true, recordPersonali: true } }
        }
      }),
      prisma.sessioneAllenamento.findMany({
        where: { utenteId: clienteId }, orderBy: { dataInizio: 'desc' }, take: 5,
        include: { scheda: { select: { titolo: true } }, _count: { select: { logSerie: { where: { completato: true, ...SOLO_LAVORO } } } } }
      }),
      prisma.recordPersonale.findMany({
        where: { utenteId: clienteId }, orderBy: { pesoMaxRaggiunto: 'desc' }, take: 10,
        include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } }
      }),
      prisma.schedaAllenamento.findMany({
        where: { creatoreId: clienteId, assegnataDaPTId: trainerId },
        include: {
          esercizi: { include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } }, orderBy: { ordineEsecuzione: 'asc' } },
          _count: { select: { sessioni: true } }
        },
        orderBy: { creatoIl: 'desc' }
      }),
      prisma.sessioneAllenamento.findMany({
        where: { utenteId: clienteId, dataFine: { not: null } },
        select: { durataMinuti: true, volumeTotaleKg: true, dataInizio: true },
        orderBy: { dataInizio: 'asc' }
      }),
      prisma.logSerie.findMany({
        where: { sessione: { utenteId: clienteId }, completato: true, ...SOLO_LAVORO },
        include: { esercizio: { select: { gruppoMuscoloPrimario: true } } }
      })
    ]);
    const resetDate = cliente?.dataResetStatistiche || new Date(0);
    const sv = tutteSessioni.filter(s => s.dataInizio >= resetDate);
    const perGiorno = {};
    sv.filter(s => s.dataInizio >= da90g).forEach(s => {
      const g = s.dataInizio.toISOString().split('T')[0];
      if (!perGiorno[g]) perGiorno[g] = { data: g, sessioni: 0, durata: 0, volume: 0 };
      perGiorno[g].sessioni++; perGiorno[g].durata += s.durataMinuti || 0; perGiorno[g].volume += s.volumeTotaleKg || 0;
    });
    const contGruppi = {};
    logSerie.forEach(l => {
      const gr = l.esercizio.gruppoMuscoloPrimario;
      if (!contGruppi[gr]) contGruppi[gr] = { nome: gr, serie: 0 };
      contGruppi[gr].serie++;
    });
    res.json({
      successo: true,
      dati: {
        cliente, ultime5Sessioni, record, schedeAssegnate, iscrizione,
        statistiche: {
          totaleSessioni: sv.length,
          totaleDurata: sv.reduce((s, x) => s + (x.durataMinuti || 0), 0),
          totaleVolume: Math.round(sv.reduce((s, x) => s + (x.volumeTotaleKg || 0), 0)),
          totaleRecord: record.length,
          sessioni: Object.values(perGiorno),
          gruppiMuscolari: Object.values(contGruppi).sort((a, b) => b.serie - a.serie)
        }
      }
    });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/pt/clienti/:clienteId/schede/:schedaId — Remove an assigned plan
router.delete('/clienti/:clienteId/schede/:schedaId', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    const schedaId = parseInt(req.params.schedaId);
    const trainerId = req.utente.id;
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: clienteId, trainerId, stato: 'ATTIVA' }
    });
    if (!iscrizione) return res.status(403).json({ successo: false, messaggio: 'Non un tuo cliente' });
    const scheda = await prisma.schedaAllenamento.findFirst({
      where: { id: schedaId, creatoreId: clienteId, assegnataDaPTId: trainerId }
    });
    if (!scheda) return res.status(404).json({ successo: false, messaggio: 'Scheda non trovata' });
    await prisma.schedaAllenamento.delete({ where: { id: schedaId } });
    res.json({ successo: true, messaggio: 'Scheda rimossa' });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/pt/clienti/:id — End the relationship with a client
router.delete('/clienti/:id', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);

    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: clienteId, trainerId: req.utente.id, stato: 'ATTIVA' }
    });

    if (!iscrizione) {
      return res.status(404).json({ successo: false, messaggio: 'Iscrizione non trovata' });
    }

    await prisma.iscrizionePT.update({
      where: { id: iscrizione.id },
      data: { stato: 'TERMINATA', dataRisposta: new Date() }
    });

    // Notify the client
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${clienteId}`).emit('notifica:nuova', {
        tipo: 'iscrizione_terminata',
        titolo: 'Iscrizione terminata',
        messaggio: `Il tuo Personal Trainer ha terminato la collaborazione.`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ successo: true, messaggio: 'Rapporto terminato' });
  } catch (errore) { next(errore); }
});

// ============================
// ENROLMENT REQUESTS
// ============================

// GET /api/v1/pt/richieste — List of pending requests
router.get('/richieste', async (req, res, next) => {
  try {
    const richieste = await prisma.iscrizionePT.findMany({
      where: { trainerId: req.utente.id, stato: 'IN_ATTESA' },
      include: {
        utente: {
          select: {
            id: true, nome: true, email: true, immagineProfilo: true,
            obiettivoFitness: true, pesoKg: true, altezzaCm: true,
            dataRegistrazione: true
          }
        }
      },
      orderBy: { dataRichiesta: 'desc' }
    });

    res.json({ successo: true, dati: richieste });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/pt/richieste/:id/accetta — Accept a request
router.patch('/richieste/:id/accetta', async (req, res, next) => {
  try {
    const richiestaId = parseInt(req.params.id);
    const { notePT } = req.body;

    const richiesta = await prisma.iscrizionePT.findFirst({
      where: { id: richiestaId, trainerId: req.utente.id, stato: 'IN_ATTESA' }
    });

    if (!richiesta) {
      return res.status(404).json({ successo: false, messaggio: 'Richiesta non trovata' });
    }

    const aggiornata = await prisma.iscrizionePT.update({
      where: { id: richiestaId },
      data: { stato: 'ATTIVA', dataRisposta: new Date(), notePT: notePT || null },
      include: { utente: { select: { id: true, nome: true } } }
    });

    // Notify the user
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${richiesta.utenteId}`).emit('notifica:nuova', {
        tipo: 'iscrizione_accettata',
        titolo: 'Richiesta accettata! 🎉',
        messaggio: `${req.utente.nome} ha accettato la tua richiesta di iscrizione!`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ successo: true, dati: aggiornata });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/pt/richieste/:id/rifiuta — Reject a request
router.patch('/richieste/:id/rifiuta', async (req, res, next) => {
  try {
    const richiestaId = parseInt(req.params.id);

    const richiesta = await prisma.iscrizionePT.findFirst({
      where: { id: richiestaId, trainerId: req.utente.id, stato: 'IN_ATTESA' }
    });

    if (!richiesta) {
      return res.status(404).json({ successo: false, messaggio: 'Richiesta non trovata' });
    }

    await prisma.iscrizionePT.update({
      where: { id: richiestaId },
      data: { stato: 'RIFIUTATA', dataRisposta: new Date() }
    });

    // Notify the user
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${richiesta.utenteId}`).emit('notifica:nuova', {
        tipo: 'iscrizione_rifiutata',
        titolo: 'Richiesta non accettata',
        messaggio: `La tua richiesta di iscrizione non è stata accettata.`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ successo: true, messaggio: 'Richiesta rifiutata' });
  } catch (errore) { next(errore); }
});

// ============================
// APPOINTMENTS
// ============================

// GET /api/v1/pt/appuntamenti — List of appointments (optional date filter)
router.get('/appuntamenti', async (req, res, next) => {
  try {
    const { da, a, clienteId } = req.query;
    const filtri = { trainerId: req.utente.id };

    if (da || a) {
      filtri.dataOra = {};
      if (da) filtri.dataOra.gte = new Date(da);
      if (a) filtri.dataOra.lte = new Date(a);
    }
    if (clienteId) filtri.clienteId = parseInt(clienteId);

    const appuntamenti = await prisma.appuntamentoPT.findMany({
      where: filtri,
      include: {
        cliente: {
          select: { id: true, nome: true, immagineProfilo: true }
        }
      },
      orderBy: { dataOra: 'asc' }
    });

    res.json({ successo: true, dati: appuntamenti });
  } catch (errore) { next(errore); }
});

// POST /api/v1/pt/appuntamenti — Create an appointment
router.post('/appuntamenti', async (req, res, next) => {
  try {
    const { clienteId, titolo, descrizione, dataOra, durataMinuti, note } = req.body;
    const trainerId = req.utente.id;

    // Check that the client is enrolled
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: parseInt(clienteId), trainerId, stato: 'ATTIVA' }
    });

    if (!iscrizione) {
      return res.status(403).json({ successo: false, messaggio: 'Questo utente non è un tuo cliente' });
    }

    const appuntamento = await prisma.appuntamentoPT.create({
      data: {
        trainerId,
        clienteId: parseInt(clienteId),
        titolo,
        descrizione: descrizione || null,
        dataOra: new Date(dataOra),
        durataMinuti: durataMinuti || 60,
        note: note || null
      },
      include: {
        cliente: { select: { id: true, nome: true } }
      }
    });

    // Notify the client
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${clienteId}`).emit('notifica:nuova', {
        tipo: 'nuovo_appuntamento',
        titolo: 'Nuovo appuntamento 📅',
        messaggio: `${req.utente.nome} ha fissato: "${titolo}" per il ${new Date(dataOra).toLocaleDateString('it-IT')}`,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({ successo: true, dati: appuntamento });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/pt/appuntamenti/:id — Edit an appointment
router.patch('/appuntamenti/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { titolo, descrizione, dataOra, durataMinuti, completato, note } = req.body;

    const esistente = await prisma.appuntamentoPT.findFirst({
      where: { id, trainerId: req.utente.id }
    });

    if (!esistente) {
      return res.status(404).json({ successo: false, messaggio: 'Appuntamento non trovato' });
    }

    const dati = {};
    if (titolo !== undefined) dati.titolo = titolo;
    if (descrizione !== undefined) dati.descrizione = descrizione;
    if (dataOra !== undefined) dati.dataOra = new Date(dataOra);
    if (durataMinuti !== undefined) dati.durataMinuti = durataMinuti;
    if (completato !== undefined) dati.completato = completato;
    if (note !== undefined) dati.note = note;

    const aggiornato = await prisma.appuntamentoPT.update({
      where: { id },
      data: dati,
      include: { cliente: { select: { id: true, nome: true } } }
    });

    res.json({ successo: true, dati: aggiornato });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/pt/appuntamenti/:id — Delete an appointment
router.delete('/appuntamenti/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const esistente = await prisma.appuntamentoPT.findFirst({
      where: { id, trainerId: req.utente.id }
    });

    if (!esistente) {
      return res.status(404).json({ successo: false, messaggio: 'Appuntamento non trovato' });
    }

    await prisma.appuntamentoPT.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Appuntamento eliminato' });
  } catch (errore) { next(errore); }
});

// ============================
// EXERCISES (direct creation)
// ============================

// POST /api/v1/pt/esercizi — Create an exercise (same logic as the admin)
router.post('/esercizi', async (req, res, next) => {
  try {
    const { nome, gruppoMuscoloPrimario, gruppoMuscoloSecondario, attrezzaturaRichiestaId,
            descrizione, linkVideo, difficulty, bodyRegion, mechanics, posture,
            movementPattern, laterality, forceType, classification } = req.body;

    const esercizio = await prisma.esercizio.create({
      data: {
        nome,
        gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: gruppoMuscoloSecondario || null,
        attrezzaturaRichiestaId: attrezzaturaRichiestaId ? parseInt(attrezzaturaRichiestaId) : null,
        descrizione: descrizione || null,
        linkVideo: linkVideo || null,
        difficulty: difficulty || null,
        bodyRegion: bodyRegion || null,
        mechanics: mechanics || null,
        posture: posture || null,
        movementPattern: movementPattern || null,
        laterality: laterality || null,
        forceType: forceType || null,
        classification: classification || null,
      },
      include: { attrezzatura: { select: { id: true, nome: true } } }
    });

    res.status(201).json({ successo: true, dati: esercizio });
  } catch (errore) { next(errore); }
});

// ============================
// PLANS (full personal trainer view)
// ============================

// GET /api/v1/pt/schede — All plans (own + global)
router.get('/schede', async (req, res, next) => {
  try {
    const schede = await prisma.schedaAllenamento.findMany({
      where: {
        OR: [
          { creatoreId: req.utente.id },
          { visibilita: 'GLOBALE' }
        ]
      },
      include: {
        creatore: { select: { id: true, nome: true } },
        esercizi: {
          include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
          orderBy: { ordineEsecuzione: 'asc' }
        },
        _count: { select: { sessioni: true } }
      },
      orderBy: { creatoIl: 'desc' }
    });

    res.json({ successo: true, dati: schede });
  } catch (errore) { next(errore); }
});

// POST /api/v1/pt/schede — Create a plan from scratch
router.post('/schede', async (req, res, next) => {
  try {
    const { titolo, descrizione, livello, esercizi } = req.body;
    if (!titolo || !esercizi?.length) {
      return res.status(400).json({ successo: false, messaggio: 'Titolo e almeno un esercizio sono obbligatori' });
    }

    const scheda = await prisma.schedaAllenamento.create({
      data: {
        creatoreId: req.utente.id,
        titolo,
        descrizione: descrizione || null,
        livello: livello || 'BASE',
        visibilita: 'PERSONALE',
        esercizi: {
          create: esercizi.map((e, i) => ({
            esercizioId: parseInt(e.esercizioId),
            serieTarget: parseInt(e.serieTarget) || 3,
            repTarget: e.repTarget || '8-12',
            recuperoSecondi: parseInt(e.recuperoSecondi) || 90,
            ordineEsecuzione: i + 1
          }))
        }
      },
      include: {
        esercizi: { include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } } },
        _count: { select: { sessioni: true } }
      }
    });

    res.status(201).json({ successo: true, dati: scheda });
  } catch (errore) { next(errore); }
});

// POST /api/v1/pt/clienti/:id/assegna-scheda — Assign a plan to a client
// (creates a copy of the plan with the client as creatoreId)
router.post('/clienti/:id/assegna-scheda', async (req, res, next) => {
  try {
    const clienteId = parseInt(req.params.id);
    const { schedaId } = req.body;
    const trainerId = req.utente.id;

    // Check that this is one of their clients
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: clienteId, trainerId, stato: 'ATTIVA' }
    });

    if (!iscrizione) {
      return res.status(403).json({ successo: false, messaggio: 'Non è un tuo cliente' });
    }

    // Fetch the original plan with its exercises
    const schedaOriginale = await prisma.schedaAllenamento.findUnique({
      where: { id: parseInt(schedaId) },
      include: { esercizi: true }
    });

    if (!schedaOriginale) {
      return res.status(404).json({ successo: false, messaggio: 'Scheda non trovata' });
    }

    // Create a copy for the client, tracking the personal trainer
    const nuovaScheda = await prisma.schedaAllenamento.create({
      data: {
        creatoreId: clienteId,
        assegnataDaPTId: trainerId,
        titolo: `${schedaOriginale.titolo} (da PT)`,
        descrizione: schedaOriginale.descrizione,
        livello: schedaOriginale.livello,
        visibilita: 'PERSONALE',
        esercizi: {
          create: schedaOriginale.esercizi.map(e => ({
            esercizioId: e.esercizioId,
            serieTarget: e.serieTarget,
            repTarget: e.repTarget,
            recuperoSecondi: e.recuperoSecondi,
            ordineEsecuzione: e.ordineEsecuzione
          }))
        }
      },
      include: {
        esercizi: { include: { esercizio: { select: { nome: true, nomeIt: true } } } }
      }
    });

    // Notify the client
    const io = req.app.get('io');
    if (io) {
      io.to(`utente:${clienteId}`).emit('notifica:nuova', {
        tipo: 'scheda_assegnata',
        titolo: 'Nuova scheda assegnata! 💪',
        messaggio: `${req.utente.nome} ti ha assegnato la scheda "${nuovaScheda.titolo}"`,
        dati: { schedaId: nuovaScheda.id },
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({ successo: true, dati: nuovaScheda });
  } catch (errore) { next(errore); }
});

// ============================
// ANNOUNCEMENT BOARD
// ============================

// GET /api/v1/pt/annunci — List of the personal trainer's announcements
router.get('/annunci', async (req, res, next) => {
  try {
    const annunci = await prisma.annuncioPT.findMany({
      where: { trainerId: req.utente.id },
      include: { destinatario: { select: { id: true, nome: true } } },
      orderBy: { creatoIl: 'desc' },
      take: 50
    });
    res.json({ successo: true, dati: annunci });
  } catch (errore) { next(errore); }
});

// POST /api/v1/pt/annunci — Create a new announcement
router.post('/annunci', async (req, res, next) => {
  try {
    const { titolo, contenuto, priorita, destinatarioId } = req.body;
    if (!titolo || !contenuto) {
      return res.status(400).json({ successo: false, messaggio: 'Titolo e contenuto sono obbligatori' });
    }

    // With a destinatarioId, check that it is one of their clients
    if (destinatarioId) {
      const iscrizione = await prisma.iscrizionePT.findFirst({
        where: { utenteId: parseInt(destinatarioId), trainerId: req.utente.id, stato: 'ATTIVA' }
      });
      if (!iscrizione) {
        return res.status(403).json({ successo: false, messaggio: 'Questo utente non è un tuo cliente' });
      }
    }

    const annuncio = await prisma.annuncioPT.create({
      data: {
        trainerId: req.utente.id,
        destinatarioId: destinatarioId ? parseInt(destinatarioId) : null,
        titolo,
        contenuto,
        priorita: priorita || 'normale'
      },
      include: { destinatario: { select: { id: true, nome: true } } }
    });

    // Notify clients: only the recipient if there is one; otherwise all of them
    const io = req.app.get('io');
    if (io) {
      if (destinatarioId) {
        io.to(`utente:${destinatarioId}`).emit('notifica:nuova', {
          tipo: 'annuncio_pt',
          titolo: `📢 ${titolo}`,
          messaggio: contenuto.substring(0, 100),
          timestamp: new Date().toISOString()
        });
      } else {
        const clienti = await prisma.iscrizionePT.findMany({
          where: { trainerId: req.utente.id, stato: 'ATTIVA' },
          select: { utenteId: true }
        });
        clienti.forEach(c => {
          io.to(`utente:${c.utenteId}`).emit('notifica:nuova', {
            tipo: 'annuncio_pt',
            titolo: `📢 ${titolo}`,
            messaggio: contenuto.substring(0, 100),
            timestamp: new Date().toISOString()
          });
        });
      }
    }

    res.status(201).json({ successo: true, dati: annuncio });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/pt/annunci/:id — Delete an announcement
router.delete('/annunci/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const esistente = await prisma.annuncioPT.findFirst({
      where: { id, trainerId: req.utente.id }
    });
    if (!esistente) {
      return res.status(404).json({ successo: false, messaggio: 'Annuncio non trovato' });
    }
    await prisma.annuncioPT.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Annuncio eliminato' });
  } catch (errore) { next(errore); }
});

export default router;
