import { describe, it, expect, beforeEach } from 'vitest';
import { bilanciereDi, dischiPerLato, descriviDischi } from './dischi.js';
import { scegli, traduci } from '../i18n/index.js';

beforeEach(() => scegli('it'));

describe('bilanciereDi', () => {
  const con = nome => ({ attrezzatura: { nome } });

  it('riconosce le barre del catalogo e il loro peso a vuoto', () => {
    expect(bilanciereDi(con('Bilanciere Olimpico')).peso).toBe(20);
    expect(bilanciereDi(con('Bilanciere EZ')).peso).toBe(10);
    expect(bilanciereDi(con('Trap Bar (Hex Bar)')).peso).toBe(25);
  });

  it('il nome della barra e\' una chiave di traduzione', () => {
    expect(traduci(bilanciereDi(con('Bilanciere Olimpico')).nome)).toBe('bilanciere olimpico');
    expect(traduci(bilanciereDi(con('Bilanciere Olimpico')).nome, {}, 'en')).toBe('Olympic barbell');
    expect(traduci(bilanciereDi(con('Bilanciere EZ')).nome)).toBe('bilanciere EZ');
    expect(traduci(bilanciereDi(con('Trap Bar (Hex Bar)')).nome, {}, 'en')).toBe('trap bar');
  });

  it('niente bilanciere per manubri, macchine o esercizi senza attrezzatura', () => {
    expect(bilanciereDi(con('Manubri (Set)'))).toBeNull();
    expect(bilanciereDi(con('Smith Machine'))).toBeNull();
    expect(bilanciereDi({})).toBeNull();
    expect(bilanciereDi(null)).toBeNull();
  });
});

describe('dischiPerLato', () => {
  it('scompone il peso dei dischi a meta\' per lato, dai piu\' pesanti', () => {
    expect(dischiPerLato(100)).toEqual({ perLato: [25, 15], mancano: 0 });
    expect(dischiPerLato(62.5)).toEqual({ perLato: [20, 1.25], mancano: 0 });
    expect(dischiPerLato(140)).toEqual({ perLato: [25, 25, 10], mancano: 0 });
  });

  it('tiene conto del peso della barra', () => {
    expect(dischiPerLato(40, 10)).toEqual({ perLato: [15], mancano: 0 }); // EZ
    expect(dischiPerLato(85, 25)).toEqual({ perLato: [25, 5], mancano: 0 }); // trap bar
  });

  it('dice quanto manca se il peso non si compone coi dischi', () => {
    expect(dischiPerLato(61)).toEqual({ perLato: [20], mancano: 1 });
    expect(dischiPerLato(23)).toEqual({ perLato: [1.25], mancano: 0.5 });
  });

  it('niente dischi se il peso non supera la barra, o non e\' un numero', () => {
    expect(dischiPerLato(20)).toBeNull();
    expect(dischiPerLato(15)).toBeNull();
    expect(dischiPerLato('')).toBeNull();
    expect(dischiPerLato('abc')).toBeNull();
  });

  it('accetta il peso come stringa, come arriva dal campo', () => {
    expect(dischiPerLato('60')).toEqual({ perLato: [20], mancano: 0 });
  });
});

describe('descriviDischi', () => {
  it('raggruppa i dischi uguali e usa la virgola', () => {
    expect(descriviDischi([25, 25, 10, 2.5])).toBe('2 × 25 + 10 + 2,5');
    expect(descriviDischi([1.25])).toBe('1,25');
  });

  it('in inglese usa il punto decimale', () => {
    scegli('en');
    expect(descriviDischi([25, 25, 10, 2.5])).toBe('2 × 25 + 10 + 2.5');
    expect(descriviDischi([1.25])).toBe('1.25');
  });
});
