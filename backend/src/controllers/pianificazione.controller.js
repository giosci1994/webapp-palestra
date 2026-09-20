// ============================================
// GymMaster — Controller Pianificazione Allenamenti
// Calendario degli allenamenti programmati
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';

// Giorni della settimana come usati in tutta l'app: 0 = lunedì … 6 = domenica
const GIORNI_VALIDI = [0, 1, 2, 3, 4, 5, 6];
const MAX_SETTIMANE = 12;

/**
 * Converte "YYYY-MM-DD" in Date a mezzanotte UTC.
 * La colonna è di tipo DATE: fissare l'orario a mezzanotte UTC evita che il
 * fuso orario del server sposti l'allenamento al giorno prima o dopo.
 */
function aData(valore, nomeCampo = 'data') {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    throw new ErroreValidazione(`Campo "${nomeCampo}" non valido: atteso formato YYYY-MM-DD`);
  }
  const d = new Date(`${valore}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ErroreValidazione(`Campo "${nomeCampo}" non è una data reale`);
  return d;
}

/** Formatta una Date come "YYYY-MM-DD" (sempre in UTC, come è stata salvata). */
function daData(d) {
  return d.toISOString().slice(0, 10);
}

/** Indice giorno 0=lun … 6=dom a partire da una Date UTC. */
function giornoSettimanaUTC(d) {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Stabilisce su quale agenda si sta operando e se il richiedente può farlo.
 *
 * Regole: ognuno gestisce la propria; un SUPERADMIN gestisce chiunque; un personal
 * trainer gestisce solo i clienti con iscrizione ATTIVA. Senza questo controllo
 * basterebbe passare un utenteId altrui per scrivere nell'agenda di un altro.
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

/** La scheda deve essere utilizzabile da chi la pianifica. */
async function verificaScheda(schedaId, utenteBersaglioId) {
  const id = parseInt(schedaId, 10);
  if (Number.isNaN(id)) throw new ErroreValidazione('Campo "schedaId" non valido');

  const scheda = await prisma.schedaAllenamento.findUnique({
    where: { id },
    select: { id: true, creatoreId: true, visibilita: true }
  });
  if (!scheda) throw new ErroreNonTrovato('Scheda');

  const utilizzabile = scheda.visibilita === 'GLOBALE' || scheda.creatoreId === utenteBersaglioId;
  if (!utilizzabile) {
    // Una scheda assegnata dal PT ha come creatore il PT: verifichiamo che sia
    // comunque destinata a questo utente prima di rifiutarla.
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

/** GET /api/v1/pianificazione?da=&a=&utenteId= — Allenamenti in un intervallo */
export async function listaPianificazione(req, res, next) {
  try {
    const utenteId = await risolviAgenda(req.utente, req.query.utenteId);

    // Default: il mese corrente, che è ciò che il calendario mostra all'apertura
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

/** POST /api/v1/pianificazione — Programma un singolo allenamento */
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

    res.status(201).json({ successo: true, dati: { ...creato, data: daData(creato.data) } });
  } catch (errore) {
    next(errore);
  }
}

/**
 * POST /api/v1/pianificazione/settimanale — Distribuisce più schede sulla settimana
 *
 * Il caso d'uso tipico: tre schede diverse su lunedì, mercoledì e venerdì,
 * ripetute per qualche settimana. Genera le occorrenze concrete, saltando le
 * date già passate e quelle già presenti in agenda.
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

    // Valida tutte le voci prima di scrivere: o si pianifica tutto o niente
    const vociValide = [];
    for (const voce of voci) {
      const giorno = parseInt(voce.giornoSettimana, 10);
      if (!GIORNI_VALIDI.includes(giorno)) {
        throw new ErroreValidazione('Campo "giornoSettimana" deve essere fra 0 (lunedì) e 6 (domenica)');
      }
      vociValide.push({ schedaId: await verificaScheda(voce.schedaId, utenteId), giornoSettimana: giorno });
    }

    // Lunedì della settimana in cui cade dataInizio
    const lunedi = new Date(inizio);
    lunedi.setUTCDate(lunedi.getUTCDate() - giornoSettimanaUTC(inizio));

    const daCreare = [];
    for (let settimana = 0; settimana < nSettimane; settimana++) {
      for (const voce of vociValide) {
        const giorno = new Date(lunedi);
        giorno.setUTCDate(lunedi.getUTCDate() + settimana * 7 + voce.giornoSettimana);
        // Le date anteriori all'inizio richiesto appartengono al passato
        if (giorno < inizio) continue;
        daCreare.push({ utenteId, schedaId: voce.schedaId, data: giorno, creatoDaId: req.utente.id });
      }
    }

    // skipDuplicates lascia intatto ciò che è già in agenda invece di fallire
    const esito = await prisma.allenamentoPianificato.createMany({ data: daCreare, skipDuplicates: true });

    res.status(201).json({
      successo: true,
      dati: { creati: esito.count, richiesti: daCreare.length, giaPresenti: daCreare.length - esito.count }
    });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/pianificazione/:id — Sposta, rimanda o cambia stato */
export async function aggiornaPianificato(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const esistente = await prisma.allenamentoPianificato.findUnique({
      where: { id },
      select: { id: true, utenteId: true, data: true, schedaId: true }
    });
    if (!esistente) throw new ErroreNonTrovato('Allenamento pianificato');
    await risolviAgenda(req.utente, esistente.utenteId);

    const dati = {};

    // Spostamento: data assoluta, oppure scostamento in giorni ("rimanda di 1")
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

    // Spostare su un giorno che ha già la stessa scheda violerebbe il vincolo
    // di unicità: meglio un messaggio chiaro che un errore 500 di Prisma.
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

/** DELETE /api/v1/pianificazione/:id — Toglie l'allenamento dal calendario */
export async function eliminaPianificato(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new ErroreValidazione('ID non valido');

    const esistente = await prisma.allenamentoPianificato.findUnique({
      where: { id },
      select: { id: true, utenteId: true }
    });
    if (!esistente) throw new ErroreNonTrovato('Allenamento pianificato');
    await risolviAgenda(req.utente, esistente.utenteId);

    await prisma.allenamentoPianificato.delete({ where: { id } });
    res.json({ successo: true, messaggio: 'Allenamento rimosso dal calendario' });
  } catch (errore) {
    next(errore);
  }
}
