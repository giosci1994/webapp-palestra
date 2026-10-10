// Il giorno di un allenamento e' quello del calendario di Copenaghen, non
// quello UTC del server: fra mezzanotte e le 2 (le 1 d'inverno) i due non
// coincidono. Le date di ottobre sono in ora legale (UTC+2), quelle di gennaio
// in ora solare (UTC+1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { giornoLocale, orarioLocale, giorniDiCalendario } from '../../src/utils/date.js';

const mezzanotteUtc = giorno => new Date(`${giorno}T00:00:00Z`);

describe('giornoLocale', () => {
  it("dopo mezzanotte locale e' gia' il giorno dopo, anche se in UTC non ancora", () => {
    assert.deepEqual(giornoLocale('2026-10-09T22:30:00Z'), mezzanotteUtc('2026-10-10')); // 00:30 locali
    assert.deepEqual(giornoLocale('2026-10-09T21:59:00Z'), mezzanotteUtc('2026-10-09')); // 23:59 locali
  });

  it("d'inverno il confine cade un'ora dopo", () => {
    assert.deepEqual(giornoLocale('2026-01-15T23:30:00Z'), mezzanotteUtc('2026-01-16')); // 00:30 locali
    assert.deepEqual(giornoLocale('2026-01-15T22:30:00Z'), mezzanotteUtc('2026-01-15')); // 23:30 locali
  });

  it('accetta Date, stringhe ISO e millisecondi', () => {
    const istante = '2026-10-09T22:30:00Z';
    const atteso = mezzanotteUtc('2026-10-10');
    assert.deepEqual(giornoLocale(new Date(istante)), atteso);
    assert.deepEqual(giornoLocale(Date.parse(istante)), atteso);
  });
});

describe('giorniDiCalendario', () => {
  it('ieri sera e stamattina distano un giorno', () => {
    assert.equal(giorniDiCalendario('2026-10-09T20:00:00Z', '2026-10-10T06:00:00Z'), 1);
  });

  it('mattina e sera dello stesso giorno distano zero', () => {
    assert.equal(giorniDiCalendario('2026-10-10T05:00:00Z', '2026-10-10T20:00:00Z'), 0);
  });

  it("attraverso il passaggio all'ora legale (29 marzo, giornata di 23 ore)", () => {
    assert.equal(giorniDiCalendario('2026-03-28T11:00:00Z', '2026-03-30T10:00:00Z'), 2);
  });
});

describe('orarioLocale', () => {
  it("ora e giorno della settimana di Copenaghen, con lunedi' = 0", () => {
    // Lunedi' 12 ottobre 2026, 07:30 locali
    assert.deepEqual(orarioLocale('2026-10-12T05:30:00Z'), { ora: 7, giornoSettimana: 0 });
    // Domenica 11 ottobre, 23:30 locali
    assert.deepEqual(orarioLocale('2026-10-11T21:30:00Z'), { ora: 23, giornoSettimana: 6 });
    // Lunedi' 00:30 locali, quando in UTC e' ancora domenica
    assert.deepEqual(orarioLocale('2026-10-11T22:30:00Z'), { ora: 0, giornoSettimana: 0 });
  });
});
