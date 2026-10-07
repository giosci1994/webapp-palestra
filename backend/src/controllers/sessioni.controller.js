// ============================================
// GymMaster — Controller Sessioni Allenamento
// Avvio, completamento e log serie
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione, ErroreNonAutorizzato } from '../utils/errori.js';
import { giornoLocale } from '../utils/date.js';

/** Lista sessioni dell'utente */
export async function listaSessioni(req, res, next) {
  try {
    const { limite = 20, pagina = 1 } = req.query;

    const sessioni = await prisma.sessioneAllenamento.findMany({
      where: { utenteId: req.utente.id },
      include: {
        scheda: { select: { id: true, titolo: true } },
        _count: { select: { logSerie: true } }
      },
      orderBy: { dataInizio: 'desc' },
      take: parseInt(limite),
      skip: (parseInt(pagina) - 1) * parseInt(limite)
    });

    res.json({ successo: true, dati: sessioni });
  } catch (errore) { next(errore); }
}

// Cosa serve allo storico di una sessione: lo usano l'elenco e la modifica,
// che restituisce la sessione corretta gia' pronta da mostrare
const INCLUDI_STORICO = {
  scheda: {
    select: {
      id: true,
      titolo: true,
      esercizi: {
        select: { id: true },
        // Solo per conteggio esercizi
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
  _count: { select: { logSerie: true } }
};

/** Una sessione letta con INCLUDI_STORICO, con i log raggruppati per esercizio */
function formattaPerStorico(s) {
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
      pesoEffettivo: log.pesoEffettivo,
      repEffettive: log.repEffettive,
      rpe: log.rpe,
      durataMinuti: log.durataMinuti,
      livelloResistenza: log.livelloResistenza,
      distanzaKm: log.distanzaKm,
      velocitaKmh: log.velocitaKmh
    });
  });

  return {
    id: s.id,
    dataInizio: s.dataInizio,
    dataFine: s.dataFine,
    durataMinuti: s.durataMinuti,
    minutiRiscaldamento: s.minutiRiscaldamento,
    volumeTotaleKg: s.volumeTotaleKg,
    noteFinali: s.noteFinali,
    scheda: {
      id: s.scheda.id,
      titolo: s.scheda.titolo,
      numEsercizi: s.scheda.esercizi?.length || 0
    },
    serieCompletate: s._count.logSerie,
    esercizi: Object.values(eserciziRaggruppati)
  };
}

/** Storico sessioni completo con dettagli log per ogni esercizio */
export async function storicoSessioniCompleto(req, res, next) {
  try {
    const { limite = 15, pagina = 1, schedaId } = req.query;
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const take = parseInt(limite);

    // Filtro base: solo sessioni completate dell'utente
    const where = {
      utenteId: req.utente.id,
      dataFine: { not: null }
    };

    // Filtro opzionale per scheda
    if (schedaId) {
      where.schedaId = parseInt(schedaId);
    }

    // Conteggio totale per paginazione
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

/** Recupera i dati dell'ultima sessione completata per una scheda specifica */
export async function ultimaSessioneScheda(req, res, next) {
  try {
    const schedaId = parseInt(req.params.schedaId);

    // Trova l'ultima sessione completata per questa scheda
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

    // Raggruppa i log per esercizioId per un accesso rapido dal frontend
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

/**
 * Carichi dell'ultima volta per ciascun esercizio, in qualsiasi scheda.
 * Serve all'allenamento in corso per suggerire da che peso partire: con una
 * scheda nuova l'ultima sessione della stessa scheda non esiste, ma
 * l'esercizio magari e' gia' stato fatto altrove.
 *
 * Query: esercizi=1,2,3 · escludi=<id della sessione in corso>
 * Risposta: { [esercizioId]: { sessioneId, data, serie: [...] } }
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

    // Le righe arrivano dalla sessione piu' recente: per ogni esercizio si
    // tiene solo la prima sessione incontrata.
    const risultato = {};
    for (const s of serie) {
      const voce = risultato[s.esercizioId] ??= { sessioneId: s.sessioneId, data: s.sessione.dataInizio, serie: [] };
      if (voce.sessioneId !== s.sessioneId) continue;
      voce.serie.push({
        serieNumero: s.serieNumero,
        pesoEffettivo: s.pesoEffettivo,
        repEffettive: s.repEffettive,
        rpe: s.rpe,
        durataMinuti: s.durataMinuti,
        livelloResistenza: s.livelloResistenza
      });
    }

    res.json({ successo: true, dati: risultato });
  } catch (errore) { next(errore); }
}

/** Avvia una nuova sessione */
export async function avviaSessione(req, res, next) {
  try {
    const { schedaId, minutiRiscaldamento } = req.body;
    if (!schedaId) throw new ErroreValidazione('schedaId è obbligatorio');

    // Verifica che la scheda esista
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

    if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');

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

/** Dettaglio sessione con tutti i log */
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
          include: { esercizio: { select: { id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
          orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }]
        }
      }
    });

    if (!sessione) throw new ErroreNonTrovato('Sessione non trovata');
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi accedere a questa sessione');
    }
    res.json({ successo: true, dati: sessione });
  } catch (errore) { next(errore); }
}

/** Completa sessione e calcola volume totale */
export async function completaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { noteFinali } = req.body;

    // Calcola volume totale (somma di peso * rep per ogni serie completata)
    const serie = await prisma.logSerie.findMany({
      where: { sessioneId: id, completato: true }
    });

    const volumeTotale = serie.reduce((sum, s) => sum + (s.pesoEffettivo * s.repEffettive), 0);

    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id } });
    if (!sessione) throw new ErroreNonTrovato('Sessione non trovata');
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa sessione');
    }

    const durataMinuti = Math.round((Date.now() - sessione.dataInizio.getTime()) / 60000);

    const aggiornata = await prisma.sessioneAllenamento.update({
      where: { id },
      data: {
        dataFine: new Date(),
        durataMinuti,
        volumeTotaleKg: Math.round(volumeTotale * 10) / 10,
        noteFinali: noteFinali || null
      }
    });

    // Se quel giorno questa scheda era in calendario, risulta fatta. Prima
    // succedeva solo registrando un allenamento passato: una sessione normale
    // lasciava la pianificazione "da fare" anche a scheda completata.
    await prisma.allenamentoPianificato.updateMany({
      where: {
        utenteId: sessione.utenteId,
        schedaId: sessione.schedaId,
        data: giornoLocale(sessione.dataInizio),
        stato: 'PIANIFICATO',
        sessioneId: null
      },
      data: { stato: 'COMPLETATO', sessioneId: id }
    });

    // Controlla record personali
    const recordAggiornati = await controllaRecord(req.utente.id, serie);

    res.json({
      successo: true,
      dati: aggiornata,
      recordPersonali: recordAggiornati
    });
  } catch (errore) { next(errore); }
}

/** Registra una serie */
export async function logSerie(req, res, next) {
  try {
    const sessioneId = parseInt(req.params.id);
    const { 
      esercizioId, serieNumero, pesoEffettivo, repEffettive, rpe, completato, motivoSaltoEsercizio, noteSerie,
      distanzaKm, durataMinuti, livelloResistenza, velocitaKmh, inclinazione 
    } = req.body;

    if (!esercizioId || !serieNumero) {
      throw new ErroreValidazione('esercizioId e serieNumero sono obbligatori');
    }

    // Verifica che la sessione sia dell'utente prima di registrare la serie
    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id: sessioneId }, select: { utenteId: true } });
    if (!sessione) throw new ErroreNonTrovato('Sessione non trovata');
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi registrare serie in questa sessione');
    }

    const log = await prisma.logSerie.create({
      data: {
        sessioneId,
        esercizioId: parseInt(esercizioId),
        serieNumero: parseInt(serieNumero),
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
        inclinazione: inclinazione ? parseFloat(inclinazione) : null
      },
      include: {
        esercizio: { include: { attrezzatura: { select: { categoria: true } } } }
      }
    });

    res.status(201).json({ successo: true, dati: log });
  } catch (errore) { next(errore); }
}

/** Controlla e aggiorna record personali */
async function controllaRecord(utenteId, serie, dataRecord = null) {
  const recordAggiornati = [];

  // Raggruppa serie per esercizio e trova il peso max
  const pesoPerEsercizio = {};
  for (const s of serie) {
    if (!pesoPerEsercizio[s.esercizioId] || s.pesoEffettivo > pesoPerEsercizio[s.esercizioId]) {
      pesoPerEsercizio[s.esercizioId] = s.pesoEffettivo;
    }
  }

  for (const [esercizioId, pesoMax] of Object.entries(pesoPerEsercizio)) {
    if (pesoMax <= 0) continue;

    const recordEsistente = await prisma.recordPersonale.findFirst({
      where: { utenteId, esercizioId: parseInt(esercizioId) },
      orderBy: { pesoMaxRaggiunto: 'desc' }
    });

    if (!recordEsistente || pesoMax > recordEsistente.pesoMaxRaggiunto) {
      const record = await prisma.recordPersonale.create({
        data: {
          utenteId,
          esercizioId: parseInt(esercizioId),
          pesoMaxRaggiunto: pesoMax,
          ...(dataRecord ? { dataRecord } : {})
        },
        include: { esercizio: { select: { nome: true, nomeIt: true } } }
      });
      recordAggiornati.push(record);
    }
  }

  return recordAggiornati;
}

/** Elimina una sessione */
export async function eliminaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const sessione = await prisma.sessioneAllenamento.findUnique({ where: { id } });

    if (!sessione) throw new ErroreNonTrovato('Sessione non trovata');
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi eliminare le sessioni di altri utenti');
    }

    // Le LogSerie sono eliminate automaticamente se c'è onDelete: Cascade nel database.
    // Per sicurezza, eliminiamole esplicitamente prima in una transazione:
    await prisma.$transaction([
      prisma.logSerie.deleteMany({ where: { sessioneId: id } }),
      prisma.sessioneAllenamento.delete({ where: { id } })
    ]);

    res.json({ successo: true, messaggio: 'Sessione eliminata correttamente' });
  } catch (errore) { next(errore); }
}

// Limiti di buon senso per un allenamento inserito o corretto a posteriori
const DURATA_MIN = 1;
const DURATA_MAX = 600;          // 10 ore
const ANNI_INDIETRO_MAX = 2;
const TOLLERANZA_FUTURO_MS = 5 * 60 * 1000;  // scarto d'orologio fra client e server

/**
 * Inizio di un allenamento dichiarato dal client. Arriva come istante completo
 * di fuso: cosi' l'ora salvata e' quella in cui l'utente si e' davvero
 * allenato, non quella del server.
 */
function leggiInizio(valore) {
  const inizio = new Date(valore);
  if (Number.isNaN(inizio.getTime())) throw new ErroreValidazione('Data non valida');

  if (inizio.getTime() > Date.now() + TOLLERANZA_FUTURO_MS) {
    throw new ErroreValidazione('Un allenamento non può iniziare nel futuro');
  }
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - ANNI_INDIETRO_MAX);
  if (inizio < limite) {
    throw new ErroreValidazione(`Non puoi inserire allenamenti di più di ${ANNI_INDIETRO_MAX} anni fa`);
  }
  return inizio;
}

/** Durata in minuti di un allenamento dichiarato dal client */
function leggiDurata(valore) {
  const durata = parseInt(valore);
  if (Number.isNaN(durata) || durata < DURATA_MIN || durata > DURATA_MAX) {
    throw new ErroreValidazione(`La durata deve essere fra ${DURATA_MIN} e ${DURATA_MAX} minuti`);
  }
  return durata;
}

/**
 * POST /api/v1/sessioni/passata — Registra un allenamento gia' svolto
 *
 * Il flusso normale non serve allo scopo: avviaSessione fissa la data a
 * "adesso" e completaSessione ricava la durata dal tempo trascorso, quindi una
 * sessione retrodatata risulterebbe lunga giorni. Qui sessione e serie vengono
 * scritte insieme, con la data e la durata dichiarate.
 *
 * Nasce dal caso concreto di chi si allena senza connessione seguendo una
 * scheda scaricata e registra la seduta sull'orologio: i dati esistono gia',
 * vanno solo riportati.
 */
export async function registraSessionePassata(req, res, next) {
  try {
    const { schedaId, dataInizio, durataMinuti, minutiRiscaldamento, noteFinali, serie } = req.body;

    if (!schedaId) throw new ErroreValidazione('schedaId è obbligatorio');
    const idScheda = parseInt(schedaId);
    if (Number.isNaN(idScheda)) throw new ErroreValidazione('schedaId non valido');

    const inizio = leggiInizio(dataInizio);
    const durata = leggiDurata(durataMinuti);

    const scheda = await prisma.schedaAllenamento.findUnique({
      where: { id: idScheda },
      select: { id: true, creatoreId: true, visibilita: true }
    });
    if (!scheda) throw new ErroreNonTrovato('Scheda non trovata');
    if (scheda.creatoreId !== req.utente.id && scheda.visibilita !== 'GLOBALE') {
      throw new ErroreNonAutorizzato('Non hai accesso a questa scheda');
    }

    // Le serie sono facoltative: chi ha solo il riepilogo dell'orologio
    // registra data e durata, chi ha annotato i carichi li aggiunge.
    const righe = Array.isArray(serie) ? serie : [];
    const preparate = righe.map((r, i) => {
      const esercizioId = parseInt(r.esercizioId);
      const serieNumero = parseInt(r.serieNumero);
      if (Number.isNaN(esercizioId) || Number.isNaN(serieNumero)) {
        throw new ErroreValidazione(`Serie ${i + 1}: esercizioId e serieNumero sono obbligatori`);
      }
      const peso = r.pesoEffettivo != null ? parseFloat(r.pesoEffettivo) : 0;
      const rep = r.repEffettive != null ? parseInt(r.repEffettive) : 0;
      if (peso < 0 || rep < 0) throw new ErroreValidazione(`Serie ${i + 1}: valori negativi non ammessi`);
      return {
        esercizioId,
        serieNumero,
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

    const volume = preparate
      .filter(r => r.completato)
      .reduce((somma, r) => somma + r.pesoEffettivo * r.repEffettive, 0);

    const fine = new Date(inizio.getTime() + durata * 60000);

    // Sessione e serie insieme: una sessione a meta' sarebbe peggio di nessuna
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

      // Se quel giorno era in calendario, l'allenamento risulta fatto: cosi'
      // non resta segnato come "da fare" dopo essere stato registrato.
      await tx.allenamentoPianificato.updateMany({
        where: { utenteId: req.utente.id, schedaId: idScheda, data: giornoLocale(inizio), stato: 'PIANIFICATO' },
        data: { stato: 'COMPLETATO', sessioneId: creata.id }
      });

      return creata;
    });

    // I record vengono datati al giorno dell'allenamento, non a oggi
    const recordAggiornati = await controllaRecord(
      req.utente.id,
      preparate.filter(r => r.completato),
      inizio
    );

    res.status(201).json({ successo: true, dati: sessione, recordPersonali: recordAggiornati });
  } catch (errore) { next(errore); }
}

// Valori di una serie che si correggono dallo storico. Peso e ripetizioni non
// possono mancare nel database: vuoti valgono 0, come nel corpo libero.
const CAMPI_SERIE = {
  pesoEffettivo:     { errore: 'peso non valido', max: 1000, zeroSeVuoto: true },
  repEffettive:      { errore: 'ripetizioni non valide', max: 1000, intero: true, zeroSeVuoto: true },
  rpe:               { errore: 'RPE non valido (da 1 a 10)', min: 1, max: 10, intero: true },
  durataMinuti:      { errore: 'durata non valida', max: DURATA_MAX, intero: true },
  livelloResistenza: { errore: 'livello non valido', max: 1000, intero: true }
};
const SERIE_MAX = 300;

/** Valori di una serie ricevuta: un campo assente resta com'era, uno vuoto si svuota. */
function leggiValoriSerie(riga, n) {
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
      throw new ErroreValidazione(`Serie ${n}: ${regola.errore}`);
    }
    valori[campo] = v;
  }
  return valori;
}

/**
 * Riallinea i record personali dopo la correzione delle serie di una sessione.
 *
 * Un record nato da un peso sbagliato (800 kg invece di 80) sparisce quando la
 * serie viene corretta e nessun'altra lo raggiunge; se il massimo vero resta
 * senza record, ne nasce uno datato all'allenamento in cui e' stato
 * sollevato. Si eliminano solo record con un peso che la sessione conteneva
 * prima della modifica: quelli nati da altri allenamenti restano.
 *
 * @param pesiPrima esercizioId → pesi delle serie della sessione prima della modifica
 */
async function riallineaRecord(tx, utenteId, pesiPrima) {
  const creati = [];
  for (const [esercizioId, pesi] of pesiPrima) {
    const migliore = await tx.logSerie.findFirst({
      where: { esercizioId, completato: true, sessione: { utenteId } },
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
 * PATCH /api/v1/sessioni/:id — Corregge un allenamento concluso dallo storico
 *
 * Nasce da un allenamento rimasto aperto tutta la notte: "Termina" la mattina
 * dopo ricava la durata dal tempo trascorso, piu' di dieci ore, e ore totali,
 * durata per giorno e badge ne risultano falsati. Prima l'unico rimedio era
 * eliminare la sessione, perdendo anche le serie.
 *
 * Cambia solo cio' che arriva:
 * - dataInizio, durataMinuti: la fine si ricalcola da inizio + durata;
 * - minutiRiscaldamento, noteFinali: null li svuota;
 * - serie: l'elenco completo delle serie svolte dopo la modifica, nell'ordine
 *   in cui mostrarle. Quelle con id si aggiornano, quelle senza si aggiungono
 *   a un esercizio gia' presente, quelle che mancano si eliminano. Le serie
 *   saltate non compaiono nello storico e restano come sono.
 * Volume e record personali seguono le serie corrette.
 */
export async function modificaSessione(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const sessione = await prisma.sessioneAllenamento.findUnique({
      where: { id },
      include: { logSerie: true }
    });
    if (!sessione) throw new ErroreNonTrovato('Sessione non trovata');
    if (sessione.utenteId !== req.utente.id && req.utente.ruolo !== 'SUPERADMIN') {
      throw new ErroreNonAutorizzato('Non puoi modificare questa sessione');
    }
    // Uno in corso si chiude con "Termina": qui si scontrerebbe con le serie
    // che l'allenamento sta ancora registrando
    if (!sessione.dataFine) throw new ErroreValidazione('Puoi modificare solo un allenamento concluso');

    const { dataInizio, durataMinuti, minutiRiscaldamento, noteFinali, serie } = req.body;
    const dati = {};

    if (dataInizio !== undefined || durataMinuti !== undefined) {
      const inizio = dataInizio !== undefined ? leggiInizio(dataInizio) : sessione.dataInizio;
      const durata = durataMinuti !== undefined
        ? leggiDurata(durataMinuti)
        : sessione.durataMinuti ?? Math.round((sessione.dataFine - sessione.dataInizio) / 60000);
      const fine = new Date(inizio.getTime() + durata * 60000);
      if (fine.getTime() > Date.now() + TOLLERANZA_FUTURO_MS) {
        throw new ErroreValidazione("Con quest'ora d'inizio e questa durata l'allenamento finirebbe nel futuro");
      }
      Object.assign(dati, { dataInizio: inizio, durataMinuti: durata, dataFine: fine });
    }

    if (minutiRiscaldamento !== undefined) {
      if (minutiRiscaldamento === null || minutiRiscaldamento === '') {
        dati.minutiRiscaldamento = null;
      } else {
        const minuti = Number(minutiRiscaldamento);
        if (!Number.isInteger(minuti) || minuti < 0 || minuti > DURATA_MAX) {
          throw new ErroreValidazione('Minuti di riscaldamento non validi');
        }
        dati.minutiRiscaldamento = minuti;
      }
    }

    if (noteFinali !== undefined) {
      dati.noteFinali = typeof noteFinali === 'string' && noteFinali.trim() ? noteFinali.trim() : null;
    }

    // Le serie ricevute si confrontano con quelle svolte gia' registrate
    const svolte = sessione.logSerie.filter(l => l.completato);
    let righe = null;
    if (serie !== undefined) {
      if (!Array.isArray(serie)) throw new ErroreValidazione('serie deve essere un elenco');
      if (serie.length > SERIE_MAX) throw new ErroreValidazione(`Al massimo ${SERIE_MAX} serie`);
      const perId = new Map(svolte.map(l => [l.id, l]));
      const eserciziSessione = new Set(sessione.logSerie.map(l => l.esercizioId));
      const viste = new Set();
      righe = serie.map((riga, i) => {
        const n = i + 1;
        if (!riga || typeof riga !== 'object') throw new ErroreValidazione(`Serie ${n}: non valida`);
        let esistente = null;
        if (riga.id != null) {
          esistente = perId.get(Number(riga.id));
          if (!esistente || viste.has(esistente.id)) {
            throw new ErroreValidazione(`Serie ${n}: non appartiene a questo allenamento`);
          }
          viste.add(esistente.id);
        }
        const esercizioId = esistente ? esistente.esercizioId : Number(riga.esercizioId);
        if (!esistente && !eserciziSessione.has(esercizioId)) {
          throw new ErroreValidazione(`Serie ${n}: si aggiungono serie solo agli esercizi di questo allenamento`);
        }
        return { esistente, esercizioId, valori: leggiValoriSerie(riga, n) };
      });
    }

    const { aggiornata, recordPersonali } = await prisma.$transaction(async (tx) => {
      // Esercizi in cui il peso massimo puo' essere cambiato, con i pesi che
      // avevano prima della modifica: servono a riallineare i record
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

        // Numerazione 1..n per esercizio nell'ordine ricevuto: tolta una serie
        // registrata due volte non resta il buco ("1, 3, 4")
        const contatori = new Map();
        let volume = 0;
        for (const r of righe) {
          const serieNumero = (contatori.get(r.esercizioId) || 0) + 1;
          contatori.set(r.esercizioId, serieNumero);
          const valori = { ...r.valori, serieNumero };
          if (r.esistente) {
            if (Object.entries(valori).some(([campo, v]) => r.esistente[campo] !== v)) {
              await tx.logSerie.update({ where: { id: r.esistente.id }, data: valori });
            }
            if (valori.pesoEffettivo !== undefined && valori.pesoEffettivo !== r.esistente.pesoEffettivo) {
              tocca(r.esercizioId);
            }
          } else {
            await tx.logSerie.create({
              data: { pesoEffettivo: 0, repEffettive: 0, ...valori, sessioneId: id, esercizioId: r.esercizioId, completato: true }
            });
            tocca(r.esercizioId);
          }
          volume += (valori.pesoEffettivo ?? r.esistente?.pesoEffettivo ?? 0) *
                    (valori.repEffettive ?? r.esistente?.repEffettive ?? 0);
        }
        dati.volumeTotaleKg = Math.round(volume * 10) / 10;
      }

      const aggiornata = await tx.sessioneAllenamento.update({ where: { id }, data: dati, include: INCLUDI_STORICO });

      // Spostato in un altro giorno, l'allenamento non chiude piu' quello
      // programmato nel giorno vecchio, ma quello del giorno nuovo
      if (dati.dataInizio && giornoLocale(dati.dataInizio).getTime() !== giornoLocale(sessione.dataInizio).getTime()) {
        await tx.allenamentoPianificato.updateMany({
          where: { sessioneId: id },
          data: { stato: 'PIANIFICATO', sessioneId: null }
        });
        await tx.allenamentoPianificato.updateMany({
          where: { utenteId: sessione.utenteId, schedaId: sessione.schedaId, data: giornoLocale(dati.dataInizio), stato: 'PIANIFICATO', sessioneId: null },
          data: { stato: 'COMPLETATO', sessioneId: id }
        });
      }

      // Dopo l'aggiornamento della sessione: un record nuovo prende la data corretta
      const recordPersonali = await riallineaRecord(tx, sessione.utenteId, toccati);
      return { aggiornata, recordPersonali };
    });

    res.json({ successo: true, dati: formattaPerStorico(aggiornata), recordPersonali });
  } catch (errore) { next(errore); }
}
