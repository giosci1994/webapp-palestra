// ============================================
// GymMaster — Controller Sessioni Allenamento
// Avvio, completamento e log serie
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione, ErroreNonAutorizzato } from '../utils/errori.js';

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
      include: {
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
              select: { id: true, nome: true, gruppoMuscoloPrimario: true }
            }
          },
          orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }]
        },
        _count: { select: { logSerie: true } }
      },
      orderBy: { dataInizio: 'desc' },
      take,
      skip
    });

    // Raggruppa i log per esercizio in ogni sessione
    const sessioniFormattate = sessioni.map(s => {
      const eserciziRaggruppati = {};
      s.logSerie.forEach(log => {
        if (!eserciziRaggruppati[log.esercizioId]) {
          eserciziRaggruppati[log.esercizioId] = {
            esercizio: log.esercizio,
            serie: []
          };
        }
        eserciziRaggruppati[log.esercizioId].serie.push({
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
    });

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
              select: { id: true, nome: true, gruppoMuscoloPrimario: true }
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
          include: { esercizio: { select: { id: true, nome: true, gruppoMuscoloPrimario: true } } },
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
async function controllaRecord(utenteId, serie) {
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
          pesoMaxRaggiunto: pesoMax
        },
        include: { esercizio: { select: { nome: true } } }
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
