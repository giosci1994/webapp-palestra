// The crowd reports' aggregates: level → percentage, a cell's threshold
// (15 reports from 2 people in 12 weeks), the live one (2 reports from 2
// people in 45 minutes) and the weights of the averages.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentualeDi, aggregaCelle, aggregaLive, LIVELLI_AFFLUENZA,
  MIN_SEGNALAZIONI_CELLA, MIN_UTENTI_CELLA, SETTIMANE_CELLA, MINUTI_LIVE, MIN_SEGNALAZIONI_LIVE, MIN_UTENTI_LIVE
} from '../../src/utils/affluenzaSegnalata.js';

const MINUTO = 60 * 1000;
const SETTIMANA = 7 * 24 * 60 * MINUTO;
const ADESSO = new Date('2026-11-27T17:00:00Z');
const fa = ms => new Date(ADESSO.getTime() - ms);

/** n reports in one cell (Tuesday 18:00), from the given users in turn */
const reports = (n, { utenti = [1, 2], livello = 2, istante = fa(SETTIMANA), giornoSettimana = 1, ora = 18 } = {}) =>
  Array.from({ length: n }, (_, i) => ({ giornoSettimana, ora, livello, utenteId: utenti[i % utenti.length], istante }));

describe('the thresholds Giovanni chose', () => {
  it('are the agreed numbers', () => {
    assert.deepEqual([MIN_SEGNALAZIONI_CELLA, MIN_UTENTI_CELLA, SETTIMANE_CELLA], [15, 2, 12]);
    assert.deepEqual([MIN_SEGNALAZIONI_LIVE, MIN_UTENTI_LIVE, MINUTI_LIVE], [2, 2, 45]);
  });
});

describe('percentualeDi', () => {
  it('converts the four levels, refuses anything else', () => {
    assert.deepEqual([0, 1, 2, 3].map(percentualeDi), LIVELLI_AFFLUENZA);
    assert.deepEqual(LIVELLI_AFFLUENZA, [5, 25, 55, 85]);
    for (const sbagliato of [-1, 4, 1.5, '2', null, undefined]) assert.equal(percentualeDi(sbagliato), null);
  });
});

describe('aggregaCelle', () => {
  it('14 reports are not enough, 15 are', () => {
    assert.equal(aggregaCelle(reports(14), ADESSO)[0].sufficiente, false);
    const [cella] = aggregaCelle(reports(15), ADESSO);
    assert.equal(cella.sufficiente, true);
    assert.deepEqual([cella.giornoSettimana, cella.ora, cella.segnalazioni, cella.utenti, cella.livelloPercentuale], [1, 18, 15, 2, 55]);
  });

  it('15 reports from one person are not enough', () => {
    const [cella] = aggregaCelle(reports(30, { utenti: [7] }), ADESSO);
    assert.deepEqual([cella.segnalazioni, cella.utenti, cella.sufficiente], [30, 1, false]);
  });

  it('only the last 12 weeks count', () => {
    const vecchie = reports(10, { istante: fa(SETTIMANE_CELLA * SETTIMANA + MINUTO) });
    const [cella] = aggregaCelle([...vecchie, ...reports(10)], ADESSO);
    assert.deepEqual([cella.segnalazioni, cella.sufficiente], [10, false]);
    assert.deepEqual(aggregaCelle(vecchie, ADESSO), []);
  });

  it('reports older than 4 weeks weigh half', () => {
    const recenti = reports(1, { livello: 3, istante: fa(SETTIMANA) }); // 85, weight 1
    const vecchie = reports(2, { livello: 0, istante: fa(6 * SETTIMANA) }); // 5, weight 0.5 each
    assert.equal(aggregaCelle([...recenti, ...vecchie], ADESSO)[0].livelloPercentuale, Math.round((85 + 5 * 0.5 * 2) / 2));
  });

  it('one cell per weekday and hour, sorted, with the last report; no user ids', () => {
    const celle = aggregaCelle([
      ...reports(2, { giornoSettimana: 3, ora: 9 }),
      ...reports(1, { giornoSettimana: 1, ora: 18, istante: fa(MINUTO) }),
      ...reports(1, { giornoSettimana: 1, ora: 7 })
    ], ADESSO);
    assert.deepEqual(celle.map(c => [c.giornoSettimana, c.ora]), [[1, 7], [1, 18], [3, 9]]);
    assert.equal(celle[1].ultimaSegnalazione.getTime(), fa(MINUTO).getTime());
    assert.ok(celle.every(c => !('utenteId' in c)));
  });

  it('skips levels out of range and reports in the future', () => {
    assert.deepEqual(aggregaCelle([...reports(1, { livello: 9 }), ...reports(1, { istante: new Date(ADESSO.getTime() + MINUTO) })], ADESSO), []);
  });
});

describe('aggregaLive', () => {
  it('needs 2 reports from 2 different people in the last 45 minutes', () => {
    assert.equal(aggregaLive(reports(1, { istante: fa(MINUTO) }), ADESSO), null);
    assert.equal(aggregaLive(reports(5, { utenti: [1], istante: fa(MINUTO) }), ADESSO), null);
    const live = aggregaLive(reports(2, { istante: fa(10 * MINUTO) }), ADESSO);
    assert.deepEqual([live.segnalazioni, live.livelloPercentuale], [2, 55]);
  });

  it('a report older than 45 minutes does not count', () => {
    const righe = [...reports(1, { utenti: [1], istante: fa(5 * MINUTO) }), ...reports(1, { utenti: [2], istante: fa(MINUTI_LIVE * MINUTO + 1) })];
    assert.equal(aggregaLive(righe, ADESSO), null);
    const alLimite = [...reports(1, { utenti: [1], istante: fa(5 * MINUTO) }), ...reports(1, { utenti: [2], istante: fa(MINUTI_LIVE * MINUTO) })];
    assert.equal(aggregaLive(alLimite, ADESSO).segnalazioni, 2);
  });

  it('the newest report weighs more, and gives the time of the last one', () => {
    const righe = [
      ...reports(1, { utenti: [1], livello: 3, istante: fa(0) }), // 85, weight 1
      ...reports(1, { utenti: [2], livello: 0, istante: fa(MINUTI_LIVE * MINUTO) }) // 5, weight 0.5
    ];
    const live = aggregaLive(righe, ADESSO);
    assert.equal(live.livelloPercentuale, Math.round((85 + 5 * 0.5) / 1.5));
    assert.equal(live.ultimaSegnalazione.getTime(), ADESSO.getTime());
    assert.deepEqual(Object.keys(live).sort(), ['livelloPercentuale', 'segnalazioni', 'ultimaSegnalazione']);
  });
});
