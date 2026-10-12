// Reminders must use local time, not UTC: between midnight and 2 am (1 am in
// winter) the days differ, and getHours() in server.js would skip or delay
// the reminder.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orarioLocale } from '../../src/utils/date.js';

describe('promemoria - ora locale', () => {
  it('orarioLocale restituisce l\'ora di Copenaghen, non UTC', () => {
    // 2026-10-12 at 06:30 UTC is 08:30 local (summer time, UTC+2)
    const mattina = '2026-10-12T06:30:00Z';
    const { ora } = orarioLocale(mattina);
    assert.equal(ora, 8);

    // 2026-01-15 at 07:30 UTC is 08:30 local (winter time, UTC+1)
    const inverno = '2026-01-15T07:30:00Z';
    const { ora: oraInverno } = orarioLocale(inverno);
    assert.equal(oraInverno, 8);
  });

  it('con getHours() UTC il controllo delle 8 sarebbe sbagliato', () => {
    // Same instants as above
    const mattina = new Date('2026-10-12T06:30:00Z');
    const inverno = new Date('2026-01-15T07:30:00Z');

    // getHours() returns UTC hours: 6 and 7, both less than 8
    assert.equal(mattina.getHours(), 6); // Would skip the reminder
    assert.equal(inverno.getHours(), 7); // Would skip the reminder

    // But in Copenhagen it's already 8:30, so the reminder should run
    assert.equal(orarioLocale(mattina).ora, 8);
    assert.equal(orarioLocale(inverno).ora, 8);
  });
});
