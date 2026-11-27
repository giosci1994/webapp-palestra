// The app theme saved on the account (Utente.tema): chosen in Profile, null to
// follow the phone, and returned with the profile and at sign-in so the app
// switches to it on every device.
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

const aggiorna = (corpo, lingua) => server.richiesta('PATCH', '/utenti/profilo', { token: tokenPer(utente), corpo, lingua });
const profilo = () => server.richiesta('GET', '/utenti/profilo', { token: tokenPer(utente) });

describe('app theme on the account', () => {
  it('a new account follows the phone', async () => {
    assert.equal((await profilo()).corpo.dati.tema, null);
  });

  it('is saved from Profile and returned with the profile', async () => {
    const risposta = await aggiorna({ tema: 'chiaro' });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.tema, 'chiaro');
    assert.equal((await profilo()).corpo.dati.tema, 'chiaro');
  });

  it('null, empty or "auto" go back to the phone setting', async () => {
    for (const valore of [null, '', 'auto']) {
      await aggiorna({ tema: 'scuro' });
      assert.equal((await aggiorna({ tema: valore })).corpo.dati.tema, null);
    }
  });

  it('a theme the app does not have is refused in the language of the request, and nothing changes', async () => {
    await aggiorna({ tema: 'scuro' });
    const it_ = await aggiorna({ tema: 'blu', nome: 'Cambiato' }, 'it');
    const en = await aggiorna({ tema: 'blu' }, 'en');
    assert.equal(it_.stato, 400);
    assert.equal(it_.corpo.messaggio, 'Tema non supportato: usa chiaro, scuro, oppure null per seguire il telefono');
    assert.equal(en.corpo.messaggio, 'Unsupported theme: use chiaro, scuro, or null to follow the phone');
    const salvato = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.deepEqual([salvato.tema, salvato.nome], ['scuro', utente.nome]);
  });

  it('an update without the theme leaves it as it is (older apps do not send it)', async () => {
    await aggiorna({ tema: 'chiaro' });
    await aggiorna({ nome: 'Altro nome' });
    assert.equal((await profilo()).corpo.dati.tema, 'chiaro');
  });

  it('comes with the user at sign-in', async () => {
    await aggiorna({ tema: 'scuro' });
    const risposta = await server.richiesta('POST', '/auth/login', {
      corpo: { email: utente.email, password: 'Password123!' }
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.utente.tema, 'scuro');
  });
});
