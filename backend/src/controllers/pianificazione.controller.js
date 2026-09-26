// ============================================
// GymMaster — Controller Pianificazione Allenamenti
// Calendario degli allenamenti programmati
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import { creaNotifica } from '../services/notifiche.service.js';
import { gruppiDellaScheda } from '../services/consiglio.service.js';
import { giornoLocale, orarioLocale } from '../utils/date.js';

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

// Consiglio sull'ora: come nella scheda affluenza, il dato in tempo reale vale
// solo se fresco (lo scraper passa ogni mezz'ora)
const LIMITE_FRESCHEZZA_LIVE_MS = 90 * 60 * 1000;
const FASCIA_PREDEFINITA = { da: 7, a: 21 };
const ORA_ULTIMA = 22;
const SCARTO_TOLLERATO = 5; // punti percentuali di affollamento

/**
 * Quando andare oggi in palestra: l'ora meno affollata fra quelle ancora da
 * venire, dentro la fascia in cui di solito ti alleni (l'ora mediana di inizio
 * degli ultimi allenamenti, due ore prima e dopo). Se la fascia e' gia'
 * passata, la migliore delle prossime quattro ore.
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
  // Pochi punti di affollamento non valgono un'ora di attesa: fra le ore
  // quasi tranquille quanto la migliore vince la piu' vicina a quella solita
  // (o ad adesso, se la fascia abituale e' gia' passata)
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
 * GET /api/v1/pianificazione/oggi — Gli allenamenti ancora da fare oggi
 *
 * Alimenta il promemoria che compare aprendo l'app: cosa ti aspetta, a che
 * ora conviene andare e, se l'avevi gia' iniziato, la sessione da riprendere
 * invece di ricominciarla da capo.
 */
export async function allenamentiDiOggi(req, res, next) {
  try {
    res.json({ successo: true, dati: await riepilogoDiOggi(req.utente.id) });
  } catch (errore) {
    next(errore);
  }
}

/** Il contenuto di /oggi, con l'istante come parametro per poterlo provare. */
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
    // Una sessione di pochi minuti e' una prova, non la durata della scheda
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

    // Se a programmare e' stato qualcun altro (tipicamente il PT), l'utente
    // va avvisato: altrimenti si troverebbe l'allenamento in agenda senza
    // saperlo. Nessun avviso quando ci si pianifica da soli.
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
