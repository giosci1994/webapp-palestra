import { describe, it, expect } from 'vitest';
import { destinazioneDa } from './useAperturaDaNotifica.js';

const pagina = (pathname, search = '') => ({ pathname, search });

describe('destinazioneDa', () => {
  it('the page of the notification, from anywhere else in the app', () => {
    expect(destinazioneDa('/allenamento/12', pagina('/dashboard'))).toBe('/allenamento/12');
    expect(destinazioneDa('/chat?tab=notifiche', pagina('/chat'))).toBe('/chat?tab=notifiche');
  });

  it('already there: nothing to do, the workout stays as it is', () => {
    expect(destinazioneDa('/allenamento/12', pagina('/allenamento/12'))).toBeNull();
    expect(destinazioneDa('/chat?tab=notifiche', pagina('/chat', '?tab=notifiche'))).toBeNull();
  });

  it('never an address outside the app, nor no address at all', () => {
    for (const percorso of ['https://esempio.com', '//esempio.com', '', null, undefined]) {
      expect(destinazioneDa(percorso, pagina('/dashboard'))).toBeNull();
    }
  });
});
