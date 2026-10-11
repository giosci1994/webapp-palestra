// ============================================
// GymMaster — Workout plans controller
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import { generaDocxSchede, nomeFileDocumento } from '../services/schedaDocx.service.js';

// Maps an exercise entry (from the client) to EsercizioScheda data, keeping
// the cardio fields (duration/speed/incline/resistance/distance + warm-up).
function mappaEsercizioScheda(e, ordine) {
  return {
    esercizioId: e.esercizioId,
    serieTarget: e.serieTarget != null ? e.serieTarget : 3,
    repTarget: e.repTarget !== undefined ? e.repTarget : '8-12',
    recuperoSecondi: e.recuperoSecondi != null ? e.recuperoSecondi : 90,
    ordineEsecuzione: ordine,
    note: e.note?.trim() || null,
    riscaldamento: !!e.riscaldamento,
    durataMinuti: e.durataMinuti != null ? e.durataMinuti : null,
    velocitaKmh: e.velocitaKmh != null ? e.velocitaKmh : null,
    inclinazione: e.inclinazione != null ? e.inclinazione : null,
    livelloResistenza: e.livelloResistenza != null ? e.livelloResistenza : null,
    distanzaKm: e.distanzaKm != null ? e.distanzaKm : null
  };
}

/** List of the user's plans + global plans */
export async function listaSchede(req, res, next) {
  try {
    const schede = await prisma.schedaAllenamento.findMany({
      where: {
        OR: [
          { creatoreId: req.utente.id, assegnataDaPTId: null },
          { visibilita: 'GLOBALE' }
        ]
      },
      include: {
        creatore: { select: { id: true, nome: true, ruolo: true } },
        esercizi: {
          include: {
            esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } }
          },
          orderBy: { ordineEsecuzione: 'asc' }
        },
        _count: { select: { sessioni: true } }
      },
      orderBy: { creatoIl: 'desc' }
    });

    res.json({ successo: true, dati: schede });
  } catch (errore) { next(errore); }
}

/** Details of a single plan */
export async function dettaglioScheda(req, res, next) {
  try {
    const scheda = await prisma.schedaAllenamento.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        creatore: { select: { id: true, nome: true } },
        esercizi: {
          include: {
            esercizio: {
              include: {
                attrezzatura: { select: { id: true, nome: true, categoria: true } }
              }
            }
          },
          orderBy: { ordineEsecuzione: 'asc' }
        }
      }
    });

    if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');

    // Check access: owner or global plan
    if (scheda.creatoreId !== req.utente.id && scheda.visibilita !== 'GLOBALE') {
      throw new ErroreNonAutorizzato('Non hai accesso a questa scheda');
    }

    res.json({ successo: true, dati: scheda });
  } catch (errore) { next(errore); }
}

/** Creates a new plan */
export async function creaScheda(req, res, next) {
  try {
    const { titolo, descrizione, livello, visibilita, esercizi } = req.body;

    if (!titolo) throw new ErroreValidazione('Il titolo è obbligatorio');

    // Only admins/personal trainers can create global plans
    const vis = visibilita || 'PERSONALE';
    if (vis === 'GLOBALE' && !['SUPERADMIN', 'PERSONAL_TRAINER'].includes(req.utente.ruolo)) {
      throw new ErroreNonAutorizzato('Solo admin e PT possono creare schede globali');
    }

    const scheda = await prisma.schedaAllenamento.create({
      data: {
        titolo,
        descrizione,
        livello: livello || 'BASE',
        visibilita: vis,
        creatoreId: req.utente.id,
        esercizi: esercizi?.length ? {
          create: esercizi.map((e, i) => mappaEsercizioScheda(e, i + 1))
        } : undefined
      },
      include: {
        esercizi: {
          include: { esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
          orderBy: { ordineEsecuzione: 'asc' }
        }
      }
    });

    res.status(201).json({ successo: true, dati: scheda });
  } catch (errore) { next(errore); }
}

/** Clones a plan (global or one's own) as a new personal plan of the user */
export async function clonaScheda(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const sorgente = await prisma.schedaAllenamento.findUnique({
      where: { id },
      include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } }
    });
    if (!sorgente) throw new ErroreNonTrovato('Scheda non trovata');

    // Access: can be cloned only if global or owned by the user
    if (sorgente.visibilita !== 'GLOBALE' && sorgente.creatoreId !== req.utente.id) {
      throw new ErroreNonAutorizzato('Non puoi clonare questa scheda');
    }

    const nuova = await prisma.schedaAllenamento.create({
      data: {
        titolo: `${sorgente.titolo} (copia)`,
        descrizione: sorgente.descrizione,
        livello: sorgente.livello,
        visibilita: 'PERSONALE',
        creatoreId: req.utente.id,
        esercizi: sorgente.esercizi.length ? {
          create: sorgente.esercizi.map((e, i) => mappaEsercizioScheda(e, i + 1))
        } : undefined
      },
      include: {
        esercizi: {
          include: { esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
          orderBy: { ordineEsecuzione: 'asc' }
        }
      }
    });

    res.status(201).json({ successo: true, dati: nuova });
  } catch (errore) { next(errore); }
}

/** Updates a plan */
export async function aggiornaScheda(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const schedaEsistente = await prisma.schedaAllenamento.findUnique({ where: { id } });
    if (!schedaEsistente) throw new ErroreNonTrovato('Scheda non trovata');
    if (schedaEsistente.creatoreId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa scheda');
    }

    const { titolo, descrizione, livello, visibilita, esercizi } = req.body;

    const scheda = await prisma.$transaction(async (tx) => {
      // 1. Update the base data
      await tx.schedaAllenamento.update({
        where: { id },
        data: { titolo, descrizione, livello, visibilita }
      });

      // 2. If exercises are given, recreate them (delete the old ones and add the new ones)
      if (esercizi && Array.isArray(esercizi)) {
        await tx.esercizioScheda.deleteMany({ where: { schedaId: id } });
        
        if (esercizi.length > 0) {
          await tx.esercizioScheda.createMany({
            data: esercizi.map((e, i) => ({ schedaId: id, ...mappaEsercizioScheda(e, i + 1) }))
          });
        }
      }

      // 3. Return the updated plan
      return tx.schedaAllenamento.findUnique({
        where: { id },
        include: {
          esercizi: {
            include: { esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
            orderBy: { ordineEsecuzione: 'asc' }
          }
        }
      });
    });

    res.json({ successo: true, dati: scheda });
  } catch (errore) { next(errore); }
}

/** Deletes a plan */
export async function eliminaScheda(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const scheda = await prisma.schedaAllenamento.findUnique({ where: { id } });
    if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');
    if (scheda.creatoreId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi eliminare questa scheda');
    }

    // Cascade delete in a transaction: LogSerie → Sessioni → Esercizi → Scheda
    await prisma.$transaction(async (tx) => {
      // 1. Delete the set logs of the linked workouts
      await tx.logSerie.deleteMany({
        where: { sessione: { schedaId: id } }
      });
      // 2. Delete the linked workouts
      await tx.sessioneAllenamento.deleteMany({ where: { schedaId: id } });
      // 3. Delete the plan's exercises
      await tx.esercizioScheda.deleteMany({ where: { schedaId: id } });
      // 4. Delete the plan
      await tx.schedaAllenamento.delete({ where: { id } });
    });

    res.json({ successo: true, messaggio: 'Scheda eliminata' });
  } catch (errore) { next(errore); }
}

/** Adds an exercise to a plan */
export async function aggiungiEsercizio(req, res, next) {
  try {
    const schedaId = parseInt(req.params.id);
    const { esercizioId, serieTarget, repTarget, recuperoSecondi } = req.body;

    // Check ownership
    const scheda = await prisma.schedaAllenamento.findUnique({ where: { id: schedaId } });
    if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');
    if (scheda.creatoreId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa scheda');
    }

    // Find the current highest order
    const ultimo = await prisma.esercizioScheda.findFirst({
      where: { schedaId },
      orderBy: { ordineEsecuzione: 'desc' }
    });

    const esercizioScheda = await prisma.esercizioScheda.create({
      data: {
        schedaId,
        esercizioId,
        serieTarget: serieTarget || 3,
        repTarget: repTarget || '8-12',
        recuperoSecondi: recuperoSecondi || 90,
        ordineEsecuzione: (ultimo?.ordineEsecuzione || 0) + 1
      },
      include: {
        esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } }
      }
    });

    res.status(201).json({ successo: true, dati: esercizioScheda });
  } catch (errore) { next(errore); }
}

/** Updates the parameters of an exercise in a plan */
export async function aggiornaEsercizioScheda(req, res, next) {
  try {
    const esId = parseInt(req.params.esercizioSchedaId);
    const { serieTarget, repTarget, recuperoSecondi, ordineEsecuzione } = req.body;

    // Check ownership through the parent plan
    const es = await prisma.esercizioScheda.findUnique({
      where: { id: esId },
      include: { scheda: { select: { creatoreId: true } } }
    });
    if (!es) throw new ErroreNonTrovato('Esercizio scheda non trovato');
    if (es.scheda.creatoreId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa scheda');
    }

    const aggiornato = await prisma.esercizioScheda.update({
      where: { id: esId },
      data: { serieTarget, repTarget, recuperoSecondi, ordineEsecuzione }
    });

    res.json({ successo: true, dati: aggiornato });
  } catch (errore) { next(errore); }
}

/** Removes an exercise from a plan */
export async function rimuoviEsercizio(req, res, next) {
  try {
    const esId = parseInt(req.params.esercizioSchedaId);

    // Check ownership through the parent plan
    const es = await prisma.esercizioScheda.findUnique({
      where: { id: esId },
      include: { scheda: { select: { creatoreId: true } } }
    });
    if (!es) throw new ErroreNonTrovato('Esercizio scheda non trovato');
    if (es.scheda.creatoreId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa scheda');
    }

    await prisma.esercizioScheda.delete({ where: { id: esId } });
    res.json({ successo: true, messaggio: 'Esercizio rimosso dalla scheda' });
  } catch (errore) { next(errore); }
}

const INCLUDI_PER_DOCX = {
  creatore: { select: { id: true, nome: true } },
  esercizi: {
    include: { esercizio: { include: { attrezzatura: { select: { nome: true } } } } },
    orderBy: { ordineEsecuzione: 'asc' }
  }
};

/** Loads the requested plans, checking access one by one. */
async function caricaSchedePerDocx(ids, utente) {
  const schede = await prisma.schedaAllenamento.findMany({
    where: { id: { in: ids } },
    include: INCLUDI_PER_DOCX
  });

  const trovate = new Map(schede.map(s => [s.id, s]));

  // Keep the order requested by the client: it sets which plan becomes
  // session 1, session 2 and so on.
  const ordinate = [];
  for (const id of ids) {
    const scheda = trovate.get(id);
    if (!scheda) throw new ErroreNonTrovato(`Scheda ${id} non trovata`);
    // Same rule as the details: owner or global plan
    if (scheda.creatoreId !== utente.id && scheda.visibilita !== 'GLOBALE') {
      throw new ErroreNonAutorizzato(`Non hai accesso alla scheda "${scheda.titolo}"`);
    }
    ordinate.push(scheda);
  }
  return ordinate;
}

function inviaDocx(res, buffer, titolo) {
  const nomeFile = nomeFileDocumento(titolo);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

/**
 * GET /api/v1/schede/:id/docx — Downloads a plan as a Word document
 *
 * Useful to have the plan at hand in the gym even without a connection,
 * opening it with Word, Google Docs or LibreOffice.
 */
export async function esportaSchedaDocx(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const schede = await caricaSchedePerDocx([id], req.utente);
    const buffer = await generaDocxSchede(schede);
    inviaDocx(res, buffer, schede[0].titolo);
  } catch (errore) { next(errore); }
}

/**
 * GET /api/v1/schede/docx?ids=3,4,6&titolo=... — Several plans in one document
 *
 * A weekly program is not one plan repeated every day but different sessions
 * spread over the week: here each plan becomes a numbered session of the same
 * document, in the order it is requested.
 */
export async function esportaSchedeDocxMultiplo(req, res, next) {
  try {
    const grezzi = String(req.query.ids || '').split(',').map(v => v.trim()).filter(Boolean);
    const ids = grezzi.map(v => parseInt(v, 10));

    if (ids.length === 0) throw new ErroreValidazione('Indicare almeno una scheda in "ids"');
    if (ids.some(Number.isNaN)) throw new ErroreValidazione('Parametro "ids" non valido');
    if (ids.length > 10) throw new ErroreValidazione('Massimo 10 schede per documento');
    if (new Set(ids).size !== ids.length) throw new ErroreValidazione('La stessa scheda e\' indicata piu\' volte');

    const schede = await caricaSchedePerDocx(ids, req.utente);
    const titolo = req.query.titolo?.toString().slice(0, 120);

    const buffer = await generaDocxSchede(schede, { titolo });
    inviaDocx(res, buffer, titolo || `Programma ${schede.length} sedute`);
  } catch (errore) { next(errore); }
}
