import { describe, it, expect } from 'vitest';
import { periodoProssimi, prossimiDaFare, giorniDaOggi, PROSSIMI_MAX } from './inProgramma.js';

const piano = (id, data, stato = 'PIANIFICATO') => ({ id, data, stato, scheda: { id, titolo: `S${id}` } });

describe('the next days on the Allenati Ora page', () => {
  it('from tomorrow to six days after today, in local dates, across a month', () => {
    expect(periodoProssimi(new Date(2026, 9, 26, 23, 30))).toEqual({ da: '2026-10-27', a: '2026-11-01' });
    expect(periodoProssimi(new Date(2026, 11, 30, 0, 5))).toEqual({ da: '2026-12-31', a: '2027-01-05' });
  });

  it('only the ones still to do, by date, and at most a few', () => {
    const lista = [piano(4, '2026-10-29'), piano(2, '2026-10-27', 'SALTATO'), piano(3, '2026-10-28'), piano(1, '2026-10-28', 'COMPLETATO')];
    expect(prossimiDaFare(lista).map(p => p.id)).toEqual([3, 4]);
    const tanti = Array.from({ length: 6 }, (_, i) => piano(i + 1, `2026-10-2${7 + (i % 3)}`));
    expect(prossimiDaFare(tanti)).toHaveLength(PROSSIMI_MAX);
    expect(prossimiDaFare([])).toEqual([]);
  });

  it('how many days away, whatever the hour', () => {
    const sera = new Date(2026, 9, 26, 23, 59);
    expect(giorniDaOggi('2026-10-27', sera)).toBe(1);
    expect(giorniDaOggi('2026-11-01', sera)).toBe(6);
    // The night the clocks change (25 October 2026 in Europe) is still one day
    expect(giorniDaOggi('2026-10-26', new Date(2026, 9, 25, 0, 30))).toBe(1);
  });
});
