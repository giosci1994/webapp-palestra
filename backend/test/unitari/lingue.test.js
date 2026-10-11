// The server's languages: which one a request or a user gets, and the texts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  linguaDaIntestazione, linguaDiUtente, linguaCorrente, conLingua, traduci, linguaSupportata
} from '../../src/i18n/index.js';
import { ErroreNonTrovato } from '../../src/utils/errori.js';

describe('the language of a request', () => {
  it('is the first supported one in Accept-Language, by preference', () => {
    assert.equal(linguaDaIntestazione('it'), 'it');
    assert.equal(linguaDaIntestazione('it-IT,it;q=0.9,en;q=0.8'), 'it');
    assert.equal(linguaDaIntestazione('fr-FR,fr;q=0.9,it;q=0.5,en;q=0.3'), 'it');
    assert.equal(linguaDaIntestazione('en;q=0.4,it;q=0.9'), 'it');
  });

  it('is English without a header or without a supported language', () => {
    assert.equal(linguaDaIntestazione(undefined), 'en');
    assert.equal(linguaDaIntestazione(''), 'en');
    assert.equal(linguaDaIntestazione('de-DE,fr'), 'en');
  });

  it('recognises codes with a region', () => {
    assert.deepEqual(['it_CH', 'EN-us', 'es'].map(linguaSupportata), ['it', 'en', null]);
  });
});

describe('the language of a user, outside a request', () => {
  it('is the one chosen in Profile, then the one the app last used, then English', () => {
    assert.equal(linguaDiUtente({ lingua: 'en', linguaApp: 'it' }), 'en');
    assert.equal(linguaDiUtente({ lingua: null, linguaApp: 'it' }), 'it');
    assert.equal(linguaDiUtente({ lingua: null, linguaApp: null }), 'en');
    assert.equal(linguaDiUtente(null), 'en');
  });

  it('conLingua sets it for the code inside, even across awaits', async () => {
    assert.equal(linguaCorrente(), 'en');
    const dentro = await conLingua('it', async () => {
      await new Promise(r => setTimeout(r, 1));
      return [linguaCorrente(), traduci('errori.nonTrovato'), new ErroreNonTrovato().message];
    });
    assert.deepEqual(dentro, ['it', 'Risorsa non trovata', 'Risorsa non trovata']);
    assert.equal(linguaCorrente(), 'en');
  });
});

describe('translating', () => {
  it('reads the texts, falls back to the key, fills placeholders and plurals', () => {
    assert.equal(traduci('errori.nonTrovato', {}, 'en'), 'Not found');
    assert.equal(traduci('gruppi.Petto', {}, 'en'), 'Chest');
    assert.equal(traduci('inesistente.chiave', {}, 'it'), 'inesistente.chiave');
  });
});
