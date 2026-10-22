// ============================================
// GymMaster — Workout sessions controller
// Start, completion and set logs
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione, ErroreNonAutorizzato, ErroreConflitto } from '../utils/errori.js';
import { fusoCorrente, giornoLocale } from '../utils/date.js';
import { fusoDiUtenteId } from '../i18n/destinatario.js';
import { t, localeDi } from '../i18n/index.js';
import {
  concludiSessione, chiudiAperta, controllaRecord, riapribileFinoA, STATI_DA_CHIUDERE, RIAPERTURA_MAX_MINUTI
} from '../services/conclusioneSessione.service.js';
import { titoloAllenamento } from '../utils/titoloAllenamento.js';
import { SOLO_LAVORO, diLavoro, volumeDi, leggiTipo, ordineSerie } from '../utils/tipiSerie.js';

/** List of the user's workouts */
export async function listaSessioni(req, res, next) {
  try {
    const { limite = 20, pagina = 1 } = req.query;

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: { utenteId: req.utente.id },
      include: {
        scheda: { select: { id: true, titolo: true } },
        _count: { select: { logSerie: { where: { completato: true, ...SOLO_LAVORO } } } }
      },
      orderBy: { dataInizio: 'desc' },
      take: parseInt(limite),
      skip: (parseInt(pagina) - 1) * parseInt(limite)
    });

    res.json({ successo: true, dati: sessioni });
  } catch (errore) { next(errore); }
}

// What a workout's history entry needs: used by the list and by the edit,
// which returns the corrected workout ready to show
const INCLUDI_STORICO = {
  scheda: {
    select: {
      id: true,
      titolo: true,
      esercizi: {
        select: { id: true },
        // Only to count the exercises
      }
    }
  },
  logSerie: {
    where: { completato: true },
    include: {
      esercizio: {
        select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true }
      }
    },
    orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }]
  },
  // The sets done: warm-up sets, drop sets and skipped sets do not count
  _count: { select: { logSerie: { where: { completato: true, ...SOLO_LAVORO } } } }
};

/** A workout read with INCLUDI_STORICO, with the logs grouped by exercise */
export function formattaPerStorico(s) {
  const eserciziRaggruppati = {};
  s.logSerie.forEach(log => {
    if (!eserciziRaggruppati[log.esercizioId]) {
      eserciziRaggruppati[log.esercizioId] = {
        esercizio: log.esercizio,
        serie: []
      };
    }
    eserciziRaggruppati[log.esercizioId].serie.push({
      id: log.id,
      serieNumero: log.serieNumero,
      tipo: log.tipo,
      pesoEffettivo: log.pesoEffettivo,
      repEffettive: log.repEffettive,
      rpe: log.rpe,
      durataMinuti: log.durataMinuti,
      livelloResistenza: log.livelloResistenza,
      distanzaKm: log.distanzaKm,
      velocitaKmh: log.velocitaKmh
    });
  });
  // Warm-up, then each working set with its drop sets
  for (const gruppo of Object.values(eserciziRaggruppati)) gruppo.serie.sort(ordineSerie);

  return {
    id: s.id,
    dataInizio: s.dataInizio,
    dataFine: s.dataFine,
    durataMinuti: s.durataMinuti,
    minutiRiscaldamento: s.minutiRiscaldamento,
    volumeTotaleKg: s.volumeTotaleKg,
    noteFinali: s.noteFinali,
    chiusaAutomaticamente: s.chiusaAutomaticamente,
    // Until when "Riprendi" is offered (the request runs in the user's time zone)
    riapribileFinoA: riapribileFinoA(s),
    // A free workout has no plan: its name is `titolo`
    scheda: s.scheda && {
      id: s.scheda.id,
      titolo: s.scheda.titolo,
      numEsercizi: s.scheda.esercizi?.length || 0
    },
    titolo: titoloAllenamento(s),
    serieCompletate: s._count.logSerie,
    esercizi: Object.values(eserciziRaggruppati)
  };
}

/** Full workout history with log details for each exercise */
export async function storicoSessioniCompleto(req, res, next) {
  try {
    const { limite = 15, pagina = 1, schedaId } = req.query;
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const take = parseInt(limite);

    // Base filter: only the user's completed workouts
    const where = {
      utenteId: req.utente.id,
      dataFine: { not: null }
    };

    // Optional filter by plan
    if (schedaId) {
      where.schedaId = parseInt(schedaId);
    }

    // Total count for pagination
    const totale = await prisma.sessioneAllenamento.count({ where });

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where,
      include: INCLUDI_STORICO,
      orderBy: { dataInizio: 'desc' },
      take,
      skip
    });

    const sessioniFormattate = sessioni.map(formattaPerStorico);

    res.json({
      successo: true,
      dati: sessioniFormattate,
      paginazione: {
        totale,
        pagina: parseInt(pagina),
        limite: take,
        pagine: Math.ceil(totale / take)
      }
    });
  } catch (errore) { next(errore); }
}

/** Fetches the data of the last completed workout for a given plan */
export async function ultimaSessioneScheda(req, res, next) {
  try {
    const schedaId = parseInt(req.params.schedaId);

    // Find the last completed workout for this plan
    const ultimaSessione = await prisma.sessioneAllenamento.findFirst({
      where: {
        utenteId: req.utente.id,
        schedaId,
        dataFine: { not: null }
      },
      include: {
        logSerie: {
          where: { completato: true },
          include: {
            esercizio: {
              select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true }
            }
          },
          orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }]
        }
      },
      orderBy: { dataInizio: 'desc' }
    });

    if (!ultimaSessione) {
      return res.json({ successo: true, dati: null });
    }

    // Group the logs by esercizioId for quick access from the frontend
    const logPerEsercizio = {};
    ultimaSessione.logSerie.forEach(log => {
      if (!logPerEsercizio[log.esercizioId]) {
        logPerEsercizio[log.esercizioId] = {
          esercizio: log.esercizio,
          serie: []
        };
      }
      logPerEsercizio[log.esercizioId].serie.push({
        serieNumero: log.serieNumero,
        pesoEffettivo: log.pesoEffettivo,
        repEffettive: log.repEffettive,
        rpe: log.rpe,
        durataMinuti: log.durataMinuti,
        livelloResistenza: log.livelloResistenza
      });
    });

    res.json({
      successo: true,
      dati: {
        id: ultimaSessione.id,
        dataInizio: ultimaSessione.dataInizio,
        dataFine: ultimaSessione.dataFine,
        durataMinuti: ultimaSessione.durataMinuti,
        volumeTotaleKg: ultimaSessione.volumeTotaleKg,
        logPerEsercizio
      }
    });
  } catch (errore) { next(errore); }
}

/** The sessions of each exercise that "last loads" returns, most recent first */
const SEDUTE_PER_ESERCIZIO = 4;

/**
 * Last time's loads for each exercise, in any plan.
 * The ongoing workout uses them to suggest which weight to start from: with a
 * new plan there is no last workout of the same plan, but the exercise may
 * have already been done elsewhere.
 *
 * Query: esercizi=1,2,3 · escludi=<id of the ongoing workout>
 * Response: { [esercizioId]: { sessioneId, data, serie: [...], storico: [{ sessioneId, data, serie }] } }
 */
export async function ultimiCarichi(req, res, next) {
  try {
    const ids = String(req.query.esercizi || '')
      .split(',')
      .map(n => parseInt(n))
      .filter(Number.isInteger)
      .slice(0, 50);
    if (ids.length === 0) return res.json({ successo: true, dati: {} });
    const escludi = parseInt(req.query.escludi);

    const serie = await prisma.logSerie.findMany({
      where: {
        esercizioId: { in: ids },
        completato: true,
        // The last time and the progression look at the working sets
        ...SOLO_LAVORO,
        sessione: {
          utenteId: req.utente.id,
          ...(Number.isInteger(escludi) ? { id: { not: escludi } } : {})
        }
      },
      select: {
        esercizioId: true, sessioneId: true, serieNumero: true,
        pesoEffettivo: true, repEffettive: true, rpe: true,
        durataMinuti: true, livelloResistenza: true,
        sessione: { select: { dataInizio: true } }
      },
      orderBy: [{ sessione: { dataInizio: 'desc' } }, { serieNumero: 'asc' }, { id: 'asc' }]
    });

    // The rows come from the most recent workout first. For each exercise:
    // sessioneId, date and sets of the last time, and in storico the last
    // SEDUTE_PER_ESERCIZIO times, which the load progression needs
    // (three times in a row below the rep range: deload).
    const risultato = {};
    for (const s of serie) {
      const voce = risultato[s.esercizioId] ??= { storico: [] };
      let seduta = voce.storico.at(-1);
      if (seduta?.sessioneId !== s.sessioneId) {
        if (voce.storico.length === SEDUTE_PER_ESERCIZIO) continue;
        seduta = { sessioneId: s.sessioneId, data: s.sessione.dataInizio, serie: [] };
        voce.storico.push(seduta);
      }
      seduta.serie.push({
        serieNumero: s.serieNumero,
        pesoEffettivo: s.pesoEffettivo,
        repEffettive: s.repEffettive,
        rpe: s.rpe,
        durataMinuti: s.durataMinuti,
        livelloResistenza: s.livelloResistenza
      });
    }
    for (const voce of Object.values(risultato)) Object.assign(voce, voce.storico[0], { storico: voce.storico });

    res.json({ successo: true, dati: risultato });
  } catch (errore) { next(errore); }
}

/**
 * The user's open workouts, the most recent first: what the app shows to
 * resume it (the bar "Allenamento in corso", the choice before starting another)
 */
async function sessioniAperte(utenteId) {
  const aperte = await prisma.sessioneAllenamento.findMany({
    where: { utenteId, dataFine: null },
    orderBy: { dataInizio: 'desc' },
    select: {
      id: true, dataInizio: true, titolo: true,
      scheda: { select: { id: true, titolo: true } },
      _count: { select: { logSerie: { where: { completato: true, ...SOLO_LAVORO } } } }
    }
  });
  return aperte.map(({ _count, ...aperta }) => ({ ...aperta, serie: _count.logSerie }));
}

/** GET /api/v1/sessioni/in-corso — The open workout to resume, if any (the most recent) */
export async function sessioneInCorso(req, res, next) {
  try {
    const [aperta = null] = await sessioniAperte(req.utente.id);
    res.json({ successo: true, dati: aperta });
  } catch (errore) { next(errore); }
}

/**
 * Starts a new workout.
 * With another one still open the answer is 409 ALLENAMENTO_IN_CORSO, with
 * that workout in `dettagli.sessione`: the app asks whether to resume it.
 * With `chiudiAperte: true` the open ones are closed first (at their last set
 * if they were left idle; deleted if they have no sets), then the new one starts.
 */
export async function avviaSessione(req, res, next) {
  try {
    const { schedaId, minutiRiscaldamento, chiudiAperte } = req.body;
    if (!schedaId) throw new ErroreValidazione(t('sessioniController.schedaIdObbligatorio'));

    // Check that the plan exists
    const scheda = await prisma.schedaAllenamento.findUnique({
      where: { id: parseInt(schedaId) },
      include: {
        esercizi: {
          include: {
            esercizio: {
              include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } }
            }
          },
          orderBy: { ordineEsecuzione: 'asc' }
        }
      }
    });

    if (!scheda) throw new ErroreNonTrovato(t('sessioniController.schedaNonTrovata'));
    // As for the plan details: one's own (including those assigned by the
    // personal trainer, who puts them in the client's name) and global ones
    if (scheda.creatoreId !== req.utente.id && scheda.visibilita !== 'GLOBALE') {
      throw new ErroreNonAutorizzato(t('sessioniController.schedaNonAccessibile'));
    }

    // Starting over is how forgotten workouts piled up: first, the open one
    const aperte = await sessioniAperte(req.utente.id);
    if (aperte.length > 0 && chiudiAperte !== true) {
      throw new ErroreConflitto(t('sessioniController.allenamentoInCorso'), {
        codice: 'ALLENAMENTO_IN_CORSO',
        dettagli: { sessione: aperte[0] }
      });
    }
    for (const { id } of aperte) await chiudiAperta(id);

    const sessione = await prisma.sessioneAllenamento.create({
      data: {
        utenteId: req.utente.id,
        schedaId: parseInt(schedaId),
        dataInizio: new Date(),
        minutiRiscaldamento: minutiRiscaldamento || null
      },
      include: {
        scheda: {
          include: {
            esercizi: {
              include: {
                esercizio: {
                  include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } }
                }
              },
              orderBy: { ordineEsecuzione: 'asc' }
            }
          }
        }
      }
    });

    res.status(201).json({ successo: true, dati: sessione });
  } catch (errore) { next(errore); }
}

/** Workout details with all the logs */
export async function dettaglioSessione(req, res, next) {
  try {
    const sessione = await prisma.sessioneAllenamento.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        scheda: {
          include: {
            esercizi: {
              include: {
                esercizio: {
                  include: { attrezzatura: { select: { id: true, nome: true, categoria: true } } }
                }
              },
              orderBy: { ordineEsecuzione: 'asc' }
            }
          }
        },
        logSerie: {
          include: {
            esercizio: {
              select: {
                id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true,
                attrezzatura: { select: { id: true, nome: true, categoria: true } }
              }
            }
          },
          orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }]
        }
      }
    });

    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiAccedere'));
    }
    res.json({ successo: true, dati: sessione });
  } catch (errore) { next(errore); }
}

/**
 * PATCH /sessioni/:id/completa — "Termina" (finish): volume, calendar and
 * records in services/conclusioneSessione.service.js. If the workout had been
 * left open for hours, it ends at the last set and the response says so
 * (dimenticata).
 */
/**
 * The time zone of a workout's owner, for its calendar day: the request's,
 * unless a superadmin is acting on someone else's workout
 */
function fusoDelProprietario(sessione, req) {
  return sessione.utenteId === req.utente.id ? fusoCorrente() : fusoDiUtenteId(sessione.utenteId);
}

export async function completaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { noteFinali, conclusaIl } = req.body;

    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id } });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiModificare'));
    }

    // "Termina" tapped without a network arrives when the connection is back:
    // what counts is the time it was tapped, not the time it arrived
    const adesso = conclusaIl != null ? orarioDalTelefono(conclusaIl, sessione.dataInizio) : undefined;
    const fuso = await fusoDelProprietario(sessione, req);
    const { sessione: aggiornata, recordPersonali, dimenticata } = await concludiSessione(sessione, { noteFinali, adesso, fuso });

    res.json({
      successo: true,
      dati: aggiornata,
      recordPersonali,
      dimenticata
    });
  } catch (errore) { next(errore); }
}

/**
 * The exercises of a new plan taken from a finished workout: those with at
 * least one completed set, in the order you started them, with the sets done
 * and the reps (a number, or "min-max" if they changed). Rest, notes and
 * warm-up come from the plan followed, if the exercise was in it; for the
 * exercises without reps (cardio), the values of the last set.
 */
export function eserciziDaSessione(logSerie, eserciziScheda = []) {
  const dallaScheda = new Map(eserciziScheda.map(e => [e.esercizioId, e]));
  const perEsercizio = new Map();
  for (const serie of [...logSerie].sort((a, b) => a.id - b.id)) {
    // The new plan has the working sets: warm-up and drop sets stay out
    if (!serie.completato || !diLavoro(serie)) continue;
    if (!perEsercizio.has(serie.esercizioId)) perEsercizio.set(serie.esercizioId, []);
    perEsercizio.get(serie.esercizioId).push(serie);
  }

  return [...perEsercizio].map(([esercizioId, serie], i) => {
    const origine = dallaScheda.get(esercizioId);
    const rep = serie.map(s => s.repEffettive).filter(n => n > 0);
    const senzaRep = rep.length === 0;
    const minimo = Math.min(...rep);
    const massimo = Math.max(...rep);
    const ultima = serie.at(-1);
    return {
      esercizioId,
      serieTarget: serie.length,
      repTarget: senzaRep ? null : minimo === massimo ? String(minimo) : `${minimo}-${massimo}`,
      recuperoSecondi: origine?.recuperoSecondi ?? 90,
      ordineEsecuzione: i + 1,
      note: origine?.note ?? null,
      riscaldamento: origine?.riscaldamento ?? false,
      durataMinuti: senzaRep ? ultima.durataMinuti : null,
      velocitaKmh: senzaRep ? ultima.velocitaKmh : null,
      inclinazione: senzaRep ? ultima.inclinazione : null,
      livelloResistenza: senzaRep ? ultima.livelloResistenza : null,
      distanzaKm: senzaRep ? ultima.distanzaKm : null
    };
  });
}

const TITOLO_SCHEDA_MAX = 100;

/**
 * POST /sessioni/:id/scheda — Saves a finished workout as a new personal
 * plan: the exercises actually done, in order, with that day's sets and reps.
 * For when the plan changed along the way at the gym (exercises added or
 * skipped, extra sets) and the right version is the one that was done.
 */
export async function salvaComeScheda(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErroreValidazione(t('sessioniController.sessioneNonValida'));
    const { titolo } = req.body || {};
    if (titolo != null && typeof titolo !== 'string') throw new ErroreValidazione(t('sessioniController.titoloNonTesto'));
    const titoloScelto = titolo?.trim();
    if (titoloScelto && titoloScelto.length > TITOLO_SCHEDA_MAX) {
      throw new ErroreValidazione(t('sessioniController.titoloTroppoLungo', { max: TITOLO_SCHEDA_MAX }));
    }

    const sessione = await prisma.sessioneAllenamento.findUnique({
      where: { id },
      include: {
        logSerie: true,
        scheda: { select: { titolo: true, livello: true, esercizi: true } }
      }
    });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id) {
      throw new ErroreNonAutorizzato(t('sessioniController.soloTuoiAllenamenti'));
    }
    if (!sessione.dataFine) throw new ErroreValidazione(t('sessioniController.primaConcludi'));

    // A free workout: the exercises from its sets alone
    const esercizi = eserciziDaSessione(sessione.logSerie, sessione.scheda?.esercizi ?? []);
    if (!esercizi.length) throw new ErroreValidazione(t('sessioniController.nessunaSerieDaSalvare'));

    // The plan's title and description are saved in the language of the request
    const data = (opzioni) => sessione.dataInizio.toLocaleDateString(localeDi(), { timeZone: fusoCorrente(), ...opzioni });
    const suffisso = ` (${data({ day: 'numeric', month: 'short' })})`;
    const scheda = await prisma.schedaAllenamento.create({
      data: {
        titolo: titoloScelto || titoloAllenamento(sessione).slice(0, TITOLO_SCHEDA_MAX - suffisso.length) + suffisso,
        descrizione: t('sessioniController.descrizioneSchedaDaSessione', { data: data({ day: 'numeric', month: 'long', year: 'numeric' }) }),
        livello: sessione.scheda?.livello ?? 'BASE',
        visibilita: 'PERSONALE',
        creatoreId: req.utente.id,
        esercizi: { create: esercizi }
      },
      select: { id: true, titolo: true }
    });

    res.status(201).json({ successo: true, dati: scheda });
  } catch (errore) { next(errore); }
}

/**
 * PATCH /sessioni/:id/riapri — "I closed it by mistake": the workout just
 * finished goes back to ongoing, and the next close recalculates its duration,
 * volume and records. Only within half an hour of the end, or until the end
 * of the day for one the server closed because it was forgotten open
 * (riapribileFinoA): a workout from days ago is corrected from the history,
 * not reopened.
 */
export async function riapriSessione(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErroreValidazione(t('sessioniController.sessioneNonValida'));

    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id } });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiModificare'));
    }
    if (!sessione.dataFine) throw new ErroreValidazione(t('sessioniController.ancoraInCorso'));
    if (!sessione.schedaId) throw new ErroreValidazione(t('sessioniController.riaperturaLibero'));
    if (Date.now() > riapribileFinoA(sessione, await fusoDelProprietario(sessione, req)).getTime()) {
      throw new ErroreValidazione(sessione.chiusaAutomaticamente
        ? t('sessioniController.riaperturaScadutaGiorno')
        : t('sessioniController.riaperturaScaduta', { count: RIAPERTURA_MAX_MINUTI }));
    }

    const riaperta = await prisma.$transaction(async (tx) => {
      // The calendar entry marked as done at close goes back to to-do: the
      // next close will mark it again
      await tx.allenamentoPianificato.updateMany({
        where: { sessioneId: id, stato: 'COMPLETATO' },
        data: { stato: 'PIANIFICATO', sessioneId: null }
      });
      // Resuming counts as activity: the server does not close it again as
      // forgotten before two hours without sets
      return tx.sessioneAllenamento.update({
        where: { id },
        data: { dataFine: null, durataMinuti: null, volumeTotaleKg: null, chiusaAutomaticamente: false, riapertaIl: new Date() }
      });
    });

    res.json({ successo: true, dati: riaperta });
  } catch (errore) { next(errore); }
}

/** The key the phone gives to a set (a UUID, or something similar) */
const ID_CLIENT = /^[A-Za-z0-9-]{8,64}$/;

/**
 * An instant written by the phone: when a set was done, when "Termina" was
 * tapped. Without a network it can arrive hours later, so the phone's time is
 * what counts, kept between the start of the workout and now: a clock a bit
 * fast or slow does not push it outside the workout.
 */
export function orarioDalTelefono(valore, dataInizio, adesso = new Date()) {
  const orario = typeof valore === 'string' || typeof valore === 'number' ? new Date(valore) : null;
  if (!orario || Number.isNaN(orario.getTime())) throw new ErroreValidazione(t('sessioniController.orarioNonValido'));
  return new Date(Math.min(Math.max(orario.getTime(), dataInizio.getTime()), adesso.getTime()));
}

/**
 * POST /sessioni/:id/serie — Records a set
 *
 * The phone queues the sets done without a network (utils/codaSerie.js in the
 * frontend) and sends them when the connection is back, each with its key
 * (idClient) and the time it was done (registrataIl). A set that already
 * arrived is not recorded twice: if the first response got lost, the phone
 * retries and receives the one already saved.
 */
export async function logSerie(req, res, next) {
  try {
    const sessioneId = parseInt(req.params.id);
    const {
      esercizioId, serieNumero, pesoEffettivo, repEffettive, rpe, completato, motivoSaltoEsercizio, noteSerie,
      distanzaKm, durataMinuti, livelloResistenza, velocitaKmh, inclinazione, idClient, registrataIl, tipo
    } = req.body;

    if (!esercizioId || !serieNumero) {
      throw new ErroreValidazione(t('sessioniController.esercizioESerieObbligatori'));
    }
    const tipoSerie = leggiTipo(tipo);
    if (idClient != null && (typeof idClient !== 'string' || !ID_CLIENT.test(idClient))) {
      throw new ErroreValidazione(t('sessioniController.idClientNonValido'));
    }

    // Check that the workout belongs to the user before recording the set
    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id: sessioneId } });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiRegistrareSerie'));
    }

    const includi = { esercizio: { include: { attrezzatura: { select: { categoria: true } } } } };
    const giaArrivata = () => prisma.logSerie.findUnique({
      where: { sessioneId_idClient: { sessioneId, idClient } },
      include: includi
    });
    if (idClient) {
      const arrivata = await giaArrivata();
      if (arrivata) return res.json({ successo: true, dati: arrivata });
    }

    let log;
    try {
      log = await prisma.logSerie.create({
        data: {
          sessioneId,
          esercizioId: parseInt(esercizioId),
          serieNumero: parseInt(serieNumero),
          tipo: tipoSerie,
          pesoEffettivo: parseFloat(pesoEffettivo) || 0,
          repEffettive: parseInt(repEffettive) || 0,
          rpe: rpe ? parseInt(rpe) : null,
          completato: completato !== false,
          motivoSaltoEsercizio: motivoSaltoEsercizio || null,
          noteSerie: noteSerie || null,
          distanzaKm: distanzaKm ? parseFloat(distanzaKm) : null,
          durataMinuti: durataMinuti ? parseInt(durataMinuti) : null,
          livelloResistenza: livelloResistenza ? parseInt(livelloResistenza) : null,
          velocitaKmh: velocitaKmh ? parseFloat(velocitaKmh) : null,
          inclinazione: inclinazione ? parseFloat(inclinazione) : null,
          idClient: idClient || null,
          ...(registrataIl != null && { registrataIl: orarioDalTelefono(registrataIl, sessione.dataInizio) })
        },
        include: includi
      });
    } catch (errore) {
      // Two sends of the same set at the same instant: one gets through
      if (errore.code !== 'P2002' || !idClient) throw errore;
      return res.json({ successo: true, dati: await giaArrivata() });
    }

    // Arrived after the workout was already closed (by the server's check,
    // while the phone had no network): close it again counting this set too,
    // so duration, volume and records include it
    if (sessione.dataFine) {
      await concludiSessione(sessione, {
        adesso: new Date(Math.max(sessione.dataFine.getTime(), log.registrataIl.getTime()))
      });
    }

    res.status(201).json({ successo: true, dati: log });
  } catch (errore) { next(errore); }
}

/** Deletes a workout */
export async function eliminaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id } });

    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiEliminare'));
    }

    // The schema already deletes the LogSerie rows (onDelete: Cascade); deleting
    // them explicitly, in the same transaction, does not depend on it:
    await prisma.$transaction([
      prisma.logSerie.deleteMany({ where: { sessioneId: id } }),
      prisma.sessioneAllenamento.delete({ where: { id } })
    ]);

    res.json({ successo: true, messaggio: t('sessioniController.sessioneEliminata') });
  } catch (errore) { next(errore); }
}

// Common-sense limits for a workout entered or corrected afterwards
const DURATA_MIN = 1;
const DURATA_MAX = 600;          // 10 hours
const ANNI_INDIETRO_MAX = 2;
const TOLLERANZA_FUTURO_MS = 5 * 60 * 1000;  // clock drift between client and server

/**
 * Start of a workout stated by the client. It arrives as a full instant with
 * its time zone: this way the saved time is when the user actually trained,
 * not the server's time.
 */
export function leggiInizio(valore) {
  const inizio = new Date(valore);
  if (Number.isNaN(inizio.getTime())) throw new ErroreValidazione(t('sessioniController.dataNonValida'));

  if (inizio.getTime() > Date.now() + TOLLERANZA_FUTURO_MS) {
    throw new ErroreValidazione(t('sessioniController.inizioNelFuturo'));
  }
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - ANNI_INDIETRO_MAX);
  if (inizio < limite) {
    throw new ErroreValidazione(t('sessioniController.troppoVecchio', { count: ANNI_INDIETRO_MAX }));
  }
  return inizio;
}

/** Duration in minutes of a workout stated by the client */
export function leggiDurata(valore) {
  const durata = parseInt(valore);
  if (Number.isNaN(durata) || durata < DURATA_MIN || durata > DURATA_MAX) {
    throw new ErroreValidazione(t('sessioniController.durataFuoriLimiti', { min: DURATA_MIN, max: DURATA_MAX }));
  }
  return durata;
}

/**
 * POST /api/v1/sessioni/passata — Records a workout already done
 *
 * The normal flow does not fit: avviaSessione sets the date to "now" and
 * completaSessione takes the duration from the elapsed time, so a backdated
 * workout would turn out days long. Here the workout and its sets are written
 * together, with the stated date and duration.
 *
 * It comes from the real case of someone who trains without a connection
 * following a downloaded plan and records the session on their watch: the
 * data already exists, it only needs to be copied over.
 */
export async function registraSessionePassata(req, res, next) {
  try {
    const { schedaId, dataInizio, durataMinuti, minutiRiscaldamento, noteFinali, serie } = req.body;

    if (!schedaId) throw new ErroreValidazione(t('sessioniController.schedaIdObbligatorio'));
    const idScheda = parseInt(schedaId);
    if (Number.isNaN(idScheda)) throw new ErroreValidazione(t('sessioniController.schedaIdNonValido'));

    const inizio = leggiInizio(dataInizio);
    const durata = leggiDurata(durataMinuti);

    const scheda = await prisma.schedaAllenamento.findUnique({
      where: { id: idScheda },
      select: { id: true, creatoreId: true, visibilita: true }
    });
    if (!scheda) throw new ErroreNonTrovato(t('sessioniController.schedaNonTrovata'));
    if (scheda.creatoreId !== req.utente.id && scheda.visibilita !== 'GLOBALE') {
      throw new ErroreNonAutorizzato(t('sessioniController.schedaNonAccessibile'));
    }

    // The sets are optional: whoever has only the watch summary records date
    // and duration, whoever wrote down the loads adds them.
    const righe = Array.isArray(serie) ? serie : [];
    const preparate = righe.map((r, i) => {
      const esercizioId = parseInt(r.esercizioId);
      const serieNumero = parseInt(r.serieNumero);
      if (Number.isNaN(esercizioId) || Number.isNaN(serieNumero)) {
        throw new ErroreValidazione(t('sessioniController.serie.obbligatori', { n: i + 1 }));
      }
      const peso = r.pesoEffettivo != null ? parseFloat(r.pesoEffettivo) : 0;
      const rep = r.repEffettive != null ? parseInt(r.repEffettive) : 0;
      if (peso < 0 || rep < 0) throw new ErroreValidazione(t('sessioniController.serie.negativi', { n: i + 1 }));
      return {
        esercizioId,
        serieNumero,
        tipo: leggiTipo(r.tipo, prefissoSerie(i + 1)),
        pesoEffettivo: peso,
        repEffettive: rep,
        rpe: r.rpe != null ? parseInt(r.rpe) : null,
        completato: r.completato !== false,
        noteSerie: r.noteSerie || null,
        distanzaKm: r.distanzaKm != null ? parseFloat(r.distanzaKm) : null,
        durataMinuti: r.durataMinuti != null ? parseInt(r.durataMinuti) : null,
        livelloResistenza: r.livelloResistenza != null ? parseInt(r.livelloResistenza) : null,
        velocitaKmh: r.velocitaKmh != null ? parseFloat(r.velocitaKmh) : null,
        inclinazione: r.inclinazione != null ? parseFloat(r.inclinazione) : null
      };
    });

    const volume = volumeDi(preparate);

    const fine = new Date(inizio.getTime() + durata * 60000);

    // Workout and sets together: a half-written workout would be worse than none
    const sessione = await prisma.$transaction(async (tx) => {
      const creata = await tx.sessioneAllenamento.create({
        data: {
          utenteId: req.utente.id,
          schedaId: idScheda,
          dataInizio: inizio,
          dataFine: fine,
          durataMinuti: durata,
          minutiRiscaldamento: minutiRiscaldamento != null ? parseInt(minutiRiscaldamento) : null,
          volumeTotaleKg: Math.round(volume * 10) / 10,
          noteFinali: noteFinali || null
        }
      });

      if (preparate.length > 0) {
        await tx.logSerie.createMany({
          data: preparate.map(r => ({ ...r, sessioneId: creata.id }))
        });
      }

      // If that day was in the calendar, the workout shows as done: this way
      // it does not stay marked as "to do" after being recorded.
      await tx.allenamentoPianificato.updateMany({
        where: { utenteId: req.utente.id, schedaId: idScheda, data: giornoLocale(inizio), stato: { in: STATI_DA_CHIUDERE }, sessioneId: null },
        data: { stato: 'COMPLETATO', sessioneId: creata.id }
      });

      return creata;
    });

    // The records are dated to the day of the workout, not to today
    const recordAggiornati = await controllaRecord(
      req.utente.id,
      preparate.filter(r => r.completato),
      inizio
    );

    res.status(201).json({ successo: true, dati: sessione, recordPersonali: recordAggiornati });
  } catch (errore) { next(errore); }
}

// Values of a set that can be corrected from the history. Weight and reps
// cannot be missing in the database: empty means 0, as for bodyweight.
// `errore` is the translation key of the message, translated when it is thrown.
const CAMPI_SERIE = {
  pesoEffettivo:     { errore: 'sessioniController.serie.pesoNonValido', max: 1000, zeroSeVuoto: true },
  repEffettive:      { errore: 'sessioniController.serie.ripetizioniNonValide', max: 1000, intero: true, zeroSeVuoto: true },
  rpe:               { errore: 'sessioniController.serie.rpeNonValido', min: 1, max: 10, intero: true },
  durataMinuti:      { errore: 'sessioniController.serie.durataNonValida', max: DURATA_MAX, intero: true },
  livelloResistenza: { errore: 'sessioniController.serie.livelloNonValido', max: 1000, intero: true }
};
const SERIE_MAX = 300;

/** The start of a set's error message ("Set 3: "), for helpers that complete it themselves */
const prefissoSerie = n => `${t('sessioniController.prefissoSerie', { n })} `;

/** Values of a received set: a missing field stays as it was, an empty one is cleared. */
export function leggiValoriSerie(riga, n) {
  const valori = {};
  for (const [campo, regola] of Object.entries(CAMPI_SERIE)) {
    const grezzo = riga[campo];
    if (grezzo === undefined) continue;
    if (grezzo === null || grezzo === '') {
      valori[campo] = regola.zeroSeVuoto ? 0 : null;
      continue;
    }
    const v = Number(grezzo);
    if (!Number.isFinite(v) || v < (regola.min ?? 0) || v > regola.max || (regola.intero && !Number.isInteger(v))) {
      throw new ErroreValidazione(t(regola.errore, { n }));
    }
    valori[campo] = v;
  }
  // A set logged wrong at the gym (it was a warm-up) is corrected here
  if (riga.tipo !== undefined) valori.tipo = leggiTipo(riga.tipo, prefissoSerie(n));
  return valori;
}

/**
 * Realigns the personal records after the sets of a workout are corrected.
 *
 * A record born from a wrong weight (800 kg instead of 80) disappears when the
 * set is corrected and no other set reaches it; if the real maximum is left
 * without a record, a new one is created, dated to the workout in which it was
 * lifted. Only records with a weight the workout contained before the edit
 * are deleted: those born from other workouts stay.
 *
 * @param pesiPrima esercizioId → weights of the workout's sets before the edit
 */
async function riallineaRecord(tx, utenteId, pesiPrima) {
  const creati = [];
  for (const [esercizioId, pesi] of pesiPrima) {
    const migliore = await tx.logSerie.findFirst({
      where: { esercizioId, completato: true, ...SOLO_LAVORO, sessione: { utenteId } },
      orderBy: [{ pesoEffettivo: 'desc' }, { sessione: { dataInizio: 'asc' } }],
      select: { pesoEffettivo: true, sessione: { select: { dataInizio: true } } }
    });
    const massimo = migliore?.pesoEffettivo || 0;

    if (pesi.size > 0) {
      await tx.recordPersonale.deleteMany({
        where: { utenteId, esercizioId, pesoMaxRaggiunto: { gt: massimo, in: [...pesi] } }
      });
    }
    if (massimo <= 0) continue;

    const record = await tx.recordPersonale.findFirst({
      where: { utenteId, esercizioId },
      orderBy: { pesoMaxRaggiunto: 'desc' }
    });
    if (!record || massimo > record.pesoMaxRaggiunto) {
      creati.push(await tx.recordPersonale.create({
        data: { utenteId, esercizioId, pesoMaxRaggiunto: massimo, dataRecord: migliore.sessione.dataInizio },
        include: { esercizio: { select: { nome: true, nomeIt: true } } }
      }));
    }
  }
  return creati;
}

/**
 * PATCH /api/v1/sessioni/:id — Corrects a finished workout from the history
 *
 * It comes from a workout left open all night: "Termina" the next morning
 * takes the duration from the elapsed time, more than ten hours, and total
 * hours, duration per day and badges all come out wrong. Before, the only fix
 * was deleting the workout, losing the sets too.
 *
 * Only what arrives changes:
 * - dataInizio, durataMinuti: the end is recalculated from start + duration;
 * - minutiRiscaldamento, noteFinali: null clears them;
 * - serie: the full list of the sets done after the edit, in the order to
 *   show them. Those with an id are updated, those without are added to an
 *   exercise already present, the missing ones are deleted. Skipped sets do
 *   not show in the history and stay as they are.
 * Volume and personal records follow the corrected sets.
 */
export async function modificaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const sessione = await prisma.sessioneAllenamento.findUnique({
      where: { id },
      include: { logSerie: true }
    });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiModificare'));
    }
    // An ongoing one is closed with "Termina": here it would clash with the
    // sets the workout is still recording
    if (!sessione.dataFine) throw new ErroreValidazione(t('sessioniController.soloConcluso'));
    const fuso = await fusoDelProprietario(sessione, req);

    const { dataInizio, durataMinuti, minutiRiscaldamento, noteFinali, serie } = req.body;
    const dati = {};

    if (dataInizio !== undefined || durataMinuti !== undefined) {
      const inizio = dataInizio !== undefined ? leggiInizio(dataInizio) : sessione.dataInizio;
      const durata = durataMinuti !== undefined
        ? leggiDurata(durataMinuti)
        : sessione.durataMinuti ?? Math.round((sessione.dataFine - sessione.dataInizio) / 60000);
      const fine = new Date(inizio.getTime() + durata * 60000);
      if (fine.getTime() > Date.now() + TOLLERANZA_FUTURO_MS) {
        throw new ErroreValidazione(t('sessioniController.fineNelFuturo'));
      }
      Object.assign(dati, { dataInizio: inizio, durataMinuti: durata, dataFine: fine });
    }

    if (minutiRiscaldamento !== undefined) {
      if (minutiRiscaldamento === null || minutiRiscaldamento === '') {
        dati.minutiRiscaldamento = null;
      } else {
        const minuti = Number(minutiRiscaldamento);
        if (!Number.isInteger(minuti) || minuti < 0 || minuti > DURATA_MAX) {
          throw new ErroreValidazione(t('sessioniController.minutiRiscaldamentoNonValidi'));
        }
        dati.minutiRiscaldamento = minuti;
      }
    }

    if (noteFinali !== undefined) {
      dati.noteFinali = typeof noteFinali === 'string' && noteFinali.trim() ? noteFinali.trim() : null;
    }

    // The received sets are compared with the done sets already recorded
    const svolte = sessione.logSerie.filter(l => l.completato);
    let righe = null;
    if (serie !== undefined) {
      if (!Array.isArray(serie)) throw new ErroreValidazione(t('sessioniController.serieDeveEssereElenco'));
      if (serie.length > SERIE_MAX) throw new ErroreValidazione(t('sessioniController.serieMassimo', { max: SERIE_MAX }));
      const perId = new Map(svolte.map(l => [l.id, l]));
      const eserciziSessione = new Set(sessione.logSerie.map(l => l.esercizioId));
      const viste = new Set();
      righe = serie.map((riga, i) => {
        const n = i + 1;
        if (!riga || typeof riga !== 'object') throw new ErroreValidazione(t('sessioniController.serie.nonValida', { n }));
        let esistente = null;
        if (riga.id != null) {
          esistente = perId.get(Number(riga.id));
          if (!esistente || viste.has(esistente.id)) {
            throw new ErroreValidazione(t('sessioniController.serie.altroAllenamento', { n }));
          }
          viste.add(esistente.id);
        }
        const esercizioId = esistente ? esistente.esercizioId : Number(riga.esercizioId);
        if (!esistente && !eserciziSessione.has(esercizioId)) {
          throw new ErroreValidazione(t('sessioniController.serie.soloEserciziPresenti', { n }));
        }
        return { esistente, esercizioId, valori: leggiValoriSerie(riga, n) };
      });
    }

    const { aggiornata, recordPersonali } = await prisma.$transaction(async (tx) => {
      // Exercises whose max weight may have changed, with the weights they
      // had before the edit: needed to realign the records
      const toccati = new Map();
      const tocca = (esercizioId) => {
        if (!toccati.has(esercizioId)) {
          toccati.set(esercizioId, new Set(svolte.filter(l => l.esercizioId === esercizioId).map(l => l.pesoEffettivo)));
        }
      };

      if (righe) {
        const tenute = new Set(righe.filter(r => r.esistente).map(r => r.esistente.id));
        const eliminate = svolte.filter(l => !tenute.has(l.id));
        if (eliminate.length > 0) {
          await tx.logSerie.deleteMany({ where: { id: { in: eliminate.map(l => l.id) }, sessioneId: id } });
          eliminate.forEach(l => tocca(l.esercizioId));
        }

        // Numbering 1..n per exercise in the order received: removing a set
        // recorded twice leaves no gap ("1, 3, 4"). Warm-up sets are numbered
        // on their own, a drop set takes the number of the working set before
        const contatori = new Map();
        let volume = 0;
        for (const r of righe) {
          const conto = contatori.get(r.esercizioId) || { LAVORO: 0, RISCALDAMENTO: 0 };
          contatori.set(r.esercizioId, conto);
          const tipo = r.valori.tipo ?? r.esistente?.tipo ?? 'LAVORO';
          const serieNumero = tipo === 'DROP' ? Math.max(conto.LAVORO, 1) : ++conto[tipo];
          const valori = { ...r.valori, serieNumero };
          if (r.esistente) {
            if (Object.entries(valori).some(([campo, v]) => r.esistente[campo] !== v)) {
              await tx.logSerie.update({ where: { id: r.esistente.id }, data: valori });
            }
            if ((valori.pesoEffettivo !== undefined && valori.pesoEffettivo !== r.esistente.pesoEffettivo) ||
                tipo !== r.esistente.tipo) {
              tocca(r.esercizioId);
            }
          } else {
            await tx.logSerie.create({
              data: { pesoEffettivo: 0, repEffettive: 0, ...valori, sessioneId: id, esercizioId: r.esercizioId, completato: true }
            });
            tocca(r.esercizioId);
          }
          if (tipo !== 'RISCALDAMENTO') {
            volume += (valori.pesoEffettivo ?? r.esistente?.pesoEffettivo ?? 0) *
                      (valori.repEffettive ?? r.esistente?.repEffettive ?? 0);
          }
        }
        dati.volumeTotaleKg = Math.round(volume * 10) / 10;
      }

      const aggiornata = await tx.sessioneAllenamento.update({ where: { id }, data: dati, include: INCLUDI_STORICO });

      // Moved to another day, the workout no longer closes the one scheduled
      // on the old day, but the one on the new day
      if (dati.dataInizio && giornoLocale(dati.dataInizio, fuso).getTime() !== giornoLocale(sessione.dataInizio, fuso).getTime()) {
        await tx.allenamentoPianificato.updateMany({
          where: { sessioneId: id },
          data: { stato: 'PIANIFICATO', sessioneId: null }
        });
        // A free workout has no plan to find in the calendar
        if (sessione.schedaId) {
          await tx.allenamentoPianificato.updateMany({
            where: { utenteId: sessione.utenteId, schedaId: sessione.schedaId, data: giornoLocale(dati.dataInizio, fuso), stato: { in: STATI_DA_CHIUDERE }, sessioneId: null },
            data: { stato: 'COMPLETATO', sessioneId: id }
          });
        }
      }

      // After the workout update: a new record gets the corrected date
      const recordPersonali = await riallineaRecord(tx, sessione.utenteId, toccati);
      return { aggiornata, recordPersonali };
    });

    res.json({ successo: true, dati: formattaPerStorico(aggiornata), recordPersonali });
  } catch (errore) { next(errore); }
}
