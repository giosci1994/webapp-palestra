import { describe, it, expect } from 'vitest';
import { datiFermi, datiRecenti } from './affluenza.js';

const ADESSO = Date.parse('2026-11-11T17:00:00Z');

describe('datiFermi', () => {
  it('data collected today or yesterday is fresh', () => {
    expect(datiFermi('2026-11-11T16:30:00Z', ADESSO)).toBe(false);
    expect(datiFermi('2026-11-10T09:00:00Z', ADESSO)).toBe(false);
  });

  it('data from more than two days ago is stale', () => {
    expect(datiFermi('2026-10-12T18:30:19Z', ADESSO)).toBe(true);
  });

  it('without a date there is nothing to say', () => {
    expect(datiFermi(null, ADESSO)).toBe(false);
    expect(datiFermi(undefined, ADESSO)).toBe(false);
  });
});

describe('datiRecenti', () => {
  it('data from the last scraper run is recent', () => {
    expect(datiRecenti('2026-11-11T16:30:00Z', ADESSO)).toBe(true);
    expect(datiRecenti('2026-11-11T10:35:00Z', ADESSO)).toBe(true);
  });

  it('data older than one run plus margin is not', () => {
    expect(datiRecenti('2026-11-11T10:25:00Z', ADESSO)).toBe(false);
    expect(datiRecenti('2026-11-10T18:23:00Z', ADESSO)).toBe(false);
  });

  it('without a date it is not recent', () => {
    expect(datiRecenti(null, ADESSO)).toBe(false);
    expect(datiRecenti(undefined, ADESSO)).toBe(false);
  });
});
