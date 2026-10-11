// ============================================
// GymMaster — Sets logged without a network
// ============================================
//
// At the gym the network comes and goes. Sets, skipped sets and "Termina"
// (finish) go through here: they are written right away on the phone and sent
// to the server in order, as soon as possible. Without a network the workout
// goes on, and what is queued arrives when the connection is back, even hours
// later.
//
// - Every entry has a key (idClient): if the response is lost and the entry
//   is sent again, the server recognizes it and does not log it twice.
// - Every entry carries the time it was done: when it arrives late, that time
//   counts (workout duration, closing forgotten workouts).
// - One queue per user: whoever logs out and whoever logs in on the same phone
//   do not swap sets, and those of the user who logged out are sent when they
//   come back.
// - If the workout is no longer on the server (open and without sets for a
//   day, the server deletes it), the entries become a past workout.

import { apiChiamata } from '../config/api.js';

const PREFISSO = 'gymmaster_coda_serie_';
/** Past this time a request hanging on a network that does not answer is dropped: it is retried later */
const ATTESA_MAX_MS = 15000;
/** Limits of POST /sessioni/passata */
const DURATA_MIN = 1;
const DURATA_MAX = 600;

/** A new key for an entry: a UUID, or something similar where it is not available */
export function nuovoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// --- Storage ---

const chiave = utenteId => `${PREFISSO}${utenteId}`;
// If the phone does not allow writing (out of space, private browsing) the
// queue stays in memory: it is lost when the app is closed, but meanwhile the sets are sent
const inMemoria = new Map();
const ascoltatori = new Set();

/** The user's queued entries, oldest first */
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
 * Calls `avvisa` when the queue changes, even from another browser tab.
 * @returns {() => void} to stop listening
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
 * Queues an entry and returns it with its key and time.
 * @param {number} utenteId
 * @param {{ tipo: 'serie'|'completa', sessione: { id: number, schedaId: number, dataInizio: string }, dati: object }} voce
 *   serie: the fields of POST /sessioni/:id/serie; completa: { noteFinali }
 */
export function accoda(utenteId, voce, archivio = globalThis.localStorage, adesso = new Date()) {
  const completa = { id: nuovoId(), il: adesso.toISOString(), ...voce };
  scriviCoda(utenteId, [...leggiCoda(utenteId, archivio), completa], archivio);
  return completa;
}

/** Removes the entries with these ids from the queue; true if at least one was there */
export function togliDallaCoda(utenteId, ids, archivio = globalThis.localStorage) {
  const via = new Set(ids);
  const voci = leggiCoda(utenteId, archivio);
  const restano = voci.filter(v => !via.has(v.id));
  if (restano.length === voci.length) return false;
  scriviCoda(utenteId, restano, archivio);
  return true;
}

// --- Sending ---

/**
 * What to do with an entry that was not sent:
 * - 'riprova' (retry): no network, server unreachable or busy, login session
 *   to renew; the entry stays in the queue and sending stops here
 * - 'sparita' (gone): the workout is no longer on the server
 * - 'scarta' (discard): the server rejected it and would always reject it
 */
export function esitoErrore(errore) {
  const stato = errore?.stato;
  if (!stato || stato === 401 || stato === 408 || stato === 429 || stato >= 500) return 'riprova';
  if (stato === 404) return 'sparita';
  return 'scarta';
}

/**
 * The past workout (POST /sessioni/passata) that takes the place of one that
 * is gone from the server, built from its queued entries; null if there is nothing to save.
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

// The server's responses to the sent entries, for whoever is waiting for them
// (the sets of a sent "Termina": the records in the summary)
const risposte = new Map();

/** The server's response to the entry, if it was sent from this page */
export const rispostaPer = idVoce => risposte.get(idVoce);

/**
 * Sends the user's entries in order, until the queue is empty or the server
 * cannot be reached. An entry added while sending goes out in the same round.
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

    // The workout is gone: its entries become a past workout
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

// One send at a time: two together would send the same entry twice (the
// server would recognize it, but it is wasted work). Across different browser
// tabs, where possible, the same with a shared lock.
let ultimoGiro = Promise.resolve();
const conLucchetto = fn => (globalThis.navigator?.locks?.request
  ? globalThis.navigator.locks.request('gymmaster-coda-serie', fn)
  : fn());

/** Sends the user's queue now, after any send already in progress */
export function inviaOra(utenteId, opzioni) {
  const giro = ultimoGiro.then(() => conLucchetto(() => inviaCoda(utenteId, opzioni)));
  ultimoGiro = giro.catch(() => {});
  return giro;
}
