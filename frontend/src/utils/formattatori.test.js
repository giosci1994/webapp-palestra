import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  formattaData, aStringaData, aStringaOra, lunediDi, formattaDataRelativa, formattaNumero,
  formattaPeso, formattaDurata, nomeEsercizio, eCardioNelloStorico, nomeEsercizioOriginale,
  nomeGruppo, nomeAttrezzatura
} from './formattatori.js';
import { scegli } from '../i18n/index.js';

// The tests run in the Europe/Rome time zone (vitest.config.js): 08:05 UTC on
// 10 October, in daylight saving time, is 10:05 in Italy.
// They run in Italian unless a test switches to English.
beforeEach(() => scegli('it'));

describe('formattaData', () => {
  it('senza data mostra un trattino', () => {
    expect(formattaData(null)).toBe('—');
    expect(formattaData('')).toBe('—');
  });

  it('mostra giorno, mese abbreviato e anno in italiano, e su richiesta l\'ora locale', () => {
    expect(formattaData('2026-10-10T08:05:00Z')).toMatch(/^10 ott 2026$/);
    expect(formattaData('2026-10-10T08:05:00Z', true)).toMatch(/^10 ott 2026.*10:05$/);
  });
});

describe('aStringaData e aStringaOra', () => {
  it('usano il giorno e l\'ora locali, senza passare per UTC', () => {
    // 00:30 on 5 January in Italy: in UTC it is still the 4th
    const d = new Date(2026, 0, 5, 0, 30);
    expect(aStringaData(d)).toBe('2026-01-05');
    expect(aStringaOra(d)).toBe('00:30');
  });

  it('aggiungono gli zeri davanti', () => {
    const d = new Date(2026, 2, 7, 7, 3);
    expect(aStringaData(d)).toBe('2026-03-07');
    expect(aStringaOra(d)).toBe('07:03');
  });
});

describe('lunediDi', () => {
  it('porta al lunedì della stessa settimana, a mezzanotte', () => {
    // Thursday 8 and Sunday 11 October 2026 → Monday 5
    expect(lunediDi(new Date(2026, 9, 8, 18, 30))).toEqual(new Date(2026, 9, 5));
    expect(lunediDi(new Date(2026, 9, 11, 23, 59))).toEqual(new Date(2026, 9, 5));
  });

  it('un lunedì resta se stesso', () => {
    expect(lunediDi(new Date(2026, 9, 12, 7, 0))).toEqual(new Date(2026, 9, 12));
  });
});

describe('formattaDataRelativa', () => {
  afterEach(() => vi.useRealTimers());

  it('dice quanto tempo fa, poi passa alla data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    const fa = millisecondi => new Date(Date.now() - millisecondi).toISOString();

    expect(formattaDataRelativa(fa(30 * 1000))).toBe('ora');
    expect(formattaDataRelativa(fa(5 * 60 * 1000))).toBe('5 min fa');
    expect(formattaDataRelativa(fa(3 * 3600 * 1000))).toBe('3h fa');
    expect(formattaDataRelativa(fa(2 * 86400 * 1000))).toBe('2g fa');
    expect(formattaDataRelativa(fa(10 * 86400 * 1000))).toBe(formattaData(fa(10 * 86400 * 1000)));
    expect(formattaDataRelativa(null)).toBe('—');
  });
});

describe('formattaNumero', () => {
  it('usa il punto per le migliaia e la virgola per i decimali', () => {
    expect(formattaNumero(1234567)).toBe('1.234.567');
    expect(formattaNumero(12520.5)).toBe('12.520,5');
    expect(formattaNumero(null)).toBe('0');
  });

  it('come vuole l\'italiano, separa le migliaia solo da cinque cifre in su', () => {
    expect(formattaNumero(1520)).toBe('1520');
  });
});

describe('formattaPeso', () => {
  it('mostra i decimali solo se ci sono, al massimo uno', () => {
    expect(formattaPeso(80)).toBe('80');
    expect(formattaPeso(82.5)).toBe('82.5');
    expect(formattaPeso(62.36)).toBe('62.4');
    expect(formattaPeso(0)).toBe('0');
    expect(formattaPeso(null)).toBe('0');
  });
});

describe('formattaDurata', () => {
  it('in minuti fino a un\'ora, poi in ore e minuti', () => {
    expect(formattaDurata(45)).toBe('45 min');
    expect(formattaDurata(60)).toBe('1h');
    expect(formattaDurata(95)).toBe('1h 35min');
    expect(formattaDurata(0)).toBe('—');
    expect(formattaDurata(null)).toBe('—');
  });
});

describe('nomi degli esercizi', () => {
  const importato = { nome: 'Barbell Bench Press', nomeIt: 'Panca piana con bilanciere' };
  const curato = { nome: 'Panca piana', nomeIt: null };

  it("si mostra sempre l'italiano quando c'e'", () => {
    expect(nomeEsercizio(importato)).toBe('Panca piana con bilanciere');
    expect(nomeEsercizio(curato)).toBe('Panca piana');
    expect(nomeEsercizio(null)).toBe('');
  });

  it("l'originale inglese compare solo accanto a una traduzione", () => {
    expect(nomeEsercizioOriginale(importato)).toBe('Barbell Bench Press');
    expect(nomeEsercizioOriginale(curato)).toBeNull();
  });

  it('in English: the catalog name, or the English one in brackets of a curated exercise', () => {
    scegli('en');
    expect(nomeEsercizio(importato)).toBe('Barbell Bench Press');
    expect(nomeEsercizio({ nome: 'Lat Machine (Lat Pulldown)', nomeIt: null })).toBe('Lat Pulldown');
    expect(nomeEsercizio(curato)).toBe('Panca piana');
    expect(nomeEsercizioOriginale(importato)).toBeNull();
  });
});

describe('muscle groups and equipment', () => {
  it('are stored in Italian and shown in the current language', () => {
    expect(nomeGruppo('Petto')).toBe('Petto');
    expect(nomeAttrezzatura('Panca Piana')).toBe('Panca Piana');
    scegli('en');
    expect(nomeGruppo('Petto')).toBe('Chest');
    expect(nomeGruppo("Flessori dell'Anca")).toBe('Hip flexors');
    expect(nomeAttrezzatura('Panca Piana')).toBe('Flat bench');
  });

  it('a name without a translation shows as it is', () => {
    scegli('en');
    expect(nomeGruppo('Gruppo nuovo')).toBe('Gruppo nuovo');
    expect(nomeAttrezzatura(null)).toBe('');
  });
});

describe('dates and numbers in English', () => {
  it('follow the English way of writing them', () => {
    scegli('en');
    expect(formattaData('2026-10-10T08:05:00Z')).toMatch(/10 Oct 2026|Oct 10, 2026/);
    expect(formattaNumero(1520)).toBe('1,520');
    expect(formattaNumero(12.5)).toBe('12.5');
    expect(formattaDataRelativa(new Date(Date.now() - 5 * 60 * 1000))).toBe('5 min ago');
  });
});

describe('eCardioNelloStorico', () => {
  const serieInMinuti = [{ durataMinuti: 20, pesoEffettivo: 0, repEffettive: 0 }];
  const serieConPesi = [{ durataMinuti: null, pesoEffettivo: 60, repEffettive: 10 }];

  it('e\' cardio un esercizio del gruppo Cardio, comunque scritto', () => {
    expect(eCardioNelloStorico({ esercizio: { gruppoMuscoloPrimario: 'CARDIO' }, serie: serieConPesi })).toBe(true);
  });

  it('e\' cardio anche un esercizio registrato in minuti, per esempio su un attrezzo', () => {
    expect(eCardioNelloStorico({ esercizio: { gruppoMuscoloPrimario: 'Gambe' }, serie: serieInMinuti })).toBe(true);
  });

  it('non lo e\' un esercizio con pesi e ripetizioni', () => {
    expect(eCardioNelloStorico({ esercizio: { gruppoMuscoloPrimario: 'Petto' }, serie: serieConPesi })).toBe(false);
  });
});
