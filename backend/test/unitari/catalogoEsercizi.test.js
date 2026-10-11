// Catalogue entries (src/utils/catalogoEsercizi.js): the same data for the
// seed and for prisma/import-esercizi.js, Italian name included.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { datiEsercizioCatalogo } from '../../src/utils/catalogoEsercizi.js';

const catalogo = JSON.parse(readFileSync(new URL('../../prisma/dati/esercizi.json', import.meta.url), 'utf8'));

describe('datiEsercizioCatalogo', () => {
  it('adds the Italian name to an English one', () => {
    const dati = datiEsercizioCatalogo({ nome: 'Double Dumbbell Romanian Deadlift', gruppoMuscoloPrimario: 'Femorali' }, 7);
    assert.equal(dati.nome, 'Double Dumbbell Romanian Deadlift');
    assert.equal(dati.nomeIt, 'Stacco Rumeno con Due Manubri');
    assert.equal(dati.attrezzaturaRichiestaId, 7);
  });

  it('leaves a name already in Italian without an Italian name', () => {
    assert.equal(datiEsercizioCatalogo({ nome: 'Panca Piana con Bilanciere', gruppoMuscoloPrimario: 'Petto' }).nomeIt, null);
  });

  it('missing fields are null, not undefined', () => {
    const dati = datiEsercizioCatalogo({ nome: 'Barbell Hip Thrust', gruppoMuscoloPrimario: 'Glutei' });
    assert.equal(dati.attrezzaturaRichiestaId, null);
    for (const campo of ['gruppoMuscoloSecondario', 'descrizione', 'linkVideo', 'difficulty', 'classification']) {
      assert.equal(dati[campo], null, campo);
    }
  });

  it('every exercise of the catalogue gets an Italian name', () => {
    const senza = catalogo.filter(es => !datiEsercizioCatalogo(es).nomeIt).map(es => es.nome);
    assert.deepEqual(senza, []);
  });
});
