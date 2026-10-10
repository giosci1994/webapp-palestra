import { describe, it, expect } from 'vitest';
import { statoRecupero, gradinoAllenamento, SCALA_ALLENAMENTO } from './costanti.js';

describe('statoRecupero', () => {
  const adesso = new Date('2026-10-10T12:00:00Z').getTime();
  const oreFa = ore => new Date(adesso - ore * 3600 * 1000).toISOString();

  it('un muscolo mai allenato non ha stato', () => {
    expect(statoRecupero(null, null, adesso)).toBeNull();
  });

  it("e' in recupero per 48 ore dopo un lavoro diretto", () => {
    expect(statoRecupero(oreFa(10), oreFa(10), adesso)).toBe('recupero');
    expect(statoRecupero(oreFa(47), oreFa(47), adesso)).toBe('recupero');
    expect(statoRecupero(oreFa(49), oreFa(49), adesso)).toBe('pronto');
  });

  it("il lavoro da muscolo secondario non lo mette in recupero, ma basta a non trascurarlo", () => {
    // Ieri solo da secondario, da principiale un mese fa
    expect(statoRecupero(oreFa(24), oreFa(30 * 24), adesso)).toBe('pronto');
    expect(statoRecupero(oreFa(24), null, adesso)).toBe('pronto');
  });

  it("dopo 14 giorni senza lavoro e' trascurato", () => {
    expect(statoRecupero(oreFa(14 * 24), oreFa(14 * 24), adesso)).toBe('pronto');
    expect(statoRecupero(oreFa(15 * 24), oreFa(15 * 24), adesso)).toBe('trascurato');
  });
});

describe('gradinoAllenamento', () => {
  const ultimo = SCALA_ALLENAMENTO.length;

  it('zero serie, o nessun massimo, vuol dire mai allenato', () => {
    expect(gradinoAllenamento(0, 20)).toBe(0);
    expect(gradinoAllenamento(5, 0)).toBe(0);
    expect(gradinoAllenamento(undefined, 20)).toBe(0);
  });

  it('anche una sola serie conta come primo gradino', () => {
    expect(gradinoAllenamento(1, 100)).toBe(1);
  });

  it("il muscolo piu' allenato sta in cima, e non la supera mai", () => {
    expect(gradinoAllenamento(20, 20)).toBe(ultimo);
    expect(gradinoAllenamento(30, 20)).toBe(ultimo);
  });

  it('in mezzo sale per gradini proporzionali', () => {
    expect(gradinoAllenamento(10, 20)).toBe(Math.ceil(ultimo / 2));
  });
});
