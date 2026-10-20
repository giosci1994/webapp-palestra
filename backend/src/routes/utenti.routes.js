// ============================================
// GymMaster — User Routes
// /api/v1/utenti/*
// ============================================

import { Router } from 'express';
import { listaUtenti, profilo, approva, banna, cambiaRuolo, elimina, aggiornaProfilo, cambiaPassword, infoApp, esportaDati } from '../controllers/utenti.controller.js';
import { verificaToken } from '../middleware/autenticazione.js';
import { autorizza } from '../middleware/autorizzazione.js';
import { idNumerico } from '../middleware/validazione.js';
import { t } from '../i18n/index.js';
import { creaNotifica, notificaAdmin } from '../services/notifiche.service.js';

const router = Router();

/** The admins get the request to become a personal trainer, each in their language */
function notificaRichiestaPT(req) {
  return notificaAdmin(req.app.get('io'), {
    tipo: 'RICHIESTA_PT',
    titolo: 'utentiRoutes.richiestaRuoloPtTitolo',
    messaggio: 'utentiRoutes.richiestaRuoloPtMessaggio',
    variabili: { nome: req.utente.nome },
    percorso: '/admin/utenti'
  });
}
// Ids in the URL are positive integers (middleware/validazione.js)
router.param('id', idNumerico);

// Every route requires authentication
router.use(verificaToken);

// GET /api/v1/utenti/profilo — Profile of the current user
router.get('/profilo', profilo);

// GET /api/v1/utenti/esportazione — All your own data in a JSON file
router.get('/esportazione', esportaDati);

// PATCH /api/v1/utenti/profilo — Update the profile
router.patch('/profilo', aggiornaProfilo);

// POST /api/v1/utenti/cambia-password — Change the password
router.post('/cambia-password', cambiaPassword);

// GET /api/v1/utenti/info-app — Technical info about the application
router.get('/info-app', infoApp);

// GET /api/v1/utenti/cerca?q=nome — Search users by name
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

// DELETE /api/v1/utenti/account — Permanently delete your own account
// Requires the password: it cannot be undone, and a stolen token or a session
// left open must not be able to delete someone's account.
router.delete('/account', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const { default: argon2 } = await import('argon2');
    const { ErroreValidazione, ErroreNonTrovato, ErroreNonAutorizzato } = await import('../utils/errori.js');
    const { eliminaAccount } = await import('../services/eliminazioneAccount.service.js');

    const { password, conferma } = req.body || {};

    if (conferma !== 'ELIMINA') {
      throw new ErroreValidazione(t('utentiRoutes.confermaMancante'));
    }
    if (!password || typeof password !== 'string') {
      throw new ErroreValidazione(t('utentiRoutes.passwordRichiesta'));
    }

    const utente = await prisma.utente.findUnique({
      where: { id: req.utente.id },
      select: { id: true, passwordHash: true, ruolo: true }
    });
    if (!utente) throw new ErroreNonTrovato(t('utentiRoutes.utenteNonTrovato'));

    if (!await argon2.verify(utente.passwordHash, password)) {
      throw new ErroreNonAutorizzato(t('utentiRoutes.passwordNonCorretta'));
    }

    // The last administrator cannot disappear: that would leave an
    // installation with nobody able to administer it.
    if (utente.ruolo === 'SUPERADMIN') {
      const altri = await prisma.utente.count({ where: { ruolo: 'SUPERADMIN', id: { not: utente.id } } });
      if (altri === 0) {
        throw new ErroreNonAutorizzato(t('utentiRoutes.unicoAmministratore'));
      }
    }

    const riepilogo = await eliminaAccount(utente.id);

    // Without removing the cookie the browser would keep trying to renew the
    // session of a user who no longer exists. Same path it was set with
    // (autenticazione.controller.js), otherwise the browser keeps it.
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/api/v1/auth' });
    res.json({ successo: true, messaggio: t('utentiRoutes.accountEliminato'), dati: riepilogo });
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
    res.json({ successo: true, messaggio: t('utentiRoutes.statisticheAzzerate') });
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
    res.json({ successo: true, messaggio: t('utentiRoutes.gamificationAzzerata') });
  } catch (errore) { next(errore); }
});

// PATCH /api/v1/utenti/completa-profilo — Onboarding wizard
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
      // Professional profile (personal trainer onboarding)
      ...(bio !== undefined && { bio }),
      ...(specializzazioni !== undefined && { specializzazioni: Array.isArray(specializzazioni) ? JSON.stringify(specializzazioni) : specializzazioni }),
      ...(anniEsperienza !== undefined && anniEsperienza !== '' && anniEsperienza !== null && { anniEsperienza: parseInt(anniEsperienza) || null }),
      ...(certificazioni !== undefined && { certificazioni }),
      ...(contattoPubblico !== undefined && { contattoPubblico }),
      ...(tariffaIndicativa !== undefined && { tariffaIndicativa }),
    };

    // Handle the request for the personal trainer role
    if (tipoAccount === 'PERSONAL_TRAINER' && req.utente.ruolo === 'UTENTE') {
      datiAggiornamento.ruoloRichiesto = 'PERSONAL_TRAINER';
      await notificaRichiestaPT(req);
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
// TELEGRAM BOT LINKING
// ============================

// POST /api/v1/utenti/telegram/genera-codice — Generate the linking code/deep link
router.post('/telegram/genera-codice', async (req, res, next) => {
  try {
    const { generaCodiceCollegamento } = await import('../services/bot.service.js');
    const dati = await generaCodiceCollegamento(req.utente.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/telegram/stato — Link status
router.get('/telegram/stato', async (req, res, next) => {
  try {
    const { statoCollegamento } = await import('../services/bot.service.js');
    const dati = await statoCollegamento(req.utente.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/utenti/telegram — Unlink the bot
router.delete('/telegram', async (req, res, next) => {
  try {
    const { scollegaTelegram } = await import('../services/bot.service.js');
    await scollegaTelegram(req.utente.id);
    res.json({ successo: true, messaggio: t('utentiRoutes.telegramScollegato') });
  } catch (errore) { next(errore); }
});

// ============================
// PERSONAL TRAINER ENROLMENT
// ============================

// GET /api/v1/utenti/personal-trainers — List of available personal trainers
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

// GET /api/v1/utenti/personal-trainers/:id — Public profile of a personal trainer + their global plans
router.get('/personal-trainers/:id', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ successo: false, messaggio: t('utentiRoutes.idNonValido') });

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
    if (!pt) return res.status(404).json({ successo: false, messaggio: t('utentiRoutes.personalTrainerNonTrovato') });

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

// POST /api/v1/utenti/richiedi-pt — The user asks to become a personal trainer
router.post('/richiedi-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    if (req.utente.ruolo !== 'UTENTE') {
      return res.status(400).json({ successo: false, messaggio: t('utentiRoutes.soloUtentiStandard') });
    }
    await prisma.utente.update({
      where: { id: req.utente.id },
      data: { ruoloRichiesto: 'PERSONAL_TRAINER' }
    });
    await notificaRichiestaPT(req);
    res.json({ successo: true, messaggio: t('utentiRoutes.richiestaInviata') });
  } catch (errore) { next(errore); }
});

// Maximum length of the message that comes with a request to a personal trainer
const MESSAGGIO_PT_MAX = 500;

// POST /api/v1/utenti/iscrizione-pt — Send an enrolment request to a personal trainer
router.post('/iscrizione-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const { ErroreValidazione } = await import('../utils/errori.js');
    const { trainerId, messaggio } = req.body || {};
    const utenteId = req.utente.id;

    // The request data first of all: an id that is not a number used to reach
    // Prisma and turn into a 500 error
    const idTrainer = Number(trainerId);
    if (!Number.isInteger(idTrainer) || idTrainer <= 0) {
      throw new ErroreValidazione(t('utentiRoutes.personalTrainerNonValido'));
    }
    if (messaggio != null && typeof messaggio !== 'string') {
      throw new ErroreValidazione(t('utentiRoutes.messaggioNonTesto'));
    }
    const testoMessaggio = messaggio?.trim() || null;
    if (testoMessaggio && testoMessaggio.length > MESSAGGIO_PT_MAX) {
      throw new ErroreValidazione(t('utentiRoutes.messaggioTroppoLungo', { max: MESSAGGIO_PT_MAX }));
    }

    // Check that the user is not already enrolled with a personal trainer
    const iscrizioneEsistente = await prisma.iscrizionePT.findFirst({
      where: { utenteId, stato: { in: ['IN_ATTESA', 'ATTIVA'] } }
    });

    if (iscrizioneEsistente) {
      return res.status(400).json({
        successo: false,
        messaggio: iscrizioneEsistente.stato === 'IN_ATTESA'
          ? t('utentiRoutes.richiestaGiaInAttesa')
          : t('utentiRoutes.giaIscritto')
      });
    }

    // Check that the trainer exists and is a personal trainer
    const trainer = await prisma.utente.findFirst({
      where: { id: idTrainer, ruolo: 'PERSONAL_TRAINER', stato: 'ATTIVO' }
    });

    if (!trainer) {
      return res.status(404).json({ successo: false, messaggio: t('utentiRoutes.personalTrainerNonTrovato') });
    }

    const iscrizione = await prisma.iscrizionePT.create({
      data: {
        utenteId,
        trainerId: idTrainer,
        messaggioRichiesta: testoMessaggio
      },
      include: {
        trainer: { select: { id: true, nome: true } }
      }
    });

    // Notify the personal trainer, in their language
    await creaNotifica(req.app.get('io'), idTrainer, {
      tipo: 'RICHIESTA_PT',
      titolo: 'utentiRoutes.nuovaRichiestaTitolo',
      messaggio: 'utentiRoutes.nuovaRichiestaMessaggio',
      variabili: { nome: req.utente.nome },
      percorso: '/pt'
    });

    res.status(201).json({ successo: true, dati: iscrizione });
  } catch (errore) { next(errore); }
});

// DELETE /api/v1/utenti/iscrizione-pt — Cancel the enrolment / end the relationship
router.delete('/iscrizione-pt', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: req.utente.id, stato: { in: ['IN_ATTESA', 'ATTIVA'] } }
    });

    if (!iscrizione) {
      return res.status(404).json({ successo: false, messaggio: t('utentiRoutes.nessunaIscrizione') });
    }

    await prisma.iscrizionePT.update({
      where: { id: iscrizione.id },
      data: { stato: 'TERMINATA', dataRisposta: new Date() }
    });

    res.json({ successo: true, messaggio: t('utentiRoutes.iscrizioneTerminata') });
  } catch (errore) { next(errore); }
});

// GET /api/v1/utenti/mio-pt — Info on the user's current personal trainer
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

    // If the enrolment is active, also fetch the upcoming appointments
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

// GET /api/v1/utenti/mio-pt/dashboard — Full dashboard for the "Allenamento con PT" tab (training with a personal trainer)
router.get('/mio-pt/dashboard', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    const utenteId = req.utente.id;

    // Active enrolment
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
      // Latest announcements from the personal trainer
      prisma.annuncioPT.findMany({
        where: { trainerId },
        orderBy: { creatoIl: 'desc' },
        take: 20
      }),
      // Plans assigned by a personal trainer; the oldest ones, from before
      // assegnataDaPTId, only have the "(da PT)" suffix in the title
      prisma.schedaAllenamento.findMany({
        where: {
          creatoreId: utenteId,
          OR: [{ assegnataDaPTId: { not: null } }, { titolo: { contains: '(da PT)' } }]
        },
        include: {
          esercizi: {
            include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
            orderBy: { ordineEsecuzione: 'asc' }
          },
          _count: { select: { sessioni: true } }
        },
        orderBy: { creatoIl: 'desc' }
      }),
      // Upcoming appointments
      prisma.appuntamentoPT.findMany({
        where: {
          clienteId: utenteId,
          dataOra: { gte: new Date() }
        },
        orderBy: { dataOra: 'asc' },
        take: 10
      }),
      // Completed appointments (statistics)
      prisma.appuntamentoPT.count({
        where: { clienteId: utenteId, completato: true }
      })
    ]);

    // Work out the days enrolled
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

// --- SuperAdmin-only Routes ---

// Stops an admin from running destructive actions on their own account (self-ban/demotion/deletion)
const vietaSuSeStesso = (req, res, next) => {
  if (parseInt(req.params.id) === req.utente.id) {
    return res.status(400).json({ successo: false, messaggio: t('utentiRoutes.azioneSuTeStesso') });
  }
  next();
};

// GET /api/v1/utenti — List every user
router.get('/', autorizza('SUPERADMIN'), listaUtenti);

// PATCH /api/v1/utenti/:id/approva — Approve a user
router.patch('/:id/approva', autorizza('SUPERADMIN'), approva);

// PATCH /api/v1/utenti/:id/banna — Ban a user
router.patch('/:id/banna', autorizza('SUPERADMIN'), vietaSuSeStesso, banna);

// PATCH /api/v1/utenti/:id/ruolo — Change the role
router.patch('/:id/ruolo', autorizza('SUPERADMIN'), vietaSuSeStesso, cambiaRuolo);

// DELETE /api/v1/utenti/:id — Delete a user
router.delete('/:id', autorizza('SUPERADMIN'), vietaSuSeStesso, elimina);

export default router;
