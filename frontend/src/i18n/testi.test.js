// The translation files: every language has the same keys as English, with
// the same placeholders and tags, and every key the code asks for exists.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tokenize } from 'espree';
import { LINGUE, LINGUA_BASE, testiDi, esisteChiave } from './index.js';

const SRC = join(import.meta.dirname, '..');
const TESTI = join(import.meta.dirname, 'testi');
const namespaces = lingua => readdirSync(join(TESTI, lingua)).filter(f => f.endsWith('.json')).sort();

const segnaposti = testo => [...String(testo).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const tags = testo => [...String(testo).matchAll(/<\/?(\w+)>/g)].map(m => m[0]).sort();

describe('translation files', () => {
  const base = testiDi(LINGUA_BASE);

  for (const lingua of LINGUE.filter(l => l !== LINGUA_BASE)) {
    describe(lingua, () => {
      const testi = testiDi(lingua);

      it('has a file for every English file, and no others', () => {
        expect(namespaces(lingua)).toEqual(namespaces(LINGUA_BASE));
      });

      it('has every English key, and no others', () => {
        const mancanti = Object.keys(base).filter(k => !(k in testi));
        const inPiu = Object.keys(testi).filter(k => !(k in base));
        expect({ mancanti, inPiu }).toEqual({ mancanti: [], inPiu: [] });
      });

      it('keeps the same placeholders and tags as English', () => {
        const diversi = Object.keys(base).filter(k => k in testi && (
          segnaposti(base[k]).join() !== segnaposti(testi[k]).join() ||
          tags(base[k]).join() !== tags(testi[k]).join()
        ));
        expect(diversi).toEqual([]);
      });
    });
  }

  it('has no empty texts', () => {
    const vuoti = LINGUE.flatMap(l => Object.entries(testiDi(l))
      .filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => `${l}:${k}`));
    expect(vuoti).toEqual([]);
  });
});

describe('keys used in the code', () => {
  const sorgenti = [];
  const visita = cartella => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) visita(percorso);
      else if (/\.(js|jsx)$/.test(voce.name) && !/\.test\.(js|jsx)$/.test(voce.name)) sorgenti.push(percorso);
    }
  };
  visita(SRC);

  /**
   * Literal keys in the code, comments excluded: t('…') and traduci('…'),
   * and the t="…" prop of <Testo>. A key is "<namespace>.<key>".
   */
  const chiaviUsate = codice => {
    const token = tokenize(codice, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
    const chiavi = [];
    token.forEach((tk, i) => {
      const [aperta, testo] = [token[i + 1], token[i + 2]];
      if (tk.type === 'Identifier' && ['t', 'traduci'].includes(tk.value) && aperta?.value === '(' && testo?.type === 'String') {
        chiavi.push(testo.value.slice(1, -1));
      }
      // In JSX, a quoted attribute value is a JSXText token, quotes included
      if (tk.type === 'JSXIdentifier' && tk.value === 't' && aperta?.value === '=' && ['JSXText', 'String'].includes(testo?.type)) {
        chiavi.push(testo.value.slice(1, -1));
      }
    });
    return chiavi.filter(chiave => /^\w+\./.test(chiave));
  };

  it('exist in English (keys built at runtime are not checked here)', () => {
    const mancanti = [];
    for (const file of sorgenti) {
      for (const chiave of chiaviUsate(readFileSync(file, 'utf8'))) {
        if (!esisteChiave(chiave)) mancanti.push(`${relative(SRC, file)}: ${chiave}`);
      }
    }
    expect(mancanti).toEqual([]);
  });
});
