// The day of a workout is the one on the Copenhagen calendar, not the server's
// UTC one: between midnight and 2 am (1 am in winter) the two differ. The
// October dates are in summer time (UTC+2), the January ones in standard time
// (UTC+1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  giornoLocale, orarioLocale, giorniDiCalendario, chiaveGiorno, inizioGiorno, lunediLocale, lunediDelGiorno,
  giorniDiFila, fusoValido, fusoDi, fusoCorrente, conFuso, FUSO_ORARIO
} from '../../src/utils/date.js';

const mezzanotteUtc = giorno => new Date(`${giorno}T00:00:00Z`);

describe('giornoLocale', () => {
  it("dopo mezzanotte locale e' gia' il giorno dopo, anche se in UTC non ancora", () => {
    assert.deepEqual(giornoLocale('2026-10-09T22:30:00Z'), mezzanotteUtc('2026-10-10')); // 00:30 local
    assert.deepEqual(giornoLocale('2026-10-09T21:59:00Z'), mezzanotteUtc('2026-10-09')); // 23:59 local
  });

  it("d'inverno il confine cade un'ora dopo", () => {
    assert.deepEqual(giornoLocale('2026-01-15T23:30:00Z'), mezzanotteUtc('2026-01-16')); // 00:30 local
    assert.deepEqual(giornoLocale('2026-01-15T22:30:00Z'), mezzanotteUtc('2026-01-15')); // 23:30 local
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
    // Monday 12 October 2026, 07:30 local
    assert.deepEqual(orarioLocale('2026-10-12T05:30:00Z'), { ora: 7, giornoSettimana: 0 });
    // Sunday 11 October, 23:30 local
    assert.deepEqual(orarioLocale('2026-10-11T21:30:00Z'), { ora: 23, giornoSettimana: 6 });
    // Monday 00:30 local, when in UTC it is still Sunday
    assert.deepEqual(orarioLocale('2026-10-11T22:30:00Z'), { ora: 0, giornoSettimana: 0 });
  });
});

// Every user has their own time zone: the one their phone sends. The
// Copenhagen calendar is the default, and the gym's
describe("the user's time zone", () => {
  const istante = '2026-10-12T22:30:00Z';

  it('the same instant is a different day and hour in Tokyo, Copenhagen and New York', () => {
    assert.equal(chiaveGiorno(istante, 'Asia/Tokyo'), '2026-10-13');
    assert.equal(chiaveGiorno(istante, 'Europe/Copenhagen'), '2026-10-13');
    assert.equal(chiaveGiorno(istante, 'America/New_York'), '2026-10-12');
    assert.equal(orarioLocale(istante, 'Asia/Tokyo').ora, 7);
    assert.equal(orarioLocale(istante, 'America/New_York').ora, 18);
  });

  it('only real IANA zones are accepted; without one, the gym\'s', () => {
    assert.equal(fusoValido('Europe/Rome'), 'Europe/Rome');
    for (const sbagliato of ['Marte/Olympus', '', null, 42, 'x'.repeat(65)]) assert.equal(fusoValido(sbagliato), null);
    assert.equal(fusoDi({ fusoOrario: 'Asia/Tokyo' }), 'Asia/Tokyo');
    assert.equal(fusoDi({ fusoOrario: 'boh' }), FUSO_ORARIO);
    assert.equal(fusoDi(null), FUSO_ORARIO);
  });

  it('conFuso sets it for the code inside, even across awaits', async () => {
    assert.equal(fusoCorrente(), FUSO_ORARIO);
    const dentro = await conFuso('Asia/Tokyo', async () => {
      await new Promise(r => setTimeout(r, 1));
      return [fusoCorrente(), chiaveGiorno(istante)];
    });
    assert.deepEqual(dentro, ['Asia/Tokyo', '2026-10-13']);
    assert.equal(fusoCorrente(), FUSO_ORARIO);
  });
});

describe('inizioGiorno', () => {
  it('is the instant of local midnight', () => {
    assert.equal(inizioGiorno('2026-10-12T22:30:00Z', 'Asia/Tokyo').toISOString(), '2026-10-12T15:00:00.000Z');
    assert.equal(inizioGiorno('2026-10-13T03:00:00Z', 'America/New_York').toISOString(), '2026-10-12T04:00:00.000Z');
    assert.equal(inizioGiorno('2026-10-12T06:30:00Z', 'Europe/Copenhagen').toISOString(), '2026-10-11T22:00:00.000Z');
  });

  it('on the days the clock changes, midnight keeps the offset it had', () => {
    // 25 October: summer time until 3 am, so midnight is still UTC+2
    assert.equal(inizioGiorno('2026-10-25T12:00:00Z', 'Europe/Copenhagen').toISOString(), '2026-10-24T22:00:00.000Z');
    // 29 March: standard time until 2 am, so midnight is still UTC+1
    assert.equal(inizioGiorno('2026-03-29T12:00:00Z', 'Europe/Copenhagen').toISOString(), '2026-03-28T23:00:00.000Z');
  });
});

describe('weeks and streaks', () => {
  it("Sunday night in Rome is already Monday: the week is the user's", () => {
    const domenicaSera = '2026-10-18T23:30:00Z';
    assert.equal(new Date(lunediLocale(domenicaSera, 'Europe/Rome')).toISOString().slice(0, 10), '2026-10-19');
    assert.equal(new Date(lunediLocale(domenicaSera, 'America/New_York')).toISOString().slice(0, 10), '2026-10-12');
    assert.equal(new Date(lunediDelGiorno(mezzanotteUtc('2026-10-18'))).toISOString().slice(0, 10), '2026-10-12');
  });

  it('the streak counts the local days in a row up to today, and is 0 without one today', () => {
    const adesso = new Date('2026-10-12T10:00:00Z');
    const ore = h => new Date(adesso.getTime() - h * 3600000);
    assert.equal(giorniDiFila([ore(0), ore(24), ore(48), ore(96)], adesso, 'Europe/Rome'), 3);
    assert.equal(giorniDiFila([ore(24)], adesso, 'Europe/Rome'), 0);
    // 23:30 yesterday in Rome is this morning in Tokyo: there it is the same day as now
    const ieriSera = new Date('2026-10-11T21:30:00Z');
    assert.equal(giorniDiFila([adesso, ieriSera], adesso, 'Europe/Rome'), 2);
    assert.equal(giorniDiFila([adesso, ieriSera], adesso, 'Asia/Tokyo'), 1);
  });
});
