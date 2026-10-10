// Il profilo si esporta campo per campo: qui si controlla che ogni colonna di
// Utente sia stata assegnata a una delle due liste. Chi aggiunge una colonna
// allo schema deve decidere se finisce nel file dell'utente o resta riservata;
// senza questo test sparirebbe dall'esportazione in silenzio.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  CAMPI_PROFILO, CAMPI_RISERVATI, nomeFileEsportazione
} from '../../src/services/esportazioneDati.service.js';

describe('campi del profilo nell\'esportazione', () => {
  const colonne = Prisma.dmmf.datamodel.models
    .find(m => m.name === 'Utente').fields
    .filter(f => f.kind === 'scalar' || f.kind === 'enum')
    .map(f => f.name);

  it('ogni colonna di Utente e\' esportata o dichiarata riservata', () => {
    const decise = new Set([...CAMPI_PROFILO, ...Object.keys(CAMPI_RISERVATI)]);
    const senzaDecisione = colonne.filter(c => !decise.has(c));
    assert.deepEqual(senzaDecisione, [], 'aggiungile a CAMPI_PROFILO o a CAMPI_RISERVATI');
  });

  it('nessuna colonna sta in entrambe le liste, e nessuna e\' inventata', () => {
    assert.deepEqual(CAMPI_PROFILO.filter(c => c in CAMPI_RISERVATI), []);
    assert.deepEqual([...CAMPI_PROFILO, ...Object.keys(CAMPI_RISERVATI)].filter(c => !colonne.includes(c)), []);
  });

  it('i segreti restano fuori', () => {
    for (const segreto of ['passwordHash', 'tokenVerificaEmail', 'tokenResetPassword']) {
      assert.ok(!CAMPI_PROFILO.includes(segreto), segreto);
    }
  });
});

describe('nomeFileEsportazione', () => {
  it('porta il giorno di Copenaghen, anche quando in UTC e\' ancora ieri', () => {
    assert.equal(nomeFileEsportazione(new Date('2026-10-09T22:30:00Z')), 'gymmaster-dati-2026-10-10.json');
    assert.equal(nomeFileEsportazione(new Date('2026-10-09T21:30:00Z')), 'gymmaster-dati-2026-10-09.json');
  });
});
