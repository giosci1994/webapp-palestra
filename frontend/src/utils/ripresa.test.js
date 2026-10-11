import { describe, it, expect } from 'vitest';
import { statoDaSessione, ESERCIZIO_EXTRA } from './ripresa.js';

const PANCA = { esercizioId: 1, esercizio: { id: 1, nome: 'Panca' }, serieTarget: 3 };
const SQUAT = { esercizioId: 2, esercizio: { id: 2, nome: 'Squat' }, serieTarget: 2 };
let prossimoId = 100;
const serie = (esercizioId, completato = true) =>
  ({ id: ++prossimoId, esercizioId, completato, esercizio: { id: esercizioId, nome: `Esercizio ${esercizioId}` } });
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
