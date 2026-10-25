import { describe, it, expect } from 'vitest';
import { statoDaSessione, serieDiOggi, limitaSerieOggi, SERIE_MAX_OGGI, ESERCIZIO_EXTRA } from './ripresa.js';

const PANCA = { esercizioId: 1, esercizio: { id: 1, nome: 'Panca' }, serieTarget: 3 };
const SQUAT = { esercizioId: 2, esercizio: { id: 2, nome: 'Squat' }, serieTarget: 2 };
let prossimoId = 100;
const serie = (esercizioId, completato = true, tipo = 'LAVORO') =>
  ({ id: ++prossimoId, esercizioId, completato, tipo, esercizio: { id: esercizioId, nome: `Esercizio ${esercizioId}` } });
const sessione = (...logSerie) => ({ dataInizio: '2026-10-11T16:00:00.000Z', scheda: { esercizi: [PANCA, SQUAT] }, logSerie });

describe('statoDaSessione', () => {
  it('senza serie: primo esercizio, prima serie, cronometro dall\'inizio vero', () => {
    expect(statoDaSessione(sessione())).toEqual({
      eserciziLive: [PANCA, SQUAT], serieCompletate: [], esercizioIdx: 0, serieCorrente: 1,
      tempoInizio: Date.parse('2026-10-11T16:00:00.000Z')
    });
  });

  it('riparte dalla serie dopo l\'ultima registrata', () => {
    const stato = statoDaSessione(sessione(serie(1), serie(1)));
    expect([stato.esercizioIdx, stato.serieCorrente, stato.serieCompletate.length]).toEqual([0, 3, 2]);
  });

  it('finito un esercizio passa al primo con serie da fare; le saltate contano come fatte ma non come completate', () => {
    const stato = statoDaSessione(sessione(serie(1), serie(1, false), serie(1), serie(2)));
    expect([stato.esercizioIdx, stato.serieCorrente]).toEqual([1, 2]);
    expect(stato.serieCompletate.map(s => s.esercizioId)).toEqual([1, 1, 2]);
  });

  it('riscaldamento e drop non contano come serie fatte, ma restano fra le completate', () => {
    const stato = statoDaSessione(sessione(serie(1, true, 'RISCALDAMENTO'), serie(1), serie(1, true, 'DROP')));
    expect([stato.esercizioIdx, stato.serieCorrente]).toEqual([0, 2]);
    expect(stato.serieCompletate.map(s => s.tipo)).toEqual(['RISCALDAMENTO', 'LAVORO', 'DROP']);
  });

  it('un esercizio saltato del tutto resta da fare: si torna li\'', () => {
    const stato = statoDaSessione(sessione(serie(2), serie(2)));
    expect([stato.esercizioIdx, stato.serieCorrente]).toEqual([0, 1]);
  });

  it('gli esercizi aggiunti durante l\'allenamento tornano in coda, una volta sola', () => {
    const stato = statoDaSessione(sessione(serie(1), serie(9), serie(9)));
    expect(stato.eserciziLive.map(e => e.esercizioId)).toEqual([1, 2, 9]);
    expect(stato.eserciziLive[2]).toEqual({ esercizioId: 9, esercizio: { id: 9, nome: 'Esercizio 9' }, ...ESERCIZIO_EXTRA });
  });

  it('tutto fatto: resta sull\'ultimo esercizio, oltre l\'ultima serie', () => {
    const stato = statoDaSessione(sessione(serie(1), serie(1), serie(1), serie(2), serie(2)));
    expect([stato.esercizioIdx, stato.serieCorrente]).toEqual([1, 3]);
  });

  it('l\'ordine delle serie e\' quello di registrazione, anche se arrivano raggruppate per esercizio', () => {
    const [a, b] = [serie(9), serie(8)];
    expect(statoDaSessione(sessione(b, a)).eserciziLive.map(e => e.esercizioId)).toEqual([1, 2, 9, 8]);
  });
});

describe('serieDiOggi', () => {
  it('the sets set during the workout, otherwise the plan\'s', () => {
    expect(serieDiOggi(PANCA)).toBe(3);
    expect(serieDiOggi({ ...PANCA, serieOggi: 4 })).toBe(4);
    expect(serieDiOggi({ ...PANCA, serieOggi: 2 })).toBe(2);
    expect(serieDiOggi(undefined)).toBeUndefined();
  });

  it('rebuilt from the server, an exercise with sets added today keeps them as today\'s sets', () => {
    const stato = statoDaSessione(sessione(serie(1), serie(1), serie(1), serie(1)));
    expect(stato.eserciziLive[0]).toEqual({ ...PANCA, serieOggi: 4 });
    // The plan's number stays, for the load proposal
    expect(stato.eserciziLive[0].serieTarget).toBe(3);
    expect([stato.esercizioIdx, stato.serieCorrente]).toEqual([1, 1]);
    // The others as they were
    expect(stato.eserciziLive[1]).toBe(SQUAT);
  });
});

describe('limitaSerieOggi', () => {
  it('one more or one less, as asked', () => {
    expect(limitaSerieOggi(4, 2)).toBe(4);
    expect(limitaSerieOggi(2, 1)).toBe(2);
  });

  it('never fewer than the sets already done, nor than one', () => {
    expect(limitaSerieOggi(1, 2)).toBe(2);
    expect(limitaSerieOggi(0, 0)).toBe(1);
  });

  it('never more than the limit', () => {
    expect(limitaSerieOggi(SERIE_MAX_OGGI + 1, 3)).toBe(SERIE_MAX_OGGI);
  });
});
