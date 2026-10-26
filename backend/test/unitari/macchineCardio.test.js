// The cardio machines the Telegram bot recognises in what the user writes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MACCHINE_CARDIO, macchinaCardio } from '../../src/utils/macchineCardio.js';

const nome = testo => macchinaCardio(testo)?.nome ?? null;

describe('cardio machines', () => {
  it('English names, with the Italian ones next to them, like the catalogue', () => {
    assert.deepEqual(MACCHINE_CARDIO.map(m => [m.nome, m.nomeIt]), [
      ['Treadmill', 'Tapis Roulant'], ['Exercise Bike', 'Cyclette'], ['Elliptical', 'Ellittica'],
      ['Rowing Machine', 'Vogatore'], ['Stepper', 'Stepper'], ['Air Bike', 'Air Bike']
    ]);
  });

  it('are recognised in Italian and English words', () => {
    assert.equal(nome('10 minuti di tapis per scaldarmi'), 'Treadmill');
    assert.equal(nome('Treadmill'), 'Treadmill');
    assert.equal(nome('cyclette'), 'Exercise Bike');
    assert.equal(nome('exercise bike'), 'Exercise Bike');
    assert.equal(nome('Rowing machine'), 'Rowing Machine');
    assert.equal(nome('vogatore'), 'Rowing Machine');
    assert.equal(nome('ellittica'), 'Elliptical');
    assert.equal(nome('stepper'), 'Stepper');
  });

  it('"air bike" is the Air Bike, not the exercise bike that "bike" alone would give', () => {
    assert.equal(nome('air bike'), 'Air Bike');
    assert.equal(nome('20 min di air-bike'), 'Air Bike');
    assert.equal(nome('bike'), 'Exercise Bike');
  });

  it('nothing for a text with no machine', () => {
    assert.equal(nome(''), null);
    assert.equal(nome(null), null);
    assert.equal(nome('panca piana'), null);
  });
});
