// ============================================
// GymMaster — Serie registrate senza rete
// ============================================
//
// In palestra la rete va e viene. Le serie, le serie saltate e "Termina"
// passano da qui: si scrivono subito sul telefono e partono verso il server
// in ordine, appena si puo'. Senza rete l'allenamento va avanti, e quello che
// e' in coda arriva quando torna la connessione, anche ore dopo.
//
// - Ogni voce ha una chiave (idClient): se la risposta si perde e la voce
//   riparte, il server la riconosce e non la registra due volte.
// - Ogni voce porta l'ora in cui e' stata fatta: arrivata tardi, conta quella
//   (durata dell'allenamento, chiusura degli allenamenti dimenticati).
// - Una coda per utente: chi esce e chi entra sullo stesso telefono non si
//   scambiano le serie, e quelle di chi e' uscito partono al suo rientro.
// - Se l'allenamento sul server non c'e' piu' (aperto e senza serie per un
//   giorno, il server lo elimina), le voci diventano un allenamento passato.

import { apiChiamata } from '../config/api.js';

const PREFISSO = 'gymmaster_coda_serie_';
/** Oltre questo tempo una richiesta appesa a una rete che non risponde si lascia: si riprova dopo */
const ATTESA_MAX_MS = 15000;
/** Limiti di POST /sessioni/passata */
const DURATA_MIN = 1;
const DURATA_MAX = 600;

/** Una chiave nuova per una voce: un UUID, o qualcosa di simile dove non c'e' */
export function nuovoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// --- Archivio ---

const chiave = utenteId => `${PREFISSO}${utenteId}`;
// Se il telefono non lascia scrivere (spazio finito, navigazione privata) la
// coda resta in memoria: si perde chiudendo l'app, ma intanto le serie partono
const inMemoria = new Map();
const ascoltatori = new Set();

/** Le voci in coda dell'utente, dalla piu' vecchia */
export function leggiCoda(utenteId, archivio = globalThis.localStorage) {
  if (inMemoria.has(chiave(utenteId))) return inMemoria.get(chiave(utenteId));
  try {
    const voci = JSON.parse(archivio?.getItem(chiave(utenteId)) || '[]');
    return Array.isArray(voci) ? voci : [];
  } catch {
    return [];
  }
}

function scriviCoda(utenteId, voci, archivio) {
  try {
    if (voci.length) archivio.setItem(chiave(utenteId), JSON.stringify(voci));
    else archivio.removeItem(chiave(utenteId));
    inMemoria.delete(chiave(utenteId));
  } catch {
    inMemoria.set(chiave(utenteId), voci);
  }
  ascoltatori.forEach(avvisa => avvisa());
}

/**
 * Chiama `avvisa` quando la coda cambia, anche da un'altra scheda del browser.
 * @returns {() => void} per smettere di ascoltare
 */
export function ascoltaCoda(avvisa) {
  ascoltatori.add(avvisa);
  const daAltraScheda = evento => { if (evento.key?.startsWith(PREFISSO)) avvisa(); };
  globalThis.addEventListener?.('storage', daAltraScheda);
  return () => {
    ascoltatori.delete(avvisa);
    globalThis.removeEventListener?.('storage', daAltraScheda);
  };
}

/**
 * Mette in coda una voce e la restituisce completa di chiave e ora.
 * @param {number} utenteId
 * @param {{ tipo: 'serie'|'completa', sessione: { id: number, schedaId: number, dataInizio: string }, dati: object }} voce
 *   serie: i campi di POST /sessioni/:id/serie; completa: { noteFinali }
 */
export function accoda(utenteId, voce, archivio = globalThis.localStorage, adesso = new Date()) {
  const completa = { id: nuovoId(), il: adesso.toISOString(), ...voce };
  scriviCoda(utenteId, [...leggiCoda(utenteId, archivio), completa], archivio);
  return completa;
}

/** Toglie dalla coda le voci con questi id; true se almeno una c'era */
export function togliDallaCoda(utenteId, ids, archivio = globalThis.localStorage) {
  const via = new Set(ids);
  const voci = leggiCoda(utenteId, archivio);
  const restano = voci.filter(v => !via.has(v.id));
  if (restano.length === voci.length) return false;
  scriviCoda(utenteId, restano, archivio);
  return true;
}

// --- Invio ---

/**
 * Cosa fare di una voce che non e' partita:
 * - 'riprova': senza rete, server irraggiungibile o occupato, sessione da
 *   rinnovare; la voce resta in coda e l'invio si ferma qui
 * - 'sparita': l'allenamento sul server non c'e' piu'
 * - 'scarta': il server l'ha rifiutata e la rifiuterebbe sempre
 */
export function esitoErrore(errore) {
  const stato = errore?.stato;
  if (!stato || stato === 401 || stato === 408 || stato === 429 || stato >= 500) return 'riprova';
  if (stato === 404) return 'sparita';
  return 'scarta';
}

/**
 * L'allenamento passato (POST /sessioni/passata) che prende il posto di uno
 * sparito dal server, dalle sue voci in coda; null se non c'e' niente da salvare.
 */
export function sessionePassataDa(voci) {
  const serie = voci.filter(v => v.tipo === 'serie');
  if (!serie.length) return null;
  const { schedaId, dataInizio } = serie[0].sessione;
  const chiusura = voci.find(v => v.tipo === 'completa');
  const inizio = Date.parse(dataInizio);
  const fine = chiusura ? Date.parse(chiusura.il) : Math.max(...serie.map(v => Date.parse(v.il)));
  return {
    schedaId,
    dataInizio,
    durataMinuti: Math.min(DURATA_MAX, Math.max(DURATA_MIN, Math.round((fine - inizio) / 60000))),
    noteFinali: chiusura?.dati?.noteFinali || null,
    serie: serie.map(v => v.dati)
  };
}

const segnale = () => globalThis.AbortSignal?.timeout?.(ATTESA_MAX_MS);

function inviaVoce(chiama, voce) {
  const { id: sessioneId } = voce.sessione;
  if (voce.tipo === 'completa') {
    return chiama(`/sessioni/${sessioneId}/completa`, {
      metodo: 'PATCH', body: { ...voce.dati, conclusaIl: voce.il }, signal: segnale()
    });
  }
  return chiama(`/sessioni/${sessioneId}/serie`, {
    metodo: 'POST', body: { ...voce.dati, idClient: voce.id, registrataIl: voce.il }, signal: segnale()
  });
}

// Le risposte del server alle voci partite, per chi le aspetta (le serie di
// un "Termina" inviato: i record nel riepilogo)
const risposte = new Map();

/** La risposta del server alla voce, se e' partita da questa pagina */
export const rispostaPer = idVoce => risposte.get(idVoce);

/**
 * Manda le voci dell'utente in ordine, finche' la coda e' vuota o il server
 * non si raggiunge. Una voce aggiunta durante l'invio parte nello stesso giro.
 * @returns {Promise<{ inviate: number, rimaste: number }>}
 */
export async function inviaCoda(utenteId, { chiama = apiChiamata, archivio = globalThis.localStorage } = {}) {
  let inviate = 0;
  const fermati = () => ({ inviate, rimaste: leggiCoda(utenteId, archivio).length });

  for (;;) {
    const [voce] = leggiCoda(utenteId, archivio);
    if (!voce) return fermati();

    try {
      risposte.set(voce.id, await inviaVoce(chiama, voce));
      togliDallaCoda(utenteId, [voce.id], archivio);
      inviate++;
      continue;
    } catch (errore) {
      const esito = esitoErrore(errore);
      if (esito === 'riprova') return fermati();
      if (esito === 'scarta') {
        console.error('Voce rifiutata dal server, tolta dalla coda:', voce, errore);
        togliDallaCoda(utenteId, [voce.id], archivio);
        continue;
      }
    }

    // L'allenamento non c'e' piu': le sue voci diventano un allenamento passato
    const voci = leggiCoda(utenteId, archivio).filter(v => v.sessione.id === voce.sessione.id);
    const passata = sessionePassataDa(voci);
    if (passata) {
      try {
        const risposta = await chiama('/sessioni/passata', { metodo: 'POST', body: passata, signal: segnale() });
        voci.forEach(v => risposte.set(v.id, risposta));
        inviate += voci.length;
      } catch (errore) {
        if (esitoErrore(errore) === 'riprova') return fermati();
        console.error('Allenamento sparito dal server e non ricreabile, tolto dalla coda:', voci, errore);
      }
    }
    togliDallaCoda(utenteId, voci.map(v => v.id), archivio);
  }
}

// Un invio alla volta: due insieme manderebbero la stessa voce due volte (il
// server le riconoscerebbe, ma e' lavoro inutile). Fra schede diverse del
// browser, dove si puo', lo stesso con un lucchetto condiviso.
let ultimoGiro = Promise.resolve();
const conLucchetto = fn => (globalThis.navigator?.locks?.request
  ? globalThis.navigator.locks.request('gymmaster-coda-serie', fn)
  : fn());

/** Manda la coda dell'utente adesso, dopo l'eventuale invio gia' in corso */
export function inviaOra(utenteId, opzioni) {
  const giro = ultimoGiro.then(() => conLucchetto(() => inviaCoda(utenteId, opzioni)));
  ultimoGiro = giro.catch(() => {});
  return giro;
}
