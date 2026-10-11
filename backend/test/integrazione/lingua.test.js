// The app language saved on the account (Utente.lingua): chosen in Profile,
// null to follow the phone, and returned at sign-in so the app switches to it.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ password: 'Password123!' });
});

const aggiorna = corpo => server.richiesta('PATCH', '/utenti/profilo', { token: tokenPer(utente), corpo });
const profilo = () => server.richiesta('GET', '/utenti/profilo', { token: tokenPer(utente) });

describe('app language on the account', () => {
  it('a new account follows the phone', async () => {
    assert.equal((await profilo()).corpo.dati.lingua, null);
  });

  it('is saved from Profile and returned with the profile', async () => {
    const risposta = await aggiorna({ lingua: 'en' });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.lingua, 'en');
    assert.equal((await profilo()).corpo.dati.lingua, 'en');
  });

  it('null, or empty, goes back to the phone language', async () => {
    await aggiorna({ lingua: 'it' });
    assert.equal((await aggiorna({ lingua: null })).corpo.dati.lingua, null);
    await aggiorna({ lingua: 'it' });
    assert.equal((await aggiorna({ lingua: '' })).corpo.dati.lingua, null);
  });

  it('a language the app does not have is refused, and nothing changes', async () => {
    await aggiorna({ lingua: 'it' });
    const risposta = await aggiorna({ lingua: 'fr', nome: 'Cambiato' });
    assert.equal(risposta.stato, 400);
    const salvato = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.deepEqual([salvato.lingua, salvato.nome], ['it', utente.nome]);
  });

  it('comes with the user at sign-in, so the app switches to it right away', async () => {
    await aggiorna({ lingua: 'en' });
    const risposta = await server.richiesta('POST', '/auth/login', {
      corpo: { email: utente.email, password: 'Password123!' }
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.utente.lingua, 'en');
  });
});
