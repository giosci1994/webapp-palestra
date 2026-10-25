import { describe, it, expect } from 'vitest';
import { ultimaSerieIl, fineProposta, fineDaOra, erroreFine, PAUSA_DOPO_ULTIMA_SERIE_MINUTI } from './fineAllenamento.js';

const MINUTO = 60 * 1000;
/** A local time on 6 October 2026 (the day after for giorno 7), in milliseconds */
const alle = (ore, minuti, giorno = 6) => new Date(2026, 9, giorno, ore, minuti).getTime();

describe('ultimaSerieIl', () => {
  it('is the latest set, whatever the order', () => {
    const serie = [
      { registrataIl: new Date(alle(18, 40)).toISOString() },
      { registrataIl: new Date(alle(19, 42)).toISOString() },
      { registrataIl: new Date(alle(19, 10)).toISOString() }
    ];
    expect(ultimaSerieIl(serie)).toBe(alle(19, 42));
  });

  it('sets without a time do not count; none at all gives null', () => {
    expect(ultimaSerieIl([{ registrataIl: null }, {}, { registrataIl: new Date(alle(18, 5)).toISOString() }])).toBe(alle(18, 5));
    expect(ultimaSerieIl([{}, { registrataIl: null }])).toBeNull();
    expect(ultimaSerieIl()).toBeNull();
  });
});

describe('fineProposta', () => {
  const inizio = alle(18, 0);

  it('right after the last set the end is now', () => {
    expect(fineProposta({ inizio, ultimaSerie: alle(19, 30), adesso: alle(19, 40) })).toEqual({ fine: alle(19, 40), dopoPausa: false });
    // Exactly at the limit it is still now
    const limite = alle(19, 30) + PAUSA_DOPO_ULTIMA_SERIE_MINUTI * MINUTO;
    expect(fineProposta({ inizio, ultimaSerie: alle(19, 30), adesso: limite }).dopoPausa).toBe(false);
  });

  it('"Termina" tapped hours after the last set proposes the last set', () => {
    expect(fineProposta({ inizio, ultimaSerie: alle(19, 42), adesso: alle(8, 30, 7) })).toEqual({ fine: alle(19, 42), dopoPausa: true });
  });

  it('without sets with a time it proposes now', () => {
    expect(fineProposta({ inizio, ultimaSerie: null, adesso: alle(23, 0) })).toEqual({ fine: alle(23, 0), dopoPausa: false });
  });
});

describe('fineDaOra', () => {
  it('a time already passed today is today', () => {
    expect(fineDaOra('19:15', alle(18, 0), alle(21, 0))).toBe(alle(19, 15));
    expect(fineDaOra('21:00', alle(18, 0), alle(21, 0))).toBe(alle(21, 0));
  });

  it('the morning after, an evening time is yesterday evening', () => {
    expect(fineDaOra('19:15', alle(18, 0), alle(8, 30, 7))).toBe(alle(19, 15));
  });

  it('a workout across midnight ends after midnight', () => {
    expect(fineDaOra('00:40', alle(23, 30), alle(0, 50, 7))).toBe(alle(0, 40, 7));
    expect(fineDaOra('23:50', alle(23, 30), alle(0, 50, 7))).toBe(alle(23, 50));
  });

  it('a time still to come stays today, so it can be told apart', () => {
    expect(fineDaOra('22:00', alle(18, 0), alle(21, 0))).toBe(alle(22, 0));
  });

  it('a time that is not a time gives null', () => {
    for (const ora of ['', '7', '25:00', '12:60', 'ab:cd', undefined]) {
      expect(fineDaOra(ora, alle(18, 0), alle(21, 0))).toBeNull();
    }
  });
});

describe('erroreFine', () => {
  const inizio = alle(18, 0);
  const adesso = alle(21, 0);

  it('an end between the start and now is fine', () => {
    expect(erroreFine(alle(19, 15), inizio, adesso)).toBeNull();
    expect(erroreFine(adesso, inizio, adesso)).toBeNull();
  });

  it('says what is wrong', () => {
    expect(erroreFine(null, inizio, adesso)).toBe('nonValida');
    expect(erroreFine(alle(17, 30), inizio, adesso)).toBe('prima');
    expect(erroreFine(inizio + 30 * 1000, inizio, adesso)).toBe('prima');
    expect(erroreFine(alle(22, 0), inizio, adesso)).toBe('futuro');
    expect(erroreFine(alle(4, 1, 7), inizio, alle(8, 30, 7))).toBe('troppoLunga');
    expect(erroreFine(alle(4, 0, 7), inizio, alle(8, 30, 7))).toBeNull();
  });
});
