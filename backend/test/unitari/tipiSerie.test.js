// Set types: what counts towards volume, in what order they are shown, what is accepted
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { volumeDi, diLavoro, leggiTipo, ordineSerie } from '../../src/utils/tipiSerie.js';
import { ErroreValidazione } from '../../src/utils/errori.js';

describe('volumeDi', () => {
  it('conta lavoro e drop completati, non il riscaldamento ne\' le serie saltate', () => {
    assert.equal(volumeDi([
      { tipo: 'RISCALDAMENTO', pesoEffettivo: 40, repEffettive: 10, completato: true },
      { tipo: 'LAVORO', pesoEffettivo: 80, repEffettive: 8, completato: true },
      { tipo: 'DROP', pesoEffettivo: 60, repEffettive: 6, completato: true },
      { tipo: 'LAVORO', pesoEffettivo: 80, repEffettive: 8, completato: false },
      { pesoEffettivo: 10, repEffettive: 10 }
    ]), 80 * 8 + 60 * 6 + 10 * 10);
  });
});

describe('diLavoro', () => {
  it('senza tipo una serie e\' di lavoro', () => {
    assert.equal(diLavoro({}), true);
    assert.equal(diLavoro({ tipo: 'LAVORO' }), true);
    assert.equal(diLavoro({ tipo: 'DROP' }), false);
    assert.equal(diLavoro({ tipo: 'RISCALDAMENTO' }), false);
  });
});

describe('leggiTipo', () => {
  it('assente vale LAVORO, i tre tipi passano', () => {
    assert.equal(leggiTipo(undefined), 'LAVORO');
    assert.equal(leggiTipo(null), 'LAVORO');
    for (const tipo of ['LAVORO', 'RISCALDAMENTO', 'DROP']) assert.equal(leggiTipo(tipo), tipo);
  });

  it('il resto no, e dice quale serie', () => {
    assert.throws(() => leggiTipo('lavoro', 'Serie 2: '), errore =>
      errore instanceof ErroreValidazione && errore.message === 'Serie 2: tipo di serie non valido');
  });
});

describe('ordineSerie', () => {
  it('riscaldamento, poi ogni serie di lavoro seguita dai suoi drop, a parita\' per id', () => {
    const serie = [
      { id: 5, tipo: 'LAVORO', serieNumero: 2 },
      { id: 4, tipo: 'DROP', serieNumero: 1 },
      { id: 9, tipo: 'DROP', serieNumero: 1 },
      { id: 3, tipo: 'LAVORO', serieNumero: 1 },
      { id: 2, tipo: 'RISCALDAMENTO', serieNumero: 2 },
      { id: 1, tipo: 'RISCALDAMENTO', serieNumero: 1 }
    ];
    assert.deepEqual([...serie].sort(ordineSerie).map(s => s.id), [1, 2, 3, 4, 9, 5]);
  });
});
