// ============================================
// GymMaster — Workout schedule controller
// Calendar of the scheduled workouts
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import { creaNotifica } from '../services/notifiche.service.js';
import { gruppiDellaScheda } from '../services/consiglio.service.js';
import { giornoLocale, orarioLocale } from '../utils/date.js';

// Days of the week as used across the app: 0 = Monday … 6 = Sunday
const GIORNI_VALIDI = [0, 1, 2, 3, 4, 5, 6];
const MAX_SETTIMANE = 12;

/**
 * Converts "YYYY-MM-DD" into a Date at midnight UTC.
 * The column is of type DATE: pinning the time to midnight UTC keeps the
 * server's time zone from moving the workout to the day before or after.
 */
function aData(valore, nomeCampo = 'data') {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    throw new ErroreValidazione(`Campo "${nomeCampo}" non valido: atteso formato YYYY-MM-DD`);
  }
  const d = new Date(`${valore}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ErroreValidazione(`Campo "${nomeCampo}" non è una data reale`);
  return d;
}

/** Formats a Date as "YYYY-MM-DD" (always in UTC, as it was saved). */
function daData(d) {
  return d.toISOString().slice(0, 10);
}

/** Day index 0=Mon … 6=Sun from a UTC Date. */
function giornoSettimanaUTC(d) {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Works out which calendar is being changed and whether the requester may do it.
 *
 * Rules: everyone manages their own; a SUPERADMIN manages anyone; a personal
 * trainer manages only clients with an ATTIVA subscription. Without this check,
 * passing someone else's utenteId would be enough to write into their calendar.
 */
async function risolviAgenda(richiedente, utenteIdRichiesto) {
  const bersaglioId = utenteIdRichiesto ? parseInt(utenteIdRichiesto, 10) : richiedente.id;
  if (Number.isNaN(bersaglioId)) throw new ErroreValidazione('Campo "utenteId" non valido');

  if (bersaglioId === richiedente.id) return bersaglioId;
  if (richiedente.ruolo === 'SUPERADMIN') return bersaglioId;

  if (richiedente.ruolo === 'PERSONAL_TRAINER') {
    const iscrizione = await prisma.iscrizionePT.findFirst({
      where: { utenteId: bersaglioId, trainerId: richiedente.id, stato: 'ATTIVA' },
      select: { id: true }
    });
    if (iscrizione) return bersaglioId;
  }

  throw new ErroreNonAutorizzato('Non puoi gestire il calendario di questo utente');
}

/** The plan must be usable by the user it is scheduled for. */
async function verificaScheda(schedaId, utenteBersaglioId) {
  const id = parseInt(schedaId, 10);
  if (Number.isNaN(id)) throw new ErroreValidazione('Campo "schedaId" non valido');

  const scheda = await prisma.schedaAllenamento.findUnique({
    where: { id },
    select: { id: true, creatoreId: true, visibilita: true }
  });
  if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');

  const utilizzabile = scheda.visibilita === 'GLOBALE' || scheda.creatoreId === utenteBersaglioId;
  if (!utilizzabile) {
    // A plan assigned by the personal trainer has the trainer as its creator:
    // check that it is meant for this user anyway before refusing it.
    const assegnata = await prisma.schedaAllenamento.findFirst({
      where: { id, sessioni: { some: { utenteId: utenteBersaglioId } } },
      select: { id: true }
    });
    if (!assegnata) throw new ErroreNonAutorizzato('Questa scheda non è disponibile per l\'utente indicato');
  }
  return id;
}

const INCLUDI_SCHEDA = {
  scheda: { select: { id: true, titolo: true, livello: true, descrizione: true } },
  creatoDa: { select: { id: true, nome: true, ruolo: true } }
};

/** GET /api/v1/pianificazione?da=&a=&utenteId= — Workouts in a date range */
export async function listaPianificazione(req, res, next) {
  try {
    const utenteId = await risolviAgenda(req.utente, req.query.utenteId);

    // Default: the current month, which is what the calendar shows when it opens
    const oggi = new Date();
    const primoDelMese = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
    const ultimoDelMese = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() + 1, 0));

    const da = req.query.da ? aData(req.query.da, 'da') : primoDelMese;
    const a = req.query.a ? aData(req.query.a, 'a') : ultimoDelMese;
    if (da > a) throw new ErroreValidazione('L\'intervallo richiesto è rovesciato: "da" è successivo ad "a"');

    const allenamenti = await prisma.allenamentoPianificato.findMany({
      where: { utenteId, data: { gte: da, lte: a } },
      include: INCLUDI_SCHEDA,
      orderBy: [{ data: 'asc' }, { id: 'asc' }]
    });

    res.json({
      successo: true,
      dati: allenamenti.map(a => ({ ...a, data: daData(a.data) }))
    });
  } catch (errore) {
    next(errore);
  }
}

// Time suggestion: as in the crowd level tab, the live value counts only if
// it is fresh (the scraper runs every half hour)
const LIMITE_FRESCHEZZA_LIVE_MS = 90 * 60 * 1000;
const FASCIA_PREDEFINITA = { da: 7, a: 21 };
const ORA_ULTIMA = 22;
const SCARTO_TOLLERATO = 5; // percentage points of crowding

/**
 * When to go to the gym today: the least crowded hour among those still to
 * come, inside the window when you usually train (the median start hour of the
 * latest workouts, two hours before and after). If the window has already
 * passed, the best of the next four hours.
 */
async function orarioConsigliato(utenteId, palestraId, adesso) {
  if (!palestraId) return null;
  const { ora, giornoSettimana } = orarioLocale(adesso);
  const [righe, sessioni] = await Promise.all([
    prisma.afluenzaPalestra.findMany({
      where: { palestraId, giornoSettimana },
      select: { ora: true, livelloPercentuale: true, liveLivello: true, aggiornatoIl: true },
      orderBy: { ora: 'asc' }
    }),
    prisma.sessioneAllenamento.findMany({
      where: { utenteId, dataFine: { not: null } },
      select: { dataInizio: true },
      orderBy: { dataInizio: 'desc' },
      take: 10
    })
  ]);
  if (righe.length === 0) return null;

  const oreAbituali = sessioni.map(s => orarioLocale(s.dataInizio).ora).sort((a, b) => a - b);
  const mediana = oreAbituali.length >= 3 ? oreAbituali[Math.floor(oreAbituali.length / 2)] : null;
  const fascia = mediana == null
    ? FASCIA_PREDEFINITA
    : { da: Math.max(6, mediana - 2), a: Math.min(ORA_ULTIMA, mediana + 2) };

  const fra = (da, a) => righe.filter(r => r.ora >= da && r.ora <= a);
  let scelte = fra(Math.max(ora, fascia.da), fascia.a);
  let riferimento = mediana ?? ora;
  if (scelte.length === 0) {
    scelte = fra(ora, Math.min(ORA_ULTIMA, ora + 4));
    riferimento = ora;
  }
  // A few points of crowding are not worth an hour of waiting: among the hours
  // almost as quiet as the best one, the closest to the usual hour wins
  // (or to now, if the usual window has already passed)
  const minimo = Math.min(...scelte.map(r => r.livelloPercentuale));
  const migliore = scelte
    .filter(r => r.livelloPercentuale <= minimo + SCARTO_TOLLERATO)
    .sort((x, y) => Math.abs(x.ora - riferimento) - Math.abs(y.ora - riferimento) || x.ora - y.ora)[0];

  const attuale = righe.find(r => r.ora === ora);
  const live = attuale?.liveLivello != null && attuale.aggiornatoIl &&
    adesso - attuale.aggiornatoIl <= LIMITE_FRESCHEZZA_LIVE_MS;

  return {
    consigliato: migliore ? { ora: migliore.ora, livello: migliore.livelloPercentuale } : null,
    adesso: attuale ? { ora, livello: live ? attuale.liveLivello : attuale.livelloPercentuale, live: Boolean(live) } : null,
    fascia,
    abitudine: mediana != null,
    ore: righe.map(r => ({ ora: r.ora, livello: r.livelloPercentuale }))
  };
}

/**
 * GET /api/v1/pianificazione/oggi — The workouts still to do today
 *
 * Feeds the reminder that shows up when the app opens: what is waiting for you,
 * the best time to go and, if you had already started it, the workout to
 * resume instead of starting it over.
 */
export async function allenamentiDiOggi(req, res, next) {
  try {
    res.json({ successo: true, dati: await riepilogoDiOggi(req.utente.id) });
  } catch (errore) {
    next(errore);
  }
}

/** The content of /oggi, with the current instant as a parameter so it can be tested. */
export async function riepilogoDiOggi(utenteId, adesso = new Date()) {
  const oggi = giornoLocale(adesso);

  const piani = await prisma.allenamentoPianificato.findMany({
    where: { utenteId, data: oggi, stato: 'PIANIFICATO' },
    select: {
      id: true,
      scheda: {
        select: {
          id: true, titolo: true,
          esercizi: { select: { serieTarget: true, esercizio: { select: { gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } } } }
        }
      }
    },
    orderBy: { id: 'asc' }
  });
  if (piani.length === 0) return { data: daData(oggi), allenamenti: [], orario: null };

  const [utente, sessioni] = await Promise.all([
    prisma.utente.findUnique({ where: { id: utenteId }, select: { palestraId: true } }),
    prisma.sessioneAllenamento.findMany({
      where: { utenteId, schedaId: { in: piani.map(p => p.scheda.id) } },
      select: { id: true, schedaId: true, dataInizio: true, dataFine: true, durataMinuti: true },
      orderBy: { dataInizio: 'desc' },
      take: 30
    })
  ]);

  const allenamenti = piani.map(p => {
    const diQuesta = sessioni.filter(s => s.schedaId === p.scheda.id);
    const inCorso = diQuesta.find(s => !s.dataFine && giornoLocale(s.dataInizio).getTime() === oggi.getTime());
    // A workout of a few minutes is a test, not the plan's duration
    const ultima = diQuesta.find(s => s.dataFine && s.durataMinuti >= 10);
    return {
      id: p.id,
      scheda: { id: p.scheda.id, titolo: p.scheda.titolo },
      gruppi: gruppiDellaScheda(p.scheda.esercizi),
      esercizi: p.scheda.esercizi.length,
      sessioneInCorso: inCorso?.id ?? null,
      ultimaVolta: ultima ? { data: ultima.dataInizio, durataMinuti: ultima.durataMinuti } : null
    };
  });

  return { data: daData(oggi), allenamenti, orario: await orarioConsigliato(utenteId, utente?.palestraId, adesso) };
}

/** POST /api/v1/pianificazione — Schedules a single workout */
export async function creaPianificato(req, res, next) {
  try {
    const { schedaId, data, note, utenteId: bersaglio } = req.body;
    const utenteId = await risolviAgenda(req.utente, bersaglio);
    const idScheda = await verificaScheda(schedaId, utenteId);
    const giorno = aData(data);

    const creato = await prisma.allenamentoPianificato.upsert({
      where: { utenteId_data_schedaId: { utenteId, data: giorno, schedaId: idScheda } },
      update: { note: note ?? null },
      create: { utenteId, schedaId: idScheda, data: giorno, note: note ?? null, creatoDaId: req.utente.id },
      include: INCLUDI_SCHEDA
    });

    // If someone else scheduled it (typically the personal trainer), the user
    // must be told: otherwise the workout would show up in their calendar
    // without them knowing. No notification when users schedule for themselves.
    if (utenteId !== req.utente.id) {
      await creaNotifica(req.app.get('io'), utenteId, {
        tipo: 'ALLENAMENTO_PIANIFICATO',
        titolo: 'Nuovo allenamento in calendario',
        messaggio: `${creato.scheda.titolo} — ${daData(creato.data)}`,
        percorso: '/pianificazione'
      });
    }

    res.status(201).json({ successo: true, dati: { ...creato, data: daData(creato.data) } });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/pianificazione/settimanale — Spreads several plans over the week
 *
 * The typical use case: three different plans on Monday, Wednesday and Friday,
 * repeated for a few weeks. Creates the actual occurrences, skipping dates
 * already past and those already in the calendar.
 */
export async function creaPianificazioneSettimanale(req, res, next) {
  try {
    const { voci, dataInizio, settimane = 4, utenteId: bersaglio } = req.body;
    const utenteId = await risolviAgenda(req.utente, bersaglio);

    if (!Array.isArray(voci) || voci.length === 0) {
      throw new ErroreValidazione('Serve almeno una voce { schedaId, giornoSettimana }');
    }
    const nSettimane = parseInt(settimane, 10);
    if (Number.isNaN(nSettimane) || nSettimane < 1 || nSettimane > MAX_SETTIMANE) {
      throw new ErroreValidazione(`Campo "settimane" deve essere fra 1 e ${MAX_SETTIMANE}`);
    }
    const inizio = aData(dataInizio, 'dataInizio');

    // Validate all the entries before writing: either everything is scheduled or nothing
    const vociValide = [];
    for (const voce of voci) {
      const giorno = parseInt(voce.giornoSettimana, 10);
      if (!GIORNI_VALIDI.includes(giorno)) {
        throw new ErroreValidazione('Campo "giornoSettimana" deve essere fra 0 (lunedì) e 6 (domenica)');
      }
      vociValide.push({ schedaId: await verificaScheda(voce.schedaId, utenteId), giornoSettimana: giorno });
    }

    // Monday of the week dataInizio falls in
    const lunedi = new Date(inizio);
    lunedi.setUTCDate(lunedi.getUTCDate() - giornoSettimanaUTC(inizio));

    const daCreare = [];
    for (let settimana = 0; settimana < nSettimane; settimana++) {
      for (const voce of vociValide) {
        const giorno = new Date(lunedi);
        giorno.setUTCDate(lunedi.getUTCDate() + settimana * 7 + voce.giornoSettimana);
        // Dates before the requested start belong to the past
        if (giorno < inizio) continue;
        daCreare.push({ utenteId, schedaId: voce.schedaId, data: giorno, creatoDaId: req.utente.id });
      }
    }

    // skipDuplicates leaves what is already in the calendar untouched instead of failing
    const esito = await prisma.allenamentoPianificato.createMany({ data: daCreare, skipDuplicates: true });

    if (utenteId !== req.utente.id && esito.count > 0) {
      await creaNotifica(req.app.get('io'), utenteId, {
        tipo: 'ALLENAMENTO_PIANIFICATO',
        titolo: 'Il tuo programma è stato aggiornato',
        messaggio: `${esito.count} allenamenti aggiunti al calendario da ${req.utente.nome || 'il tuo trainer'}`,
        percorso: '/pianificazione'
      });
    }

    res.status(201).json({
      successo: true,
      dati: { creati: esito.count, richiesti: daCreare.length, giaPresenti: daCreare.length - esito.count }
    });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/pianificazione/:id — Moves, postpones or changes status */
export async function aggiornaPianificato(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const esistente = await prisma.allenamentoPianificato.findUnique({
      where: { id },
      select: { id: true, utenteId: true, data: true, schedaId: true }
    });
    if (!esistente) throw new ErroreNonTrovato('Allenamento pianificato non trovato');
    await risolviAgenda(req.utente, esistente.utenteId);

    const dati = {};

    // Move: an absolute date, or an offset in days ("postpone by 1")
    if (req.body.data !== undefined) {
      dati.data = aData(req.body.data);
    } else if (req.body.rimandaGiorni !== undefined) {
      const giorni = parseInt(req.body.rimandaGiorni, 10);
      if (Number.isNaN(giorni) || giorni === 0 || Math.abs(giorni) > 365) {
        throw new ErroreValidazione('Campo "rimandaGiorni" deve essere un numero di giorni diverso da zero');
      }
      const nuova = new Date(esistente.data);
      nuova.setUTCDate(nuova.getUTCDate() + giorni);
      dati.data = nuova;
    }

    if (req.body.stato !== undefined) {
      if (!['PIANIFICATO', 'COMPLETATO', 'SALTATO'].includes(req.body.stato)) {
        throw new ErroreValidazione('Stato non valido');
      }
      dati.stato = req.body.stato;
    }

    if (req.body.note !== undefined) dati.note = req.body.note || null;

    if (Object.keys(dati).length === 0) {
      throw new ErroreValidazione('Nessun campo da aggiornare');
    }

    // Moving to a day that already has the same plan would break the unique
    // constraint: a clear message is better than a Prisma 500 error.
    if (dati.data) {
      const collisione = await prisma.allenamentoPianificato.findFirst({
        where: { utenteId: esistente.utenteId, data: dati.data, schedaId: esistente.schedaId, id: { not: id } },
        select: { id: true }
      });
      if (collisione) throw new ErroreValidazione('Questa scheda è già in calendario in quel giorno');
    }

    const aggiornato = await prisma.allenamentoPianificato.update({
      where: { id },
      data: dati,
      include: INCLUDI_SCHEDA
    });

    res.json({ successo: true, dati: { ...aggiornato, data: daData(aggiornato.data) } });
  } catch (errore) {
    next(errore);
  }
}

/** DELETE /api/v1/pianificazione/:id — Removes the workout from the calendar */
export async function eliminaPianificato(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const esistente = await prisma.allenamentoPianificato.findUnique({
      where: { id },
      select: { id: true, utenteId: true }
    });
    if (!esistente) throw new ErroreNonTrovato('Allenamento pianificato non trovato');
    await risolviAgenda(req.utente, esistente.utenteId);

    await prisma.allenamentoPianificato.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Allenamento rimosso dal calendario' });
  } catch (errore) {
    next(errore);
  }
}
