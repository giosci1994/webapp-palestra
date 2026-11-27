// The app theme a user can save on the account (Utente.tema).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leggiTema, TEMI } from '../../src/utils/temi.js';
import { ErroreValidazione } from '../../src/utils/errori.js';

describe('the theme saved on the account', () => {
  it('is light or dark', () => {
    assert.deepEqual(TEMI, ['chiaro', 'scuro']);
    assert.equal(leggiTema('chiaro'), 'chiaro');
    assert.equal(leggiTema('scuro'), 'scuro');
  });

  it('null, empty or "auto" follow the phone', () => {
    assert.deepEqual([null, '', 'auto'].map(leggiTema), [null, null, null]);
  });

  it('anything else is refused', () => {
    for (const valore of ['blu', 'dark', 1, {}]) assert.throws(() => leggiTema(valore), ErroreValidazione);
  });
});
