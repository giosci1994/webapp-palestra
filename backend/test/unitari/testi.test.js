// The server's translation files: every language has the same keys as
// English, with the same placeholders, and every key the code asks for exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizer } from 'acorn';
import { testiDi, esisteChiave } from '../../src/i18n/index.js';
import { LINGUE, LINGUA_BASE } from '../../src/utils/lingue.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const TESTI = join(SRC, 'i18n/testi');
const file = lingua => readdirSync(join(TESTI, lingua)).filter(f => f.endsWith('.json')).sort();
const segnaposti = testo => [...String(testo).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();

describe('server translation files', () => {
  const base = testiDi(LINGUA_BASE);
  for (const lingua of LINGUE.filter(l => l !== LINGUA_BASE)) {
    const testi = testiDi(lingua);
    it(`${lingua}: the same files and keys as English, with the same placeholders`, () => {
      assert.deepEqual(file(lingua), file(LINGUA_BASE));
      assert.deepEqual(Object.keys(base).filter(k => !(k in testi)), [], 'missing');
      assert.deepEqual(Object.keys(testi).filter(k => !(k in base)), [], 'not in English');
      assert.deepEqual(Object.keys(base).filter(k => segnaposti(base[k]) !== segnaposti(testi[k])), [], 'placeholders');
    });
  }

  it('no empty texts', () => {
    const vuoti = LINGUE.flatMap(l => Object.entries(testiDi(l)).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => `${l}:${k}`));
    assert.deepEqual(vuoti, []);
  });

  it('every literal key in the code exists in English', () => {
    const sorgenti = [];
    const visita = cartella => {
      for (const voce of readdirSync(cartella, { withFileTypes: true })) {
        const percorso = join(cartella, voce.name);
        if (voce.isDirectory()) visita(percorso);
        else if (voce.name.endsWith('.js')) sorgenti.push(percorso);
      }
    };
    visita(SRC);
    const mancanti = [];
    for (const sorgente of sorgenti) {
      const token = [...tokenizer(readFileSync(sorgente, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })];
      token.forEach((tk, i) => {
        const [aperta, testo] = [token[i + 1], token[i + 2]];
        if (tk.type.label === 'name' && ['t', 'traduci'].includes(tk.value) && aperta?.type.label === '(' &&
            testo?.type.label === 'string' && /^\w+\./.test(testo.value) && !esisteChiave(testo.value)) {
          mancanti.push(`${relative(SRC, sorgente)}: ${testo.value}`);
        }
      });
    }
    assert.deepEqual(mancanti, []);
  });
});
