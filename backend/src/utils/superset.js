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
