// The cardio machines the Telegram bot recognises in what the user writes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MACCHINE_CARDIO, macchinaCardio, eEsercizioCardio } from '../../src/utils/macchineCardio.js';
import { schemaVoceCardio, schemaGuidaAggiungi, DURATA_CARDIO_PREDEFINITA } from '../../src/validators/bot.schema.js';

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

describe('a cardio exercise of the catalogue', () => {
  it('is cardio by its muscle group or by its equipment', () => {
    assert.equal(eEsercizioCardio({ gruppoMuscoloPrimario: 'Cardio', attrezzatura: null }), true);
    assert.equal(eEsercizioCardio({ gruppoMuscoloPrimario: 'Quadricipiti', attrezzatura: { categoria: 'CARDIO' } }), true);
    assert.equal(eEsercizioCardio({ gruppoMuscoloPrimario: 'Petto', attrezzatura: { categoria: 'PESI_LIBERI' } }), false);
    assert.equal(eEsercizioCardio({ gruppoMuscoloPrimario: 'Petto' }), false);
    assert.equal(eEsercizioCardio(null), false);
  });
});

describe('the minutes of a cardio entry from the bot', () => {
  it('missing, null or empty take the default; the app\'s limits still hold', () => {
    assert.equal(DURATA_CARDIO_PREDEFINITA, 10);
    for (const corpo of [{}, { durataMinuti: null }, { durataMinuti: '' }]) {
      assert.equal(schemaVoceCardio.parse(corpo).durataMinuti, 10);
    }
    assert.equal(schemaVoceCardio.parse({ durataMinuti: '25' }).durataMinuti, 25);
    assert.equal(schemaVoceCardio.safeParse({ durataMinuti: 1441 }).success, false);
    assert.equal(schemaGuidaAggiungi.parse({ chatId: 1, esercizioId: 2, durataMinuti: '15' }).durataMinuti, 15);
  });
});
