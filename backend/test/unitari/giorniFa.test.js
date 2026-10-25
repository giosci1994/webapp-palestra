// The tests' "n days ago" (test/supporto/giorni.js) counts days on the
// calendar, not steps of 24 hours: around the daylight saving changes the
// steps fell a day off in the hour next to midnight, and the tests counting
// days failed. Summer time ends on 25 October 2026 and starts on 28 March 2027.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { giorniFa, GIORNO } from '../supporto/giorni.js';
import { chiaveGiorno } from '../../src/utils/date.js';

const COPENAGHEN = 'Europe/Copenhagen';
const giorno = istante => chiaveGiorno(istante, COPENAGHEN);

describe('giorniFa', () => {
  it('in the last hour of the day summer time ends (25 hours long), 5 days ago is the 20th', () => {
    const adesso = Date.parse('2026-10-25T22:40:00Z'); // 23:40 in Copenhagen
    assert.equal(giorniFa(5, COPENAGHEN, adesso).toISOString(), '2026-10-20T21:40:00.000Z'); // 23:40 summer time
    assert.equal(giorno(giorniFa(1, COPENAGHEN, adesso)), '2026-10-24');
    // 5 × 24 hours fell on the 21st, 4 days back on the calendar
    assert.equal(giorno(adesso - 5 * GIORNO), '2026-10-21');
  });

  it('a few days later, in the hour before midnight, still 5 days on the calendar', () => {
    const adesso = Date.parse('2026-10-28T22:45:00Z'); // 23:45 in Copenhagen
    assert.equal(giorno(giorniFa(5, COPENAGHEN, adesso)), '2026-10-23');
    assert.equal(giorno(adesso - 5 * GIORNO), '2026-10-24');
  });

  it('in the first hour after the night summer time starts (23 hours long), yesterday is the 28th', () => {
    const adesso = Date.parse('2027-03-28T22:30:00Z'); // 00:30 on the 29th in Copenhagen
    assert.equal(giorno(giorniFa(1, COPENAGHEN, adesso)), '2027-03-28');
    assert.equal(giorno(giorniFa(5, COPENAGHEN, adesso)), '2027-03-24');
    // 24 hours earlier was already the 27th
    assert.equal(giorno(adesso - GIORNO), '2027-03-27');
  });

  it('tomorrow, the evening before summer time starts, is the next day', () => {
    const adesso = Date.parse('2027-03-27T22:45:00Z'); // 23:45 in Copenhagen
    assert.equal(giorno(giorniFa(-1, COPENAGHEN, adesso)), '2027-03-28');
    // 24 hours later is already the 29th
    assert.equal(giorno(adesso + GIORNO), '2027-03-29');
  });

  it('on other days it is n × 24 hours; a fraction is part of a day; in UTC days are always 24 hours', () => {
    const adesso = Date.parse('2026-11-11T12:00:00Z');
    assert.equal(giorniFa(7, COPENAGHEN, adesso).getTime(), adesso - 7 * GIORNO);
    assert.equal(giorniFa(-3, COPENAGHEN, adesso).getTime(), adesso + 3 * GIORNO);
    const cambio = Date.parse('2026-10-25T22:40:00Z');
    assert.equal(giorniFa(0.5, COPENAGHEN, cambio).getTime(), cambio - GIORNO / 2);
    assert.equal(giorniFa(5, 'UTC', cambio).getTime(), cambio - 5 * GIORNO);
  });
});
