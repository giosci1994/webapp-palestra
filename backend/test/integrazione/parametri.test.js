// Ogni rotta dell'API con un id nell'indirizzo, provata con un id che non e'
// un numero e con uno che non esiste: la risposta dev'essere un errore del
// client (400, 404…), mai un 500.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';
import router from '../../src/routes/indice.js';

/** "/sessioni" dal pattern con cui Express 4 monta un sotto-router */
const prefissoDi = strato => strato.regexp.source
  .replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');

/** Tutte le rotte con dei parametri: [metodo, percorso con i :parametri] */
function rotteConParametri() {
  const rotte = [];
  for (const strato of router.stack) {
    if (!strato.handle?.stack) continue;
    const prefisso = prefissoDi(strato);
    for (const { route } of strato.handle.stack) {
      if (!route || !route.path.includes(':')) continue;
      for (const metodo of Object.keys(route.methods)) rotte.push([metodo.toUpperCase(), prefisso + route.path]);
    }
  }
  return rotte;
}

let server;
let admin;
before(async () => {
  server = await avviaServer();
  await svuotaDatabase();
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
});
after(() => server.chiudi());

describe('id nell\'indirizzo', () => {
  const rotte = rotteConParametri();

  it('le rotte si trovano tutte', () => {
    assert.ok(rotte.length >= 50, `trovate solo ${rotte.length} rotte`);
    assert.ok(rotte.some(([m, p]) => m === 'PATCH' && p === '/sessioni/:id/completa'));
  });

  for (const [valore, atteso] of [['abc', 'un id che non e\' un numero'], ['999999', 'un id che non esiste']]) {
    it(`${atteso}: nessuna risposta 500`, async () => {
      const errori = [];
      for (const [metodo, percorso] of rotte) {
        const indirizzo = percorso.replace(/:[a-zA-Z]+/g, valore);
        const corpo = ['POST', 'PUT', 'PATCH'].includes(metodo) ? {} : undefined;
        const risposta = await server.richiesta(metodo, indirizzo, { token: tokenPer(admin), corpo });
        if (risposta.stato >= 500) errori.push(`${metodo} ${percorso} → ${risposta.stato} ${risposta.corpo?.messaggio ?? ''}`);
        else if (valore === 'abc' && !percorso.includes(':famiglia') && risposta.stato !== 400) {
          errori.push(`${metodo} ${percorso} → ${risposta.stato} invece di 400`);
        }
      }
      assert.deepEqual(errori, []);
    });
  }
});
