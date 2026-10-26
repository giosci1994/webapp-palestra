// Favourite plans: the star on a plan, for each user, on the plans they can
// see (their own and the global ones).
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaScheda } from '../supporto/dati.js';

let server;
let utente;
let altro;
let mia;
let globale;
let suaPersonale;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  altro = await creaUtente();
  mia = await creaScheda(utente, [], { titolo: 'Mia' });
  globale = await creaScheda(altro, [], { titolo: 'Globale', visibilita: 'GLOBALE' });
  suaPersonale = await creaScheda(altro, [], { titolo: 'Sua' });
});

const preferite = (chi = utente) => server.richiesta('GET', '/schede/preferite', { token: tokenPer(chi) });
const stella = (metodo, id, chi = utente, lingua) => server.richiesta(metodo, `/schede/${id}/preferita`, { token: tokenPer(chi), lingua });

describe('favourite plans', () => {
  it('added and removed, and the list gives them back most recent first', async () => {
    assert.equal((await stella('PUT', mia.id)).stato, 200);
    assert.equal((await stella('PUT', globale.id)).stato, 200);
    assert.deepEqual((await preferite()).corpo.dati, [globale.id, mia.id]);

    assert.equal((await stella('DELETE', mia.id)).stato, 200);
    assert.deepEqual((await preferite()).corpo.dati, [globale.id]);
  });

  it('repeating the same action changes nothing', async () => {
    await stella('PUT', mia.id);
    assert.equal((await stella('PUT', mia.id)).stato, 200);
    assert.equal(await prisma.schedaPreferita.count(), 1);
    assert.equal((await stella('DELETE', globale.id)).stato, 200); // never a favourite
    assert.deepEqual((await preferite()).corpo.dati, [mia.id]);
  });

  it('everyone has their own', async () => {
    await stella('PUT', globale.id, altro);
    assert.deepEqual((await preferite()).corpo.dati, []);
    assert.deepEqual((await preferite(altro)).corpo.dati, [globale.id]);
  });

  it("someone else's personal plan cannot get the star; a missing plan is a 404", async () => {
    const sua = await stella('PUT', suaPersonale.id);
    const inglese = await stella('PUT', 99999, utente, 'en');
    assert.equal(sua.stato, 403);
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [404, 'Plan not found']);
    assert.equal(await prisma.schedaPreferita.count(), 0);
  });

  it('a global plan that goes back to personal leaves the list; a deleted plan takes its stars with it', async () => {
    await stella('PUT', globale.id);
    await stella('PUT', mia.id);
    await prisma.schedaAllenamento.update({ where: { id: globale.id }, data: { visibilita: 'PERSONALE' } });
    assert.deepEqual((await preferite()).corpo.dati, [mia.id]);
    // The star can still be removed
    assert.equal((await stella('DELETE', globale.id)).stato, 200);

    assert.equal((await server.richiesta('DELETE', `/schede/${mia.id}`, { token: tokenPer(utente) })).stato, 200);
    assert.deepEqual((await preferite()).corpo.dati, []);
    assert.equal(await prisma.schedaPreferita.count(), 0);
  });

  it('a wrong id is a 400, and only when signed in', async () => {
    assert.equal((await stella('PUT', 'abc')).stato, 400);
    assert.equal((await server.richiesta('GET', '/schede/preferite')).stato, 401);
    assert.equal((await server.richiesta('PUT', `/schede/${mia.id}/preferita`)).stato, 401);
  });

  it('they are in the data export', async () => {
    await stella('PUT', globale.id);
    const esportazione = await server.richiesta('GET', '/utenti/esportazione', { token: tokenPer(utente) });
    assert.deepEqual(esportazione.corpo.schedePreferite.map(s => s.titolo), ['Globale']);
  });
});
