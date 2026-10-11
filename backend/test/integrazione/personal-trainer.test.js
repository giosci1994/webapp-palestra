// Request to sign up with a personal trainer: data checked before the
// database, message that reaches the personal trainer.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;
let trainer;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna' });
});

const iscriviti = (corpo, chi = utente) =>
  server.richiesta('POST', '/utenti/iscrizione-pt', { token: tokenPer(chi), corpo });

describe('richiesta di iscrizione a un PT', () => {
  it('un id che non e\' un numero risponde 400, non 500', async () => {
    for (const trainerId of ['abc', null, undefined, -3, 2.5]) {
      const risposta = await iscriviti({ trainerId });
      assert.equal(risposta.stato, 400, String(trainerId));
      assert.equal(risposta.corpo.messaggio, 'Personal Trainer non valido');
    }
  });

  it('un id che non e\' di un PT attivo risponde 404', async () => {
    const altro = await creaUtente();
    assert.equal((await iscriviti({ trainerId: altro.id })).stato, 404);
    assert.equal((await iscriviti({ trainerId: 99999 })).stato, 404);
  });

  it('il messaggio arriva al PT, senza spazi ai bordi', async () => {
    const risposta = await iscriviti({ trainerId: trainer.id, messaggio: '  Vorrei preparare una gara  ' });
    assert.equal(risposta.stato, 201);

    const richieste = await server.richiesta('GET', '/pt/richieste', { token: tokenPer(trainer) });
    assert.deepEqual(richieste.corpo.dati.map(r => r.messaggioRichiesta), ['Vorrei preparare una gara']);
  });

  it('il messaggio e\' facoltativo, ma non oltre 500 caratteri', async () => {
    assert.equal((await iscriviti({ trainerId: trainer.id, messaggio: 'x'.repeat(501) })).stato, 400);
    assert.equal((await iscriviti({ trainerId: trainer.id, messaggio: { testo: 'no' } })).stato, 400);

    const senza = await iscriviti({ trainerId: trainer.id, messaggio: '   ' });
    assert.equal(senza.stato, 201);
    const salvata = await prisma.iscrizionePT.findFirst({ where: { utenteId: utente.id } });
    assert.equal(salvata.messaggioRichiesta, null);
  });

  it('una seconda richiesta mentre la prima e\' in attesa viene rifiutata', async () => {
    assert.equal((await iscriviti({ trainerId: trainer.id })).stato, 201);
    const seconda = await iscriviti({ trainerId: trainer.id });
    assert.equal(seconda.stato, 400);
    assert.equal(seconda.corpo.messaggio, 'Hai già una richiesta in attesa');
  });
});
