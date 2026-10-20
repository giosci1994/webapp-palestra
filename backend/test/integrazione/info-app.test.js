// Profile → App info: version, build and stack from version.json, without the
// changelog (the app does not show it, and it is most of the file).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avviaServer } from '../supporto/server.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
before(async () => { server = await avviaServer(); });
after(() => server.chiudi());

describe('app info', () => {
  it('has the version of version.json, and no changelog', async () => {
    const { versione, build, stack } = JSON.parse(readFileSync(new URL('../../../version.json', import.meta.url), 'utf8'));
    const risposta = await server.richiesta('GET', '/utenti/info-app', { token: tokenPer(await creaUtente()) });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.versione, versione);
    assert.equal(risposta.corpo.dati.build, build);
    assert.deepEqual(risposta.corpo.dati.stack, stack);
    assert.equal('changelog' in risposta.corpo.dati, false);
    assert.ok(risposta.testo.length < 2000, `${risposta.testo.length} caratteri`);
  });
});
