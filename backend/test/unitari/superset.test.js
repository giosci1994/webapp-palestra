// Supersets and circuits in a plan (utils/superset.js): which exercises form
// a group, and which group a logged set belongs to.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaGruppi, gruppiPerEsercizio, eCardioOriscaldamento, gruppiDi, letteraGruppo } from '../../src/utils/superset.js';
import { schemaCreaScheda } from '../../src/validators/schede.schema.js';
import { eserciziDaSessione, formattaPerStorico } from '../../src/controllers/sessioni.controller.js';

const voce = (esercizioId, gruppo, altro = {}) => ({ esercizioId, gruppo, ...altro });
const gruppi = lista => normalizzaGruppi(lista).map(e => e.gruppo);

describe('normalizzaGruppi', () => {
  it('numbers the groups 1, 2, 3... in order, whatever number the client sent', () => {
    assert.deepEqual(gruppi([voce(1, 7), voce(2, 7), voce(3, null), voce(4, 3), voce(5, 3), voce(6, 3)]),
      [1, 1, null, 2, 2, 2]);
  });

  it('a number left alone is no group', () => {
    assert.deepEqual(gruppi([voce(1, 1), voce(2, null), voce(3, 2), voce(4, 2)]), [null, null, 1, 1]);
  });

  it('the same number in two places that are not next to each other makes two groups', () => {
    assert.deepEqual(gruppi([voce(1, 1), voce(2, 1), voce(3, null), voce(4, 1), voce(5, 1)]), [1, 1, null, 2, 2]);
  });

  it('two groups next to each other with different numbers stay apart', () => {
    assert.deepEqual(gruppi([voce(1, 5), voce(2, 5), voce(3, 6), voce(4, 6)]), [1, 1, 2, 2]);
  });

  it('warm-up and cardio never enter a group, and they split it', () => {
    assert.deepEqual(gruppi([
      voce(1, 1, { riscaldamento: true }), voce(2, 1), voce(3, 1), voce(4, 1, { durataMinuti: 10 }), voce(5, 1)
    ]), [null, 1, 1, null, null]);
  });

  it('keeps the other fields and does not change the list it receives', () => {
    const lista = [voce(1, 4, { serieTarget: 4 }), voce(2, 4, { serieTarget: 3 })];
    const [a, b] = normalizzaGruppi(lista);
    assert.deepEqual([a, b], [voce(1, 1, { serieTarget: 4 }), voce(2, 1, { serieTarget: 3 })]);
    assert.equal(lista[0].gruppo, 4);
  });

  it('a plan without groups stays without groups', () => {
    assert.deepEqual(gruppi([voce(1, undefined), voce(2, null)]), [null, null]);
    assert.deepEqual(normalizzaGruppi([]), []);
  });
});

describe('eCardioOriscaldamento', () => {
  it('the same test as the plan editor', () => {
    assert.equal(eCardioOriscaldamento({ serieTarget: 3, durataMinuti: null }), false);
    assert.equal(eCardioOriscaldamento({ riscaldamento: true }), true);
    assert.equal(eCardioOriscaldamento({ velocitaKmh: 9 }), true);
    assert.equal(eCardioOriscaldamento({ distanzaKm: 2 }), true);
  });
});

describe('gruppiPerEsercizio', () => {
  it('each exercise of the plan with its group, null outside one', () => {
    const mappa = gruppiPerEsercizio([voce(10, 2), voce(11, 2), voce(12, null), voce(13, 9)]);
    assert.deepEqual([...mappa], [[10, 1], [11, 1], [12, null], [13, null]]);
  });

  it('an exercise twice in the plan in different groups has none', () => {
    const mappa = gruppiPerEsercizio([voce(10, 1), voce(11, 1), voce(10, null)]);
    assert.equal(mappa.get(10), null);
    assert.equal(mappa.get(11), 1);
  });
});

describe('the group in the plan validator', () => {
  const valida = gruppo => schemaCreaScheda.safeParse({ esercizi: [{ esercizioId: 1, gruppo }] });

  it('a whole number from 1, as a number or text; empty means none', () => {
    assert.equal(valida(2).data.esercizi[0].gruppo, 2);
    assert.equal(valida('3').data.esercizi[0].gruppo, 3);
    assert.equal(valida(null).data.esercizi[0].gruppo, null);
    assert.equal(valida('').data.esercizi[0].gruppo, null);
    assert.equal(valida(undefined).data.esercizi[0].gruppo, undefined);
  });

  for (const sbagliato of [0, -1, 1.5, 'A', {}, [1], 1001]) {
    it(`refuses ${JSON.stringify(sbagliato)} with gruppoNonValido`, () => {
      const esito = valida(sbagliato);
      assert.equal(esito.success, false);
      assert.equal(esito.error.issues[0].message, 'schedeSchema.gruppoNonValido');
    });
  }
});

describe('the group in the history and in "save as plan"', () => {
  let id = 0;
  const serie = (esercizioId, gruppo) => ({
    id: ++id, esercizioId, gruppo, repEffettive: 10, pesoEffettivo: 50, completato: true, tipo: 'LAVORO',
    serieNumero: 1, esercizio: { id: esercizioId }
  });

  it('each exercise of the history says the group it was in that day', () => {
    const { esercizi } = formattaPerStorico({
      id: 1, dataInizio: new Date(), dataFine: new Date(), scheda: null, titolo: 'Libero', _count: { logSerie: 3 },
      logSerie: [serie(1, 1), serie(1, 1), serie(2, 1), serie(3, null)]
    });
    assert.deepEqual(esercizi.map(e => [e.esercizio.id, e.gruppo]), [[1, 1], [2, 1], [3, null]]);
  });

  it('a plan saved from a workout keeps the supersets done that day', () => {
    // A1 B1 A2 B2, then C on its own
    const esercizi = eserciziDaSessione([serie(1, 2), serie(2, 2), serie(1, 2), serie(2, 2), serie(3, null)]);
    assert.deepEqual(esercizi.map(e => [e.esercizioId, e.serieTarget, e.gruppo]), [[1, 2, 1], [2, 2, 1], [3, 1, null]]);
  });

  it('sets logged before the column existed give no group', () => {
    const [a, b] = eserciziDaSessione([serie(1, undefined), serie(2, undefined)]);
    assert.deepEqual([a.gruppo, b.gruppo], [null, null]);
  });
});

describe('gruppiDi (the labels of the Word export and the bot)', () => {
  it('A1, A2 for a superset, B1, B2, B3 for a circuit, nothing outside', () => {
    const posti = gruppiDi([voce(1, 4), voce(2, 4), voce(3, null), voce(4, 8), voce(5, 8), voce(6, 8)]);
    assert.deepEqual(posti.map(p => p?.etichetta ?? null), ['A1', 'A2', null, 'B1', 'B2', 'B3']);
    assert.deepEqual([posti[0].tipo, posti[3].tipo], ['superset', 'circuito']);
    assert.deepEqual(posti.map(p => (p ? [p.primo, p.ultimo] : null)),
      [[true, false], [false, true], null, [true, false], [false, false], [false, true]]);
    assert.deepEqual(posti[4].indici, [3, 4, 5]);
  });

  it('a number left alone and a plan without groups have no labels', () => {
    assert.deepEqual(gruppiDi([voce(1, 1), voce(2, null), voce(3, null)]), [null, null, null]);
  });

  it('letters A to Z, then AA', () => {
    assert.deepEqual([1, 2, 26, 27, 28].map(letteraGruppo), ['A', 'B', 'Z', 'AA', 'AB']);
  });
});
