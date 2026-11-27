// Supersets and circuits in the plan editor: the same grouping rules as the
// server (backend/test/unitari/superset.test.js), plus join, split, arrows.
import { describe, it, expect } from 'vitest';
import {
  normalizzaGruppi, eCardioOriscaldamento, letteraGruppo, gruppiDi, blocchiDi, puoUnire,
  unisci, separa, impostaGiri, giriDi, ultimoDelGruppo, sposta, leggiSecondi
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
