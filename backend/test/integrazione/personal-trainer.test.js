// Request to sign up with a personal trainer: data checked before the
// database, message that reaches the personal trainer.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaScheda, tokenPer } from '../supporto/dati.js';

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

  it('the messages come in the language the app asks for', async () => {
    const inglese = (corpo, chi = utente) =>
      server.richiesta('POST', '/utenti/iscrizione-pt', { token: tokenPer(chi), corpo, lingua: 'en' });
    assert.equal((await inglese({ trainerId: 'abc' })).corpo.messaggio, 'Invalid Personal Trainer');
    assert.equal((await inglese({ trainerId: trainer.id, messaggio: 'x'.repeat(501) })).corpo.messaggio,
      'The message can be at most 500 characters long');
    assert.equal((await inglese({ trainerId: trainer.id })).stato, 201);
    assert.equal((await inglese({ trainerId: trainer.id })).corpo.messaggio, 'You already have a pending request');
  });
});

describe('a plan assigned by the trainer', () => {
  it("is named in the client's language and shows in the client's trainer dashboard", async () => {
    const cliente = await creaUtente({ lingua: 'en' });
    await prisma.iscrizionePT.create({ data: { utenteId: cliente.id, trainerId: trainer.id, stato: 'ATTIVA' } });
    const originale = await creaScheda(trainer, [], { titolo: 'Forza' });
    // From before assegnataDaPTId, with only the suffix, and a plan of the client's own
    await creaScheda(cliente, [], { titolo: 'Vecchia (da PT)' });
    await creaScheda(cliente, [], { titolo: 'Mia' });

    const assegnata = await server.richiesta('POST', `/pt/clienti/${cliente.id}/assegna-scheda`, {
      token: tokenPer(trainer), corpo: { schedaId: originale.id }
    });
    assert.equal(assegnata.stato, 201);
    assert.equal(assegnata.corpo.dati.titolo, 'Forza (from your PT)');

    const dashboard = await server.richiesta('GET', '/utenti/mio-pt/dashboard', { token: tokenPer(cliente) });
    assert.deepEqual(dashboard.corpo.dati.schedeAssegnate.map(s => s.titolo).sort(), ['Forza (from your PT)', 'Vecchia (da PT)']);
  });
});

describe('notifications between users and trainers', () => {
  // They used to be only a socket event: whoever was offline never got them,
  // and they vanished from the bell on reload. Now they are saved like the others
  const notificheDi = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id }, orderBy: { id: 'asc' } });

  it('the request reaches the trainer, and the answer reaches the user: all saved, with their link', async () => {
    assert.equal((await iscriviti({ trainerId: trainer.id })).stato, 201);
    const [richiesta] = await notificheDi(trainer);
    assert.equal(richiesta.tipo, 'RICHIESTA_PT');
    assert.equal(richiesta.percorso, '/pt');
    assert.match(richiesta.messaggio, new RegExp(utente.nome));

    const { id } = await prisma.iscrizionePT.findFirst({ where: { utenteId: utente.id } });
    assert.equal((await server.richiesta('PATCH', `/pt/richieste/${id}/accetta`, { token: tokenPer(trainer), corpo: {} })).stato, 200);
    assert.equal((await server.richiesta('DELETE', `/pt/clienti/${utente.id}`, { token: tokenPer(trainer) })).stato, 200);
    const [accettata, terminata] = await notificheDi(utente);
    assert.equal(accettata.percorso, `/trainer/${trainer.id}`);
    assert.match(accettata.messaggio, /Coach Anna/);
    assert.equal(terminata.percorso, '/trova-pt');
  });

  it('a rejected request is saved too', async () => {
    await iscriviti({ trainerId: trainer.id });
    const { id } = await prisma.iscrizionePT.findFirst({ where: { utenteId: utente.id } });
    assert.equal((await server.richiesta('PATCH', `/pt/richieste/${id}/rifiuta`, { token: tokenPer(trainer), corpo: {} })).stato, 200);
    const [rifiutata] = await notificheDi(utente);
    assert.equal(rifiutata.percorso, '/trova-pt');
  });

  it('a request to become a trainer reaches only the active admins, each in their own language', async () => {
    const adminIt = await creaUtente({ ruolo: 'SUPERADMIN', lingua: 'it' });
    const adminEn = await creaUtente({ ruolo: 'SUPERADMIN', lingua: 'en' });
    const sospeso = await creaUtente({ ruolo: 'SUPERADMIN', stato: 'BANNATO' });
    assert.equal((await server.richiesta('POST', '/utenti/richiedi-pt', { token: tokenPer(utente) })).stato, 200);

    const [it, en] = [(await notificheDi(adminIt))[0], (await notificheDi(adminEn))[0]];
    assert.equal(it.percorso, '/admin/utenti');
    assert.notEqual(it.titolo, en.titolo);
    assert.match(it.messaggio, new RegExp(utente.nome));
    assert.equal((await notificheDi(sospeso)).length, 0);
    assert.equal((await notificheDi(trainer)).length, 0);
    assert.equal((await notificheDi(utente)).length, 0);
  });
});
