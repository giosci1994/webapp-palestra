// Supersets and circuits in the plan editor: the same grouping rules as the
// server (backend/test/unitari/superset.test.js), plus join, split, arrows.
import { describe, it, expect } from 'vitest';
import {
  normalizzaGruppi, eCardioOriscaldamento, letteraGruppo, gruppiDi, blocchiDi, puoUnire,
  unisci, separa, impostaGiri, giriDi, ultimoDelGruppo, sposta, leggiSecondi,
  passoDopoSerie, giroDi, membroDiTurno, RECUPERO_PREDEFINITO, blocchiStorico
} from './superset.js';

const voce = (esercizioId, gruppo, altro = {}) => ({ esercizioId, gruppo, ...altro });
const gruppi = lista => normalizzaGruppi(lista).map(e => e.gruppo);
const forza = (esercizioId, gruppo = null, recuperoSecondi = 90, serieTarget = 3) =>
  ({ esercizioId, gruppo, recuperoSecondi, serieTarget });
const riassunto = lista => lista.map(e => [e.esercizioId, e.gruppo, e.recuperoSecondi]);

describe('normalizzaGruppi (same cases as the server)', () => {
  it('numbers the groups 1, 2, 3... in order, whatever number the list had', () => {
    expect(gruppi([voce(1, 7), voce(2, 7), voce(3, null), voce(4, 3), voce(5, 3), voce(6, 3)]))
      .toEqual([1, 1, null, 2, 2, 2]);
  });

  it('a number left alone is no group', () => {
    expect(gruppi([voce(1, 1), voce(2, null), voce(3, 2), voce(4, 2)])).toEqual([null, null, 1, 1]);
  });

  it('the same number in two places that are not next to each other makes two groups', () => {
    expect(gruppi([voce(1, 1), voce(2, 1), voce(3, null), voce(4, 1), voce(5, 1)])).toEqual([1, 1, null, 2, 2]);
  });

  it('two groups next to each other with different numbers stay apart', () => {
    expect(gruppi([voce(1, 5), voce(2, 5), voce(3, 6), voce(4, 6)])).toEqual([1, 1, 2, 2]);
  });

  it('warm-up and cardio never enter a group, and they split it', () => {
    expect(gruppi([
      voce(1, 1, { riscaldamento: true }), voce(2, 1), voce(3, 1), voce(4, 1, { durataMinuti: 10 }), voce(5, 1)
    ])).toEqual([null, 1, 1, null, null]);
  });

  it('keeps the other fields and does not change the list it receives', () => {
    const lista = [voce(1, 4, { serieTarget: 4 }), voce(2, 4, { serieTarget: 3 })];
    expect(normalizzaGruppi(lista)).toEqual([voce(1, 1, { serieTarget: 4 }), voce(2, 1, { serieTarget: 3 })]);
    expect(lista[0].gruppo).toBe(4);
  });

  it('a plan without groups stays without groups', () => {
    expect(gruppi([voce(1, undefined), voce(2, null)])).toEqual([null, null]);
    expect(normalizzaGruppi([])).toEqual([]);
  });
});

describe('eCardioOriscaldamento', () => {
  it('the same test as the server', () => {
    expect(eCardioOriscaldamento({ serieTarget: 3, durataMinuti: null })).toBe(false);
    expect(eCardioOriscaldamento({ riscaldamento: true })).toBe(true);
    expect(eCardioOriscaldamento({ velocitaKmh: 9 })).toBe(true);
    expect(eCardioOriscaldamento({ distanzaKm: 2 })).toBe(true);
  });

  it('an entry with only the incline is cardio', () => {
    expect(eCardioOriscaldamento({ serieTarget: 1, inclinazione: 5 })).toBe(true);
    expect(eCardioOriscaldamento({ inclinazione: 0 })).toBe(true);
    expect(eCardioOriscaldamento({ serieTarget: 3, inclinazione: null })).toBe(false);
  });
});

describe('labels', () => {
  it('letters A to Z, then AA', () => {
    expect([1, 2, 26, 27, 28].map(letteraGruppo)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('A1, A2 for a superset, B1, B2, B3 for a circuit, nothing outside', () => {
    const etichette = gruppiDi([voce(1, 9), voce(2, 9), voce(3, null), voce(4, 2), voce(5, 2), voce(6, 2)]);
    expect(etichette.map(g => g?.etichetta ?? null)).toEqual(['A1', 'A2', null, 'B1', 'B2', 'B3']);
    expect(etichette[0]).toMatchObject({ tipo: 'superset', membri: 2, primo: true, ultimo: false });
    expect(etichette[5]).toMatchObject({ tipo: 'circuito', membri: 3, posizione: 3, primo: false, ultimo: true });
  });

  it('blocks to show: entries alone and groups with their indexes', () => {
    expect(blocchiDi([voce(1, null), voce(2, 4), voce(3, 4), voce(4, 5)])).toEqual([
      { gruppo: null, indici: [0] }, { gruppo: 1, indici: [1, 2] }, { gruppo: null, indici: [3] }
    ]);
  });
});

describe('unisci', () => {
  it('two exercises become a superset: the first pauses 0, the last keeps the rest after the round', () => {
    expect(riassunto(unisci([forza(1), forza(2, null, 120), forza(3)], 0)))
      .toEqual([[1, 1, 0], [2, 1, 120], [3, null, 90]]);
  });

  it('the next one joins the group the first is in (a circuit)', () => {
    const superset = unisci([forza(1), forza(2), forza(3, null, 60)], 0);
    expect(riassunto(unisci(superset, 1))).toEqual([[1, 1, 0], [2, 1, 0], [3, 1, 60]]);
  });

  it('an exercise before a group joins it', () => {
    expect(riassunto(unisci([forza(1), forza(2, 7, 0), forza(3, 7)], 0)))
      .toEqual([[1, 1, 0], [2, 1, 0], [3, 1, 90]]);
  });

  it('two groups next to each other become one', () => {
    expect(gruppi(unisci([forza(1, 1), forza(2, 1), forza(3, 2), forza(4, 2), forza(5)], 1)))
      .toEqual([1, 1, 1, 1, null]);
  });

  it('warm-up and cardio cannot be joined, nor the last entry', () => {
    const lista = [forza(1), { ...forza(2), riscaldamento: true }, forza(3), { ...forza(4), durataMinuti: 10 }];
    expect([0, 1, 2, 3].map(i => puoUnire(lista, i))).toEqual([false, false, false, false]);
    expect(gruppi(unisci(lista, 0))).toEqual([null, null, null, null]);
  });

  it('two members of the same group cannot be joined again', () => {
    expect(puoUnire([forza(1, 1), forza(2, 1), forza(3)], 0)).toBe(false);
    expect(puoUnire([forza(1, 1), forza(2, 1), forza(3)], 1)).toBe(true);
  });

  it('does not change the list it receives', () => {
    const lista = [forza(1), forza(2)];
    unisci(lista, 0);
    expect(lista).toEqual([forza(1), forza(2)]);
  });
});

describe('separa', () => {
  it('a superset split: the group goes away, the first takes the rest after the round', () => {
    expect(riassunto(separa([forza(1, 1, 0), forza(2, 1, 120)], 0))).toEqual([[1, null, 120], [2, null, 120]]);
  });

  it('the last member leaving: the new last gets the rest after the round', () => {
    expect(riassunto(separa([forza(1, 1, 0), forza(2, 1, 0), forza(3, 1, 120)], 2)))
      .toEqual([[1, 1, 0], [2, 1, 120], [3, null, 120]]);
  });

  it('a middle member moves right after the group, the others stay together', () => {
    expect(riassunto(separa([forza(1, 1, 0), forza(2, 1, 0), forza(3, 1, 120), forza(4)], 1)))
      .toEqual([[1, 1, 0], [3, 1, 120], [2, null, 120], [4, null, 90]]);
  });

  it('an entry outside a group does not change', () => {
    expect(riassunto(separa([forza(1), forza(2)], 0))).toEqual([[1, null, 90], [2, null, 90]]);
  });
});

describe('rounds and rest after the round', () => {
  const lista = [forza(1, 1, 0, 4), forza(2, 1, 120, 3), forza(3, null, 90, 5)];

  it('different sets in a superset are allowed: no common number of rounds', () => {
    expect(giriDi(lista, 1)).toBe(null);
  });

  it('"Rounds" sets the same sets on every member, and only on them', () => {
    const giri = impostaGiri(lista, 1, 5);
    expect(giri.map(e => e.serieTarget)).toEqual([5, 5, 5]);
    expect(giriDi(impostaGiri(lista, 1, 4), 1)).toBe('4');
    expect(impostaGiri(lista, 1, 2)[2].serieTarget).toBe(5);
  });

  it('the rest after the round is the last member\'s', () => {
    expect(ultimoDelGruppo(lista, 1)).toBe(1);
    expect(ultimoDelGruppo(lista, 2)).toBe(-1);
  });
});

describe('sposta (the arrows)', () => {
  it('moving inside the group keeps it', () => {
    expect(riassunto(sposta([forza(1, 1, 0), forza(2, 1, 60)], 0, 1))).toEqual([[2, 1, 60], [1, 1, 0]]);
  });

  it('a member moved away from the others leaves the group', () => {
    expect(gruppi(sposta([forza(1, 1), forza(2, 1), forza(3)], 1, 1))).toEqual([null, null, null]);
  });

  it('an exercise moved between two members of a superset splits it', () => {
    expect(gruppi(sposta([forza(1, 1), forza(2, 1), forza(3)], 2, -1))).toEqual([null, null, null]);
  });

  it('a circuit keeps the other members together when one leaves by an end', () => {
    expect(gruppi(sposta([forza(1, 1), forza(2, 1), forza(3, 1), forza(4)], 2, 1))).toEqual([1, 1, null, null]);
  });

  it('out of the list it does nothing', () => {
    expect(riassunto(sposta([forza(1), forza(2)], 0, -1))).toEqual([[1, null, 90], [2, null, 90]]);
  });
});

describe('leggiSecondi', () => {
  it('0 stays 0, empty or not a number gives the fallback', () => {
    expect(leggiSecondi('0')).toBe(0);
    expect(leggiSecondi(0, 90)).toBe(0);
    expect(leggiSecondi('45')).toBe(45);
    expect(leggiSecondi('', 90)).toBe(90);
    expect(leggiSecondi('abc')).toBe(null);
    expect(leggiSecondi('-5', 0)).toBe(0);
  });
});

// --- During the workout ---

/**
 * A whole workout set by set, starting at `inizio`, as WorkoutLive does it:
 * after each set the step says where to go. Returns the steps as
 * "index:rest" ('·' after the rest when it closes a round), so a test reads
 * like the order of the sets.
 */
function allenamento(lista, inizio = 0) {
  const fatte = lista.map(() => 0);
  const passi = [];
  let idx = inizio;
  while (idx !== -1 && passi.length < 100) {
    fatte[idx]++;
    const passo = passoDopoSerie(lista, fatte, idx);
    passi.push(`${idx}:${passo.recuperoSecondi}${passo.fineGiro ? '·' : ''}`);
    idx = passo.prossimoIdx;
  }
  return passi;
}

describe('passoDopoSerie: a plan without groups works as before', () => {
  const lista = [forza(1, null, 60, 2), forza(2, null, 120, 2)];

  it('the same exercise while it has sets, then the next one, each with its rest', () => {
    expect(allenamento(lista)).toEqual(['0:60', '0:60', '1:120', '1:120']);
    expect(passoDopoSerie(lista, [1, 0], 0)).toEqual({ prossimoIdx: 0, recuperoSecondi: 60, fineGiro: false });
    expect(passoDopoSerie(lista, [2, 0], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 60, fineGiro: false });
  });

  it('nothing after it: back to an exercise skipped earlier, then -1 when all is done', () => {
    expect(passoDopoSerie(lista, [0, 2], 1).prossimoIdx).toBe(0);
    expect(passoDopoSerie(lista, [2, 2], 1).prossimoIdx).toBe(-1);
  });

  it('rest 0 stays 0 (no timer), a missing rest is the usual 90 seconds', () => {
    expect(passoDopoSerie([forza(1, null, 0, 3)], [1], 0).recuperoSecondi).toBe(0);
    expect(passoDopoSerie([forza(1, null, null, 3)], [1], 0).recuperoSecondi).toBe(RECUPERO_PREDEFINITO);
    expect(passoDopoSerie([{ esercizioId: 1, serieTarget: 3 }], [1], 0).recuperoSecondi).toBe(90);
  });

  it('an index that does not exist: nothing to do', () => {
    expect(passoDopoSerie(lista, [0, 0], 5)).toEqual({ prossimoIdx: -1, recuperoSecondi: 0, fineGiro: false });
  });
});

describe('passoDopoSerie: superset', () => {
  // A1 straight into A2 (pause 0), 90 seconds after the round, 3 rounds
  const superset = [forza(1, 1, 0, 3), forza(2, 1, 90, 3)];

  it('A1 → A2 with no timer, rest after the round, back to A1, three rounds', () => {
    expect(allenamento(superset)).toEqual(['0:0', '1:90·', '0:0', '1:90·', '0:0', '1:90·']);
  });

  it('a pause between the members: the first member\'s rest, not after the round', () => {
    const conPausa = [forza(1, 1, 15, 2), forza(2, 1, 120, 2)];
    expect(passoDopoSerie(conPausa, [1, 0], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 15, fineGiro: false });
    expect(passoDopoSerie(conPausa, [1, 1], 1)).toEqual({ prossimoIdx: 0, recuperoSecondi: 120, fineGiro: true });
  });

  it('rest 0 after the round: straight back to A1; a missing pause in the round is 0, a missing rest after it 90', () => {
    expect(allenamento([forza(1, 1, 0, 2), forza(2, 1, 0, 2)])).toEqual(['0:0', '1:0·', '0:0', '1:0·']);
    const senza = [forza(1, 1, null, 2), forza(2, 1, null, 2)];
    expect(passoDopoSerie(senza, [1, 0], 0).recuperoSecondi).toBe(0);
    expect(passoDopoSerie(senza, [1, 1], 1).recuperoSecondi).toBe(90);
  });

  it('different sets: the round goes on with whoever still has sets (A1 4, A2 3)', () => {
    const diversi = [forza(1, 1, 0, 4), forza(2, 1, 60, 3)];
    expect(allenamento(diversi)).toEqual(['0:0', '1:60·', '0:0', '1:60·', '0:0', '1:60·', '0:60·']);
    // and the other way round (A1 2, A2 3): the last rounds are A2 alone
    expect(allenamento([forza(1, 1, 0, 2), forza(2, 1, 60, 3)])).toEqual(['0:0', '1:60·', '0:0', '1:60·', '1:60·']);
  });

  it('the member alone in its last rounds rests after each set with the rest after the round', () => {
    expect(passoDopoSerie([forza(1, 1, 0, 4), forza(2, 1, 60, 3)], [4, 3], 0))
      .toEqual({ prossimoIdx: -1, recuperoSecondi: 60, fineGiro: true });
  });

  it('one more set today (serieOggi) adds a round for that member, one less takes it away', () => {
    const inPiu = [{ ...forza(1, 1, 0, 2), serieOggi: 3 }, forza(2, 1, 60, 2)];
    expect(allenamento(inPiu)).toEqual(['0:0', '1:60·', '0:0', '1:60·', '0:60·']);
    const inMeno = [forza(1, 1, 0, 3), { ...forza(2, 1, 60, 3), serieOggi: 2 }];
    expect(allenamento(inMeno)).toEqual(['0:0', '1:60·', '0:0', '1:60·', '0:60·']);
  });

  it('a skipped set counts as done: the step is the same', () => {
    // A2's second set skipped: still back to A1 for the third round
    expect(passoDopoSerie(superset, [2, 2], 1)).toEqual({ prossimoIdx: 0, recuperoSecondi: 90, fineGiro: true });
  });

  it('a member skipped altogether (all its sets counted) leaves the round, the other goes on alone', () => {
    // A1 skipped: its sets are all counted, A2 does its rounds alone
    expect(passoDopoSerie(superset, [3, 1], 1)).toEqual({ prossimoIdx: 1, recuperoSecondi: 90, fineGiro: true });
    // A2 skipped in the middle of the workout: A1 goes on alone, with the rest after the round
    expect(passoDopoSerie(superset, [2, 3], 0)).toEqual({ prossimoIdx: 0, recuperoSecondi: 90, fineGiro: true });
  });

  it('warm-up entries are no member: the round is the two strength exercises', () => {
    const lista = [{ esercizioId: 9, riscaldamento: true, durataMinuti: 5, gruppo: 1, serieTarget: 1 }, ...superset];
    expect(passoDopoSerie(lista, [1, 0, 0], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 90, fineGiro: false });
    expect(passoDopoSerie(lista, [1, 1, 0], 1)).toEqual({ prossimoIdx: 2, recuperoSecondi: 0, fineGiro: false });
  });
});

describe('passoDopoSerie: a group inside a plan', () => {
  // Squat, then superset A (Bench A1, Row A2), then Curl
  const scheda = [forza(1, null, 120, 2), forza(2, 1, 0, 2), forza(3, 1, 75, 2), forza(4, null, 60, 2)];

  it('before, in turn, after: the whole workout', () => {
    expect(allenamento(scheda)).toEqual([
      '0:120', '0:120',
      '1:0', '2:75·', '1:0', '2:75·',
      '3:60', '3:60'
    ]);
  });

  it('every round done: the first exercise not finished after the group, with the rest after the round', () => {
    expect(passoDopoSerie(scheda, [2, 2, 2, 0], 2)).toEqual({ prossimoIdx: 3, recuperoSecondi: 75, fineGiro: true });
    // Curl already done: back to an exercise left before the group
    expect(passoDopoSerie(scheda, [0, 2, 2, 2], 2).prossimoIdx).toBe(0);
    expect(passoDopoSerie(scheda, [2, 2, 2, 2], 2).prossimoIdx).toBe(-1);
  });

  it('the exercise before the group, finished, goes to the first member', () => {
    expect(passoDopoSerie(scheda, [2, 0, 0, 0], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 120, fineGiro: false });
  });

  it('a circuit of three: A1 → A2 → A3 → rest → A1', () => {
    const circuito = [forza(1, 2, 0, 2), forza(2, 2, 10, 2), forza(3, 2, 60, 2)];
    expect(allenamento(circuito)).toEqual(['0:0', '1:10', '2:60·', '0:0', '1:10', '2:60·']);
    // A2 finished early (skipped): A3 → A1 in the round
    expect(passoDopoSerie(circuito, [2, 2, 1], 0)).toEqual({ prossimoIdx: 2, recuperoSecondi: 0, fineGiro: false });
  });

  it('two groups one after the other: the second starts when the first is done', () => {
    const due = [forza(1, 1, 0, 1), forza(2, 1, 30, 1), forza(3, 2, 0, 1), forza(4, 2, 45, 1)];
    expect(allenamento(due)).toEqual(['0:0', '1:30·', '2:0', '3:45·']);
  });
});

describe('giroDi', () => {
  const scheda = [forza(1, null), forza(2, 1, 0, 4), forza(3, 1, 90, 3), forza(4, 1, 90, 3)];

  it('outside a group: null', () => {
    expect(giroDi(scheda, [0, 0, 0, 0], 0)).toBeNull();
  });

  it('the member\'s label, the round of its next set, the most sets of a member as rounds', () => {
    expect(giroDi(scheda, [3, 1, 1, 0], 3)).toEqual({ lettera: 'A', etichetta: 'A3', tipo: 'circuito', giro: 1, giri: 4 });
    expect(giroDi(scheda, [3, 1, 0, 0], 1)).toEqual({ lettera: 'A', etichetta: 'A1', tipo: 'circuito', giro: 2, giri: 4 });
  });

  it('a superset; once a member is done, its last round', () => {
    const superset = [forza(1, 1, 0, 2), forza(2, 1, 60, 2)];
    expect(giroDi(superset, [2, 2], 0)).toMatchObject({ tipo: 'superset', giro: 2, giri: 2 });
  });
});

describe('membroDiTurno (resuming a workout)', () => {
  const scheda = [forza(1, null, 90, 2), forza(2, 1, 0, 3), forza(3, 1, 90, 3)];

  it('half a round done: the member whose turn it is', () => {
    expect(membroDiTurno(scheda, [2, 2, 1], 1)).toBe(2);
  });

  it('round complete: the first member', () => {
    expect(membroDiTurno(scheda, [2, 1, 1], 1)).toBe(1);
  });

  it('a member already finished does not count, outside a group the index itself', () => {
    expect(membroDiTurno([forza(1, 1, 0, 4), forza(2, 1, 60, 2)], [3, 2], 0)).toBe(0);
    expect(membroDiTurno(scheda, [0, 0, 0], 0)).toBe(0);
  });
});

describe('blocchiStorico (a past workout in the history)', () => {
  // An exercise of the history: its group that day and the ids of its sets
  const fatto = (esercizioId, gruppo, ...idSerie) => ({ esercizio: { id: esercizioId }, gruppo, serie: idSerie.map(id => ({ id })) });
  const vista = blocchi => blocchi.map(b => (b.gruppo == null
    ? b.voci[0].es.esercizio.id
    : [b.lettera, b.tipo, b.voci.map(v => `${v.etichetta}:${v.es.esercizio.id}`)]));

  it('a workout without groups: one block per exercise, same order and indexes', () => {
    const esercizi = [fatto(3, null, 5), fatto(1, null, 1), fatto(2, null, 3)];
    const blocchi = blocchiStorico(esercizi);
    expect(vista(blocchi)).toEqual([3, 1, 2]);
    expect(blocchi.map(b => b.voci[0].indice)).toEqual([0, 1, 2]);
  });

  it('the members of a superset together, at the place of the first, in the order they were started', () => {
    // The history lists exercises by id: the rows (id 2) were started after the bench (id 7)
    const esercizi = [fatto(1, null, 1, 2), fatto(2, 1, 11, 13), fatto(5, null, 20), fatto(7, 1, 10, 12)];
    expect(vista(blocchiStorico(esercizi))).toEqual([1, ['A', 'superset', ['A1:7', 'A2:2']], 5]);
  });

  it('a circuit keeps the letter of its plan; a group with one exercise left is no group', () => {
    const esercizi = [fatto(1, 1, 4), fatto(2, 2, 1), fatto(3, 2, 2), fatto(4, 2, 3)];
    expect(vista(blocchiStorico(esercizi))).toEqual([1, ['B', 'circuito', ['B1:2', 'B2:3', 'B3:4']]]);
  });

  it('members without sets keep the order of the list', () => {
    const esercizi = [fatto(1, 1), fatto(2, 1)];
    expect(vista(blocchiStorico(esercizi))).toEqual([['A', 'superset', ['A1:1', 'A2:2']]]);
  });
});
