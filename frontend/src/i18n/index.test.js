import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import {
  scegliLingua, traduciDa, traduci, appiattisci, scegli, linguaCorrente, linguaScelta, iscriviLingua, LINGUE
} from './index.js';
import { conComponenti } from './componenti.js';

afterEach(() => scegli('it'));

describe('picking the language', () => {
  it('takes the first supported one, regional variants included', () => {
    expect(scegliLingua('it-IT')).toBe('it');
    expect(scegliLingua('en_US')).toBe('en');
    expect(scegliLingua(['fr-FR', 'de', 'it-CH', 'en'])).toBe('it');
    expect(scegliLingua(null, ['es-ES', 'en-GB'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(scegliLingua('fr', ['de-DE'])).toBe('en');
    expect(scegliLingua()).toBe('en');
    expect(scegliLingua(undefined, [])).toBe('en');
  });

  it('a choice made in Profile comes before the phone', () => {
    expect(scegliLingua('en', ['it-IT'])).toBe('en');
  });

  it('switching notifies, and null goes back to the phone language', () => {
    let notifiche = 0;
    const smetti = iscriviLingua(() => notifiche++);
    scegli('en');
    expect([linguaCorrente(), linguaScelta(), notifiche]).toEqual(['en', null, 1]);
    scegli(null);
    // The test machine's "phone" (Node) is not in Italian
    expect(LINGUE).toContain(linguaCorrente());
    expect(linguaScelta()).toBeNull();
    smetti();
  });
});

describe('translating', () => {
  const testi = {
    en: { 'a.saluto': 'Hi {name}', 'a.serie_one': '{count} set', 'a.serie_other': '{count} sets', 'a.solo': 'Only English' },
    it: { 'a.saluto': 'Ciao {name}', 'a.serie_one': '{count} serie', 'a.serie_other': '{count} serie' }
  };

  it('fills in the placeholders, and leaves the missing ones visible', () => {
    expect(traduciDa(testi, 'a.saluto', { name: 'Anna' }, 'it')).toBe('Ciao Anna');
    expect(traduciDa(testi, 'a.saluto', {}, 'en')).toBe('Hi {name}');
  });

  it('picks the plural form by the language rules', () => {
    expect(traduciDa(testi, 'a.serie', { count: 1 }, 'en')).toBe('1 set');
    expect(traduciDa(testi, 'a.serie', { count: 0 }, 'en')).toBe('0 sets');
    expect(traduciDa(testi, 'a.serie', { count: 3 }, 'it')).toBe('3 serie');
  });

  it('falls back to English, then to the key', () => {
    expect(traduciDa(testi, 'a.solo', {}, 'it')).toBe('Only English');
    expect(traduciDa(testi, 'a.inesistente', {}, 'it')).toBe('a.inesistente');
  });

  it('reads the real files', () => {
    expect(traduci('comune.salva', {}, 'en')).toBe('Save');
    expect(traduci('comune.salva', {}, 'it')).toBe('Salva');
    expect(traduci('comune.serie', { count: 2 }, 'en')).toBe('2 sets');
  });

  it('turns nested objects into dotted keys, by file name', () => {
    expect(appiattisci({ './testi/en/workout.json': { fine: 'Finish', timer: { via: 'Start' } } }))
      .toEqual({ 'workout.fine': 'Finish', 'workout.timer.via': 'Start' });
  });
});

describe('text with markup', () => {
  it('turns tags into the given elements and keeps the rest as text', () => {
    const parti = conComponenti('New version <b>1.4.0</b> available', { b: createElement('strong') });
    expect(parti[0]).toBe('New version ');
    expect(parti[1].type).toBe('strong');
    expect(parti[1].props.children).toBe('1.4.0');
    expect(parti[2]).toBe(' available');
  });

  it('a tag without an element becomes plain text', () => {
    expect(conComponenti('a <x>b</x> c', {}).join('')).toBe('a b c');
  });
});
