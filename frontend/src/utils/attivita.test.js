import { describe, it, expect } from 'vitest';
import { grigliaAttivita, SETTIMANE_ATTIVITA } from './attivita.js';

// Venerdi' 9 ottobre 2026, ora locale (i test girano con TZ Europe/Rome)
const OGGI = new Date(2026, 9, 9, 18, 30);
const giorno = (giorno, serie = 20, allenamenti = 1) => ({ giorno, allenamenti, serie });

describe('grigliaAttivita', () => {
  it('53 settimane da lunedi\' a domenica, che finiscono con quella di oggi', () => {
    const { settimane } = grigliaAttivita([], OGGI);
    expect(settimane).toHaveLength(SETTIMANE_ATTIVITA);
    expect(settimane.every(s => s.length === 7)).toBe(true);
    expect(settimane[0][0].giorno).toBe('2025-10-06'); // un lunedi', 52 settimane prima
    const ultima = settimane.at(-1);
    expect(ultima[0].giorno).toBe('2026-10-05');
    expect(ultima[4]).toMatchObject({ giorno: '2026-10-09', oggi: true });
    expect(ultima.slice(5)).toEqual([null, null]); // sabato e domenica non sono ancora arrivati
  });

  it('attraversa il cambio dell\'ora senza saltare o ripetere giorni', () => {
    const giorni = grigliaAttivita([], OGGI).settimane.flat().filter(Boolean).map(g => g.giorno);
    expect(new Set(giorni).size).toBe(giorni.length);
    expect(giorni).toContain('2026-03-29'); // passaggio all'ora legale
    expect(giorni).toContain('2025-10-26'); // ritorno all'ora solare
  });

  it('il nome del mese sta sopra la settimana col primo giorno del mese', () => {
    const { mesi, settimane } = grigliaAttivita([], OGGI);
    expect(mesi[0]).toEqual({ colonna: 3, etichetta: 'nov' }); // settimana dal 27 ottobre 2025
    expect(settimane[3].some(g => g.giorno === '2025-11-01')).toBe(true);
    expect(mesi.at(-1).etichetta).toBe('ott');
    expect(mesi).toHaveLength(12);
  });

  it('l\'intensita\' segue le serie, misurate sul 90° percentile dei giorni attivi', () => {
    const giorni = [
      giorno('2026-09-01', 4), giorno('2026-09-02', 10), giorno('2026-09-03', 20),
      giorno('2026-09-04', 20), giorno('2026-09-07', 80) // il giorno eccezionale non conta come riferimento
    ];
    const celle = new Map(grigliaAttivita(giorni, OGGI).settimane.flat().filter(Boolean).map(g => [g.giorno, g.gradino]));
    expect(celle.get('2026-09-01')).toBe(1);
    expect(celle.get('2026-09-02')).toBe(3);
    expect(celle.get('2026-09-03')).toBe(5);
    expect(celle.get('2026-09-07')).toBe(5);
    expect(celle.get('2026-09-05')).toBe(0); // riposo
  });

  it('un allenamento senza serie registrate si vede comunque', () => {
    const celle = grigliaAttivita([giorno('2026-10-01', 0)], OGGI).settimane.flat();
    expect(celle.find(g => g?.giorno === '2026-10-01').gradino).toBe(1);
  });

  it('conta allenamenti e giorni attivi solo nel periodo della griglia', () => {
    const risultato = grigliaAttivita([
      giorno('2025-10-05', 10), // la domenica prima della griglia
      giorno('2026-01-15', 10, 2), giorno('2026-10-09', 10)
    ], OGGI);
    expect(risultato.allenamenti).toBe(3);
    expect(risultato.giorniAttivi).toBe(2);
  });
});
