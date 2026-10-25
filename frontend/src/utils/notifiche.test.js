import { describe, it, expect } from 'vitest';
import { conNuova, conLetta, tutteLette, percorsoInterno, testoContatore, NOTIFICHE_MAX } from './notifiche.js';

const notifica = (id, letta = false) => ({ id, titolo: `N${id}`, letta });

describe('the list of notifications', () => {
  it('one just arrived goes on top, once, and the list keeps the latest ones', () => {
    expect(conNuova([notifica(2), notifica(1)], notifica(3)).map(n => n.id)).toEqual([3, 2, 1]);
    // The same notification twice (loaded and arrived through the socket): once
    expect(conNuova([notifica(3), notifica(2)], notifica(3)).map(n => n.id)).toEqual([3, 2]);
    const piena = Array.from({ length: NOTIFICHE_MAX }, (_, i) => notifica(NOTIFICHE_MAX - i));
    const dopo = conNuova(piena, notifica(NOTIFICHE_MAX + 1));
    expect(dopo).toHaveLength(NOTIFICHE_MAX);
    expect(dopo[0].id).toBe(NOTIFICHE_MAX + 1);
    expect(dopo.at(-1).id).toBe(2);
  });

  it('read one by one, or all at once; the others stay as they are', () => {
    const lista = [notifica(3), notifica(2, true), notifica(1)];
    expect(conLetta(lista, 1).map(n => n.letta)).toEqual([false, true, true]);
    expect(conLetta(lista, 2)[1]).toBe(lista[1]);
    expect(tutteLette(lista).every(n => n.letta)).toBe(true);
    expect(lista.map(n => n.letta)).toEqual([false, true, false]);
  });
});

describe('percorsoInterno', () => {
  it('a path inside the app', () => {
    expect(percorsoInterno('/pianificazione')).toBe('/pianificazione');
    expect(percorsoInterno('/storico?sessione=4')).toBe('/storico?sessione=4');
  });

  it('never an address outside the app', () => {
    for (const percorso of ['https://esempio.com', '//esempio.com', 'javascript:alert(1)', 'storico', '', null, undefined]) {
      expect(percorsoInterno(percorso)).toBeNull();
    }
  });
});

describe('testoContatore', () => {
  it('nothing at zero, the number up to 9, then 9+', () => {
    expect(testoContatore(0)).toBe('');
    expect(testoContatore(undefined)).toBe('');
    expect(testoContatore(3)).toBe('3');
    expect(testoContatore(9)).toBe('9');
    expect(testoContatore(12)).toBe('9+');
  });
});
