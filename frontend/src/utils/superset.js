// ============================================
// GymMaster — Supersets and circuits in the plan editor
// ============================================
//
// The same rules as the server (backend/src/utils/superset.js): exercises
// next to each other with the same `gruppo` are done in turn; two make a
// superset, three or more a circuit. A group counts only with at least two
// members, a number left alone means "no group", and warm-up and cardio
// entries never belong to one.
//
// The rest of each member (recuperoSecondi) is the pause before the next
// member of the same round (0 by default); the last member's is the rest
// after the round. Members may have a different number of sets.
//
// Every function here takes the editor's list and returns a new one, already
// normalized, without changing the list it receives.

/** A warm-up or cardio entry: the same test as the server's */
export function eCardioOriscaldamento(e) {
  return !!e.riscaldamento || e.durataMinuti != null || e.velocitaKmh != null ||
    e.inclinazione != null || e.livelloResistenza != null || e.distanzaKm != null;
}

/**
 * The same entries with `gruppo` numbered 1, 2, 3... by order of appearance,
 * and null outside a group (no number, a number left alone, warm-up, cardio).
 * Two runs with the same number that are not next to each other become two
 * groups.
 */
export function normalizzaGruppi(esercizi) {
  const numeri = esercizi.map(e => (e.gruppo != null && !eCardioOriscaldamento(e) ? e.gruppo : null));
  const risultato = esercizi.map(e => ({ ...e, gruppo: null }));
  let prossimo = 1;
  let inizio = 0;
  while (inizio < numeri.length) {
    let fine = inizio + 1;
    if (numeri[inizio] != null) {
      while (fine < numeri.length && numeri[fine] === numeri[inizio]) fine++;
      if (fine - inizio >= 2) {
        for (let i = inizio; i < fine; i++) risultato[i].gruppo = prossimo;
        prossimo++;
      }
    }
    inizio = fine;
  }
  return risultato;
}

/** The letter of the n-th group: 1 → A, 26 → Z, 27 → AA */
export function letteraGruppo(n) {
  let lettere = '';
  for (let resto = n; resto > 0; resto = Math.floor((resto - 1) / 26)) {
    lettere = String.fromCharCode(65 + ((resto - 1) % 26)) + lettere;
  }
  return lettere;
}

/** Index of the first and last member of the group at `idx` (normalized list) */
function estremi(lista, idx) {
  let primo = idx;
  let ultimo = idx;
  while (primo > 0 && lista[primo - 1].gruppo === lista[idx].gruppo) primo--;
  while (ultimo < lista.length - 1 && lista[ultimo + 1].gruppo === lista[idx].gruppo) ultimo++;
  return { primo, ultimo };
}

/**
 * Where each entry stands in its group, for the labels A1, A2, B1...:
 * null outside a group, otherwise { lettera, posizione, etichetta, membri,
 * primo, ultimo, tipo: 'superset' | 'circuito' }.
 */
export function gruppiDi(esercizi) {
  const lista = normalizzaGruppi(esercizi);
  return lista.map((e, i) => {
    if (e.gruppo == null) return null;
    const { primo, ultimo } = estremi(lista, i);
    const lettera = letteraGruppo(e.gruppo);
    const membri = ultimo - primo + 1;
    return {
      lettera, posizione: i - primo + 1, etichetta: `${lettera}${i - primo + 1}`, membri,
      primo: i === primo, ultimo: i === ultimo, tipo: membri === 2 ? 'superset' : 'circuito'
    };
  });
}

/**
 * The editor's list cut into blocks to show: an entry alone, or a group with
 * its members, in order. Each item keeps its index in the list.
 * @returns {Array<{ gruppo: number|null, indici: number[] }>}
 */
export function blocchiDi(esercizi) {
  const lista = normalizzaGruppi(esercizi);
  const blocchi = [];
  lista.forEach((e, i) => {
    const ultimo = blocchi[blocchi.length - 1];
    if (e.gruppo != null && ultimo?.gruppo === e.gruppo) ultimo.indici.push(i);
    else blocchi.push({ gruppo: e.gruppo, indici: [i] });
  });
  return blocchi;
}

/** Whether the entry at `idx` can be joined with the next one */
export function puoUnire(esercizi, idx) {
  const lista = normalizzaGruppi(esercizi);
  const a = lista[idx];
  const b = lista[idx + 1];
  if (!a || !b || eCardioOriscaldamento(a) || eCardioOriscaldamento(b)) return false;
  return a.gruppo == null || a.gruppo !== b.gruppo;
}

/**
 * Joins the entry at `idx` with the next one. If either is already in a
 * group the other joins it (two groups become one). The member that stops
 * being the last of its group gets a pause of 0 before the next; the new
 * last keeps its rest, which becomes the rest after the round.
 */
export function unisci(esercizi, idx) {
  if (!puoUnire(esercizi, idx)) return normalizzaGruppi(esercizi);
  const lista = normalizzaGruppi(esercizi);
  const numero = lista[idx].gruppo ?? lista[idx + 1].gruppo ?? Math.max(0, ...lista.map(e => e.gruppo ?? 0)) + 1;
  const daCambiare = new Set([lista[idx].gruppo, lista[idx + 1].gruppo].filter(g => g != null));
  const risultato = lista.map((e, i) =>
    (i === idx || i === idx + 1 || daCambiare.has(e.gruppo) ? { ...e, gruppo: numero } : e));
  // The entry at idx is now followed by a member of the same round
  risultato[idx] = { ...risultato[idx], recuperoSecondi: 0 };
  return normalizzaGruppi(risultato);
}

/**
 * Takes the entry at `idx` out of its group. A middle member moves right
 * after the group, so the others stay together; if one member is left the
 * group goes away. The member leaving takes the rest after the round; when
 * the last one leaves, the new last gets that rest too.
 */
export function separa(esercizi, idx) {
  const lista = normalizzaGruppi(esercizi);
  if (lista[idx]?.gruppo == null) return lista;
  const { primo, ultimo } = estremi(lista, idx);
  const recuperoGiro = lista[ultimo].recuperoSecondi;
  const risultato = [...lista];
  if (idx === ultimo) {
    risultato[idx - 1] = { ...risultato[idx - 1], recuperoSecondi: recuperoGiro };
    risultato[idx] = { ...risultato[idx], gruppo: null };
    return normalizzaGruppi(risultato);
  }
  const uscito = { ...risultato[idx], gruppo: null, recuperoSecondi: recuperoGiro };
  if (idx === primo) {
    risultato[idx] = uscito;
    return normalizzaGruppi(risultato);
  }
  risultato.splice(idx, 1);
  risultato.splice(ultimo, 0, uscito);
  return normalizzaGruppi(risultato);
}

/** Sets the same number of sets (rounds) on every member of a group */
export function impostaGiri(esercizi, gruppo, giri) {
  return normalizzaGruppi(esercizi).map(e => (e.gruppo === gruppo ? { ...e, serieTarget: giri } : e));
}

/** The rounds of a group: the members' sets when they are all the same, otherwise null */
export function giriDi(esercizi, gruppo) {
  const serie = [...new Set(normalizzaGruppi(esercizi).filter(e => e.gruppo === gruppo).map(e => String(e.serieTarget)))];
  return serie.length === 1 ? serie[0] : null;
}

/** Index of the last member of a group (whose rest is the rest after the round) */
export function ultimoDelGruppo(esercizi, gruppo) {
  const lista = normalizzaGruppi(esercizi);
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i].gruppo === gruppo) return i;
  return -1;
}

/**
 * Moves an entry up (-1) or down (+1) with the editor's arrows. If it ends
 * up away from the other members of its group, it leaves the group.
 */
export function sposta(esercizi, idx, direzione) {
  const nuovoIdx = idx + direzione;
  if (nuovoIdx < 0 || nuovoIdx >= esercizi.length) return normalizzaGruppi(esercizi);
  const copia = [...esercizi];
  [copia[idx], copia[nuovoIdx]] = [copia[nuovoIdx], copia[idx]];
  return normalizzaGruppi(copia);
}

/**
 * A rest typed in the editor: a whole number from 0, so 0 stays 0;
 * empty or not a number gives `vuoto`.
 */
export function leggiSecondi(valore, vuoto = null) {
  const n = parseInt(valore, 10);
  return Number.isNaN(n) || n < 0 ? vuoto : n;
}

// --- During the workout (pagine/WorkoutLive.jsx) ---

/** The rest when a plan has none: 0 is a valid rest (no timer), a missing value is not */
export const RECUPERO_PREDEFINITO = 90;

/** A rest from the plan: 0 stays 0, a missing or broken value gives `base` */
const secondiDi = (valore, base) => (Number.isInteger(valore) && valore >= 0 ? valore : base);

// Today's sets of an entry, as serieDiOggi in ripresa.js (not imported from
// there: ripresa.js imports this file)
const serieDelGiorno = e => e?.serieOggi ?? e?.serieTarget ?? 0;

/**
 * The first entry with sets still to do, looking from `da` to the end and
 * then from the start, never `escluso`: -1 when everything is done.
 */
function primoDaFare(lista, fatte, da, escluso) {
  for (let passo = 0; passo < lista.length; passo++) {
    const i = (da + passo) % lista.length;
    if (i !== escluso && (fatte[i] ?? 0) < serieDelGiorno(lista[i])) return i;
  }
  return -1;
}

/**
 * Where the workout goes after a set (done or skipped) of the entry at `idx`.
 *
 * Outside a group, the same as before supersets: the same exercise while it
 * has sets to do, then the first one not finished after it (from the start
 * when there is none after), with that exercise's rest.
 *
 * In a group (superset, circuit) the members are done in turn: after a member
 * comes the next member of the round with sets still to do, after that
 * member's pause (0 by default: straight on, no timer). When no member after
 * it has sets left the round is over: the rest after the round (the last
 * member's) and back to the first member with sets to do; members with fewer
 * sets simply drop out of the later rounds. With every round done, the first
 * exercise not finished after the group.
 *
 * @param {object[]} esercizi - the workout's entries, with gruppo, serieTarget, serieOggi, recuperoSecondi
 * @param {number[]} fatte - for each entry, the working sets done or skipped, counting this one
 *   (warm-up and drop sets do not count)
 * @param {number} idx - the entry whose set was just done
 * @returns {{ prossimoIdx: number, recuperoSecondi: number, fineGiro: boolean }}
 *   prossimoIdx -1: nothing left to do; fineGiro: the set closed a round of a group
 */
export function passoDopoSerie(esercizi, fatte, idx) {
  const lista = normalizzaGruppi(esercizi);
  const attuale = lista[idx];
  if (!attuale) return { prossimoIdx: -1, recuperoSecondi: 0, fineGiro: false };
  const daFare = i => (fatte[i] ?? 0) < serieDelGiorno(lista[i]);

  if (attuale.gruppo == null) {
    const recuperoSecondi = secondiDi(attuale.recuperoSecondi, RECUPERO_PREDEFINITO);
    const prossimoIdx = daFare(idx) ? idx : primoDaFare(lista, fatte, idx + 1, idx);
    return { prossimoIdx, recuperoSecondi, fineGiro: false };
  }

  const { primo, ultimo } = estremi(lista, idx);
  for (let i = idx + 1; i <= ultimo; i++) {
    if (daFare(i)) return { prossimoIdx: i, recuperoSecondi: secondiDi(attuale.recuperoSecondi, 0), fineGiro: false };
  }
  // The round is over: its rest is the last member's
  const recuperoSecondi = secondiDi(lista[ultimo].recuperoSecondi, RECUPERO_PREDEFINITO);
  for (let i = primo; i <= ultimo; i++) {
    if (daFare(i)) return { prossimoIdx: i, recuperoSecondi, fineGiro: true };
  }
  // Every round done: on to the rest of the workout
  return { prossimoIdx: primoDaFare(lista, fatte, ultimo + 1, -1), recuperoSecondi, fineGiro: true };
}

/**
 * The round the entry at `idx` is in, for the heading "Superset A · round 2/4":
 * null outside a group. The rounds are the most sets of a member today; the
 * current round is the member's next set (the last round once it is done).
 * @param {number[]} fatte - for each entry, the working sets done or skipped
 * @returns {null | { lettera: string, etichetta: string, tipo: 'superset'|'circuito', giro: number, giri: number }}
 */
export function giroDi(esercizi, fatte, idx) {
  const gruppo = gruppiDi(esercizi)[idx];
  if (!gruppo) return null;
  const lista = normalizzaGruppi(esercizi);
  const { primo, ultimo } = estremi(lista, idx);
  const giri = Math.max(1, ...lista.slice(primo, ultimo + 1).map(serieDelGiorno));
  const giro = Math.min(giri, (fatte[idx] ?? 0) + 1);
  return { lettera: gruppo.lettera, etichetta: gruppo.etichetta, tipo: gruppo.tipo, giro, giri };
}

/**
 * Where to start again inside a group when the workout is rebuilt from the
 * server: the member with the fewest sets among those with sets to do (the
 * first one when they are even), so a round half done goes on from the
 * member whose turn it is. Outside a group, `idx` itself.
 * @param {number[]} fatte - for each entry, the working sets done or skipped
 */
export function membroDiTurno(esercizi, fatte, idx) {
  const lista = normalizzaGruppi(esercizi);
  if (lista[idx]?.gruppo == null) return idx;
  const { primo, ultimo } = estremi(lista, idx);
  let scelto = -1;
  for (let i = primo; i <= ultimo; i++) {
    if ((fatte[i] ?? 0) >= serieDelGiorno(lista[i])) continue;
    if (scelto === -1 || (fatte[i] ?? 0) < (fatte[scelto] ?? 0)) scelto = i;
  }
  return scelto === -1 ? idx : scelto;
}

/** The id of an exercise's first logged set: the order in which it was started */
function primaSerie(es) {
  const id = Math.min(...(es.serie || []).map(s => s.id ?? Infinity));
  return Number.isFinite(id) ? id : Infinity;
}

/**
 * The exercises of a past workout (the history's list, each with the
 * `gruppo` of that day and its sets) cut into blocks to show: an exercise
 * alone, or the members of a superset or circuit together, at the place of
 * the first one. Members are in the order they were started (their first
 * set), and labelled A1, A2... with the plan's letter. A group with only one
 * exercise left in the history is no group, and a workout without groups
 * gives one block per exercise, in the same order.
 *
 * @returns {Array<{ gruppo: number|null, lettera?: string, tipo?: 'superset'|'circuito',
 *   voci: Array<{ es: object, indice: number, etichetta?: string }> }>}
 */
export function blocchiStorico(esercizi) {
  const membriDi = new Map();
  esercizi.forEach((es, indice) => {
    if (es.gruppo == null) return;
    if (!membriDi.has(es.gruppo)) membriDi.set(es.gruppo, []);
    membriDi.get(es.gruppo).push({ es, indice });
  });

  const blocchi = [];
  const mostrati = new Set();
  esercizi.forEach((es, indice) => {
    const membri = es.gruppo != null ? membriDi.get(es.gruppo) : null;
    if (!membri || membri.length < 2) {
      blocchi.push({ gruppo: null, voci: [{ es, indice }] });
      return;
    }
    if (mostrati.has(es.gruppo)) return;
    mostrati.add(es.gruppo);
    const lettera = letteraGruppo(es.gruppo);
    const ordinati = [...membri].sort((a, b) => {
      const [pa, pb] = [primaSerie(a.es), primaSerie(b.es)];
      return pa === pb ? a.indice - b.indice : pa < pb ? -1 : 1;
    });
    blocchi.push({
      gruppo: es.gruppo, lettera, tipo: ordinati.length === 2 ? 'superset' : 'circuito',
      voci: ordinati.map((voce, k) => ({ ...voce, etichetta: `${lettera}${k + 1}` }))
    });
  });
  return blocchi;
}
