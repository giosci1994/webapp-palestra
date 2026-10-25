import { describe, it, expect } from 'vitest';
import { secondiAllaFine, statoRecupero, salvaRecupero, leggiRecupero, togliRecupero, SEGNALE_ENTRO_MS } from './recupero.js';

const inizio = 1_800_000_000_000;
const dopo = secondi => inizio + secondi * 1000;

/** A localStorage in memory */
function archivioFinto() {
  const dati = new Map();
  return {
    getItem: k => (dati.has(k) ? dati.get(k) : null),
    setItem: (k, v) => dati.set(k, String(v)),
    removeItem: k => dati.delete(k),
    dati
  };
}

describe('secondiAllaFine', () => {
  it('counts down from the real time, rounding up', () => {
    const fine = dopo(90);
    expect(secondiAllaFine(fine, inizio)).toBe(90);
    expect(secondiAllaFine(fine, dopo(0.2))).toBe(90);
    expect(secondiAllaFine(fine, dopo(1))).toBe(89);
    expect(secondiAllaFine(fine, dopo(89.5))).toBe(1);
  });

  it('a minute away from the app is a minute less, not where it had stopped', () => {
    // Screen locked after 10 seconds, back 60 seconds later: 20 seconds left, not 80
    expect(secondiAllaFine(dopo(90), dopo(70))).toBe(20);
  });

  it('never goes below zero', () => {
    expect(secondiAllaFine(dopo(90), dopo(90))).toBe(0);
    expect(secondiAllaFine(dopo(90), dopo(600))).toBe(0);
  });
});

describe('statoRecupero', () => {
  it('while it runs: the seconds, no signal', () => {
    expect(statoRecupero(dopo(90), dopo(30))).toEqual({ secondi: 60, finito: false, segnale: false });
  });

  it('right at the end it beeps and vibrates', () => {
    expect(statoRecupero(dopo(90), dopo(90))).toEqual({ secondi: 0, finito: true, segnale: true });
    expect(statoRecupero(dopo(90), dopo(90) + SEGNALE_ENTRO_MS).segnale).toBe(true);
  });

  it('back in the app minutes after the end it is over, in silence', () => {
    expect(statoRecupero(dopo(90), dopo(90) + SEGNALE_ENTRO_MS + 1)).toEqual({ secondi: 0, finito: true, segnale: false });
  });
});

describe('the rest kept on the phone', () => {
  const recupero = { fine: dopo(90), durata: 90, inCima: true, avvisato: true, esercizio: 2 };

  it('comes back after the app is closed and reopened, while it is still running', () => {
    const archivio = archivioFinto();
    salvaRecupero(7, recupero, archivio);
    expect(leggiRecupero(7, dopo(30), archivio)).toEqual(recupero);
    // Each workout its own
    expect(leggiRecupero(8, dopo(30), archivio)).toBeNull();
  });

  it('kept before it knew its exercise: no exercise, the rest is the same', () => {
    const archivio = archivioFinto();
    const vecchio = { fine: recupero.fine, durata: 90, inCima: true, avvisato: true };
    salvaRecupero(7, vecchio, archivio);
    expect(leggiRecupero(7, dopo(30), archivio)).toEqual({ ...vecchio, esercizio: null });
  });

  it('once over it is forgotten', () => {
    const archivio = archivioFinto();
    salvaRecupero(7, recupero, archivio);
    expect(leggiRecupero(7, dopo(90), archivio)).toBeNull();
    expect(archivio.dati.size).toBe(0);
  });

  it('stopped or skipped, it is gone', () => {
    const archivio = archivioFinto();
    salvaRecupero(7, recupero, archivio);
    togliRecupero(7, archivio);
    expect(leggiRecupero(7, dopo(30), archivio)).toBeNull();
  });

  it('unreadable or without storage: null, and nothing fails', () => {
    const archivio = archivioFinto();
    archivio.setItem('gymmaster_recupero_7', '{non json');
    expect(leggiRecupero(7, dopo(30), archivio)).toBeNull();
    archivio.setItem('gymmaster_recupero_7', JSON.stringify({ fine: 'domani', durata: 90 }));
    expect(leggiRecupero(7, dopo(30), archivio)).toBeNull();

    const rotto = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(() => salvaRecupero(7, recupero, rotto)).not.toThrow();
    expect(() => togliRecupero(7, rotto)).not.toThrow();
    expect(leggiRecupero(7, dopo(30), rotto)).toBeNull();
    expect(leggiRecupero(7, dopo(30), undefined)).toBeNull();
  });
});
