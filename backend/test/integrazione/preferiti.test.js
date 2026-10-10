// Esercizi preferiti: la stella nel catalogo, per ciascun utente.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio } from '../supporto/dati.js';

let server;
let utente;
let panca;
let squat;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana' });
  squat = await creaEsercizio({ nome: 'Back Squat', nomeIt: 'Squat' });
});

const preferiti = (chi = utente) => server.richiesta('GET', '/esercizi/preferiti', { token: tokenPer(chi) });
const stella = (metodo, id, chi = utente) => server.richiesta(metodo, `/esercizi/${id}/preferito`, { token: tokenPer(chi) });

describe('esercizi preferiti', () => {
  it('si aggiungono e si tolgono, e l\'elenco li restituisce dal piu\' recente', async () => {
    assert.equal((await stella('PUT', panca.id)).stato, 200);
    assert.equal((await stella('PUT', squat.id)).stato, 200);
    assert.deepEqual((await preferiti()).corpo.dati, [squat.id, panca.id]);

    assert.equal((await stella('DELETE', panca.id)).stato, 200);
    assert.deepEqual((await preferiti()).corpo.dati, [squat.id]);
  });

  it('ripetere la stessa azione non cambia niente', async () => {
    await stella('PUT', panca.id);
    assert.equal((await stella('PUT', panca.id)).stato, 200);
    assert.equal(await prisma.esercizioPreferito.count(), 1);
    await stella('DELETE', squat.id); // mai stato preferito
    assert.deepEqual((await preferiti()).corpo.dati, [panca.id]);
  });

  it('ognuno ha i suoi', async () => {
    const altro = await creaUtente();
    await stella('PUT', panca.id, altro);
    assert.deepEqual((await preferiti()).corpo.dati, []);
    assert.deepEqual((await preferiti(altro)).corpo.dati, [panca.id]);
  });

  it('esercizio inesistente 404, id non valido 400, senza login 401', async () => {
    assert.equal((await stella('PUT', 99999)).stato, 404);
    assert.equal((await stella('PUT', 'abc')).stato, 400);
    assert.equal((await server.richiesta('GET', '/esercizi/preferiti')).stato, 401);
  });

  it('finiscono nell\'esportazione dei dati', async () => {
    await stella('PUT', squat.id);
    const esportazione = await server.richiesta('GET', '/utenti/esportazione', { token: tokenPer(utente) });
    assert.deepEqual(esportazione.corpo.eserciziPreferiti.map(e => e.nomeIt), ['Squat']);
  });
});
