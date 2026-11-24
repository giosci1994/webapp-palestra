// The health check answers 200 only when the database answers too
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avviaServer } from '../supporto/server.js';

let server;
before(async () => { server = await avviaServer(); });
after(() => server.chiudi());

describe('health check', () => {
  it('reports the version and a reachable database', async () => {
    const { versione } = JSON.parse(readFileSync(new URL('../../../version.json', import.meta.url), 'utf8'));
    const risposta = await server.richiesta('GET', '/salute');
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.successo, true);
    assert.equal(risposta.corpo.database, true);
    assert.equal(risposta.corpo.versione, versione);
  });
});
