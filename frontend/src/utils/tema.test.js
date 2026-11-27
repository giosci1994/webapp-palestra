import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { leggiTemaScelto, temaEffettivo, applicaTema, scegliTema, sceltaDaAccount, CHIAVE_TEMA, COLORE_BARRA } from './tema.js';

const memoria = (iniziale = {}) => {
  const dati = { ...iniziale };
  return {
    dati,
    getItem: (k) => (k in dati ? dati[k] : null),
    setItem: (k, v) => { dati[k] = String(v); },
    removeItem: (k) => { delete dati[k]; }
  };
};
const rotta = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

const documento = () => {
  const meta = { 'color-scheme': { content: 'dark' }, 'theme-color': { content: '#000' } };
  const elemento = (nome) => ({ setAttribute: (a, v) => { meta[nome][a] = v; } });
  return {
    meta,
    documentElement: { dataset: {} },
    querySelector: (sel) => elemento(sel.match(/name="([^"]+)"/)[1])
  };
};

describe('theme', () => {
  it('reads the saved choice, "auto" otherwise', () => {
    expect(leggiTemaScelto(memoria({ [CHIAVE_TEMA]: 'chiaro' }))).toBe('chiaro');
    expect(leggiTemaScelto(memoria({ [CHIAVE_TEMA]: 'blu' }))).toBe('auto');
    expect(leggiTemaScelto(memoria())).toBe('auto');
    expect(leggiTemaScelto(rotta)).toBe('auto');
  });

  it('"auto" follows the system, a choice wins over it', () => {
    expect(temaEffettivo('auto', true)).toBe('chiaro');
    expect(temaEffettivo('auto', false)).toBe('scuro');
    expect(temaEffettivo('scuro', true)).toBe('scuro');
    expect(temaEffettivo('chiaro', false)).toBe('chiaro');
  });

  it('puts the theme, color-scheme and theme-color on the page', () => {
    const doc = documento();
    applicaTema('chiaro', doc);
    expect(doc.documentElement.dataset.tema).toBe('chiaro');
    expect(doc.meta['color-scheme'].content).toBe('light');
    expect(doc.meta['theme-color'].content).toBe(COLORE_BARRA.chiaro);
    applicaTema('scuro', doc);
    expect(doc.meta['color-scheme'].content).toBe('dark');
    expect(doc.meta['theme-color'].content).toBe(COLORE_BARRA.scuro);
  });

  it('keeps a choice and forgets it on "auto", even without storage', () => {
    const m = memoria();
    scegliTema('scuro', m);
    expect(m.dati[CHIAVE_TEMA]).toBe('scuro');
    scegliTema('auto', m);
    expect(CHIAVE_TEMA in m.dati).toBe(false);
    expect(() => scegliTema('chiaro', rotta)).not.toThrow();
  });

  it('the account\'s theme wins; without one (older server) this phone\'s stays', () => {
    expect(sceltaDaAccount('chiaro')).toBe('chiaro');
    expect(sceltaDaAccount('scuro')).toBe('scuro');
    expect(sceltaDaAccount(null)).toBe('auto');
    expect(sceltaDaAccount(undefined)).toBeNull();
    expect(sceltaDaAccount('blu')).toBeNull();
  });

  it('index.html applies it before the first paint with the same key and colours', () => {
    const qui = dirname(fileURLToPath(import.meta.url));
    const html = readFileSync(resolve(qui, '../../index.html'), 'utf-8');
    expect(html).toContain(`'${CHIAVE_TEMA}'`);
    expect(html).toContain(COLORE_BARRA.chiaro);
    expect(html).toContain(COLORE_BARRA.scuro);
  });
});
