import { describe, it, expect } from 'vitest';
import { marcatoriCalendario, COLORI_CALENDARIO } from './marcatoriCalendario.js';

const { completato, inProgramma, saltato } = COLORI_CALENDARIO;
const colori = (marcatori, giorno) => (marcatori[giorno] || []).map(m => m.colore);
/** A local time on the phone, as the server sends it */
const alle = (giorno, ore, minuti) => new Date(2026, 9, giorno, ore, minuti).toISOString();

describe('marcatoriCalendario', () => {
  it('a workout still on the calendar is violet', () => {
    const marcatori = marcatoriCalendario([], [{ data: '2026-10-28', stato: 'PIANIFICATO' }]);
    expect(colori(marcatori, '2026-10-28')).toEqual([inProgramma]);
  });

  it('done is green, skipped is grey', () => {
    const marcatori = marcatoriCalendario([], [
      { data: '2026-10-20', stato: 'COMPLETATO' },
      { data: '2026-10-22', stato: 'SALTATO' }
    ]);
    expect(colori(marcatori, '2026-10-20')).toEqual([completato]);
    expect(colori(marcatori, '2026-10-22')).toEqual([saltato]);
  });

  it('one dot per kind and day: a scheduled workout done and the workout itself are one green dot', () => {
    const marcatori = marcatoriCalendario(
      [{ dataInizio: alle(20, 18, 0) }, { dataInizio: alle(20, 19, 30) }],
      [{ data: '2026-10-20', stato: 'COMPLETATO' }, { data: '2026-10-20', stato: 'PIANIFICATO' }]
    );
    expect(colori(marcatori, '2026-10-20')).toEqual([completato, inProgramma]);
  });

  it('a workout started after midnight counts on that day, not on the day before in UTC', () => {
    const marcatori = marcatoriCalendario([{ dataInizio: alle(26, 0, 30) }]);
    expect(colori(marcatori, '2026-10-26')).toEqual([completato]);
    expect(marcatori['2026-10-25']).toBeUndefined();
  });

  it('nothing to show, no dots', () => {
    expect(marcatoriCalendario()).toEqual({});
  });
});
