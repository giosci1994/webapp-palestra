// ============================================
// GymMaster — Supersets and circuits in a plan
// ============================================
//
// Exercises next to each other (by ordineEsecuzione) with the same `gruppo`
// are done in turn: two make a superset, three or more a circuit. A group
// counts only with at least two members; a number left alone means "no
// group", so moving an exercise with the arrows never breaks anything.
// Warm-up and cardio entries never belong to a group.
//
// The rest of each member (recuperoSecondi) is the pause before the next
// member of the same round; the last member's is the rest after the round.
// Members may have a different number of sets: the round goes on with the
// ones that still have sets to do.

/**
 * A warm-up or cardio entry: the same test the plan editor uses
 * (frontend CreaScheda.jsx), on the entry's own fields.
 */
export function eCardioOriscaldamento(e) {
  return !!e.riscaldamento || e.durataMinuti != null || e.velocitaKmh != null ||
    e.inclinazione != null || e.livelloResistenza != null || e.distanzaKm != null;
}

/**
 * The groups of a list of plan entries, in order: returns the same entries
 * with `gruppo` numbered 1, 2, 3... by order of appearance, and null for the
 * entries outside a group (no number, a number left alone, warm-up, cardio).
 * Two runs with the same number that are not next to each other become two
 * groups.
 *
 * @param {Array<object>} esercizi - entries in execution order
 * @returns {Array<object>} new objects, same order
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

/**
 * The group each exercise of a plan belongs to, for the sets logged with it:
 * esercizioId → group number (after normalizzaGruppi). An exercise that
 * appears more than once in the plan in different groups (or once in a group
 * and once outside) has no group: the set cannot say which entry it was.
 *
 * @param {Array<object>} eserciziScheda - the plan's entries, in execution order
 * @returns {Map<number, number|null>}
 */
export function gruppiPerEsercizio(eserciziScheda) {
  const gruppi = new Map();
  for (const e of normalizzaGruppi(eserciziScheda)) {
    if (!gruppi.has(e.esercizioId)) gruppi.set(e.esercizioId, e.gruppo);
    else if (gruppi.get(e.esercizioId) !== e.gruppo) gruppi.set(e.esercizioId, null);
  }
  return gruppi;
}

/** The letter of the n-th group: 1 → A, 26 → Z, 27 → AA (the same as the app's) */
export function letteraGruppo(n) {
  let lettere = '';
  for (let resto = n; resto > 0; resto = Math.floor((resto - 1) / 26)) {
    lettere = String.fromCharCode(65 + ((resto - 1) % 26)) + lettere;
  }
  return lettere;
}

/**
 * Where each entry stands in its group, for the labels A1, A2, B1... (the
 * same as the app's gruppiDi): null outside a group, otherwise { lettera,
 * posizione, etichetta, membri, primo, ultimo, tipo: 'superset' | 'circuito',
 * indici } with `indici` the positions of all the members in the list.
 *
 * @param {Array<object>} esercizi - entries in execution order
 * @returns {Array<object|null>}
 */
export function gruppiDi(esercizi) {
  const lista = normalizzaGruppi(esercizi);
  return lista.map((e, i) => {
    if (e.gruppo == null) return null;
    let primo = i;
    let ultimo = i;
    while (primo > 0 && lista[primo - 1].gruppo === e.gruppo) primo--;
    while (ultimo < lista.length - 1 && lista[ultimo + 1].gruppo === e.gruppo) ultimo++;
    const lettera = letteraGruppo(e.gruppo);
    const membri = ultimo - primo + 1;
    return {
      lettera, posizione: i - primo + 1, etichetta: `${lettera}${i - primo + 1}`, membri,
      primo: i === primo, ultimo: i === ultimo, tipo: membri === 2 ? 'superset' : 'circuito',
      indici: Array.from({ length: membri }, (_, k) => primo + k)
    };
  });
}

// --- Joining and splitting (the bot's draft) ---
// The same rules as the plan editor's buttons (frontend utils/superset.js):
// the bot joins and splits the entries of its draft the way the app does.

/** First and last position of the group of the entry at `idx` (a normalized list) */
function estremi(lista, idx) {
  let primo = idx;
  let ultimo = idx;
  while (primo > 0 && lista[primo - 1].gruppo === lista[idx].gruppo) primo--;
  while (ultimo < lista.length - 1 && lista[ultimo + 1].gruppo === lista[idx].gruppo) ultimo++;
  return { primo, ultimo };
}

/** Whether the entry at `idx` can be joined with the next one: both strength, not already in the same group */
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
