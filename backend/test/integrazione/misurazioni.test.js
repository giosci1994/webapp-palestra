// Body composition measurements: your own, and those a personal trainer adds
// for an active client.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, giorniFa } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ altezzaCm: 180 });
});

const misura = (corpo, chi = utente) =>
  server.richiesta('POST', '/misurazioni', { token: tokenPer(chi), corpo });
const lista = (chi = utente) => server.richiesta('GET', '/misurazioni', { token: tokenPer(chi) });

describe('your own measurements', () => {
  it('need to be signed in', async () => {
    assert.equal((await server.richiesta('GET', '/misurazioni')).stato, 401);
    assert.equal((await server.richiesta('POST', '/misurazioni', { corpo: { peso: 80 } })).stato, 401);
  });

  it('numbers can come as text; empty fields are saved empty', async () => {
    const risposta = await misura({
      data: '2026-03-01T08:00:00Z', peso: '80.5', grassoCorporeoPct: 18, bmr: '1800.7', etaMetabolica: '',
      acquaPct: 'tanta', note: 'A digiuno'
    });
    assert.equal(risposta.stato, 201);
    const m = risposta.corpo.dati;
    assert.equal(m.utenteId, utente.id);
    assert.equal(m.data, '2026-03-01T08:00:00.000Z');
    assert.equal(m.peso, 80.5);
    assert.equal(m.grassoCorporeoPct, 18);
    assert.equal(m.bmr, 1800);
    assert.equal(m.etaMetabolica, null);
    assert.equal(m.acquaPct, null);
    assert.equal(m.note, 'A digiuno');
    assert.equal(m.inseritaDaPTId, null);
  });

  it('without a date it is now', async () => {
    const prima = Date.now();
    const { corpo } = await misura({ peso: 80 });
    assert.ok(new Date(corpo.dati.data).getTime() >= prima - 1000);
  });

  it('the BMI comes from the height in the profile when it is missing, and is kept when given', async () => {
    assert.equal((await misura({ peso: 81 })).corpo.dati.bmi, 25);
    assert.equal((await misura({ peso: 81, bmi: 24.2 })).corpo.dati.bmi, 24.2);

    const senzaAltezza = await creaUtente();
    assert.equal((await misura({ peso: 81 }, senzaAltezza)).corpo.dati.bmi, null);
    assert.equal((await misura({ grassoCorporeoPct: 20 })).corpo.dati.bmi, null);
  });

  it('the list has only yours, the most recent first', async () => {
    const altro = await creaUtente();
    await misura({ peso: 80, data: giorniFa(10).toISOString() });
    await misura({ peso: 79, data: giorniFa(1).toISOString() });
    await misura({ peso: 70 }, altro);

    const risposta = await lista();
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.map(m => m.peso), [79, 80]);
  });

  it('you delete only your own', async () => {
    const altro = await creaUtente();
    const mia = (await misura({ peso: 80 })).corpo.dati;
    const sua = (await misura({ peso: 70 }, altro)).corpo.dati;

    const vietata = await server.richiesta('DELETE', `/misurazioni/${sua.id}`, { token: tokenPer(utente) });
    assert.equal(vietata.stato, 403);
    assert.equal((await lista(altro)).corpo.dati.length, 1);

    assert.equal((await server.richiesta('DELETE', '/misurazioni/99999', { token: tokenPer(utente) })).stato, 404);

    const eliminata = await server.richiesta('DELETE', `/misurazioni/${mia.id}`, { token: tokenPer(utente) });
    assert.equal(eliminata.stato, 200);
    assert.equal(eliminata.corpo.messaggio, 'Misurazione eliminata');
    assert.deepEqual((await lista()).corpo.dati, []);
  });
});

describe("a client's measurements, for their personal trainer", () => {
  let trainer;
  beforeEach(async () => {
    trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
  });
  const iscrivi = stato => prisma.iscrizionePT.create({ data: { utenteId: utente.id, trainerId: trainer.id, stato } });

  it('the trainer of an active client reads them and adds one, marked as theirs', async () => {
    await iscrivi('ATTIVA');
    await misura({ peso: 80 });

    const aggiunta = await server.richiesta('POST', `/misurazioni/cliente/${utente.id}`, {
      token: tokenPer(trainer), corpo: { peso: 81 }
    });
    assert.equal(aggiunta.stato, 201);
    assert.equal(aggiunta.corpo.dati.utenteId, utente.id);
    assert.equal(aggiunta.corpo.dati.inseritaDaPTId, trainer.id);
    // The BMI from the client's height
    assert.equal(aggiunta.corpo.dati.bmi, 25);

    const lette = await server.richiesta('GET', `/misurazioni/cliente/${utente.id}`, { token: tokenPer(trainer) });
    assert.equal(lette.stato, 200);
    assert.equal(lette.corpo.dati.length, 2);
    // The client sees it among their own
    assert.equal((await lista()).corpo.dati.length, 2);
  });

  it('not with a request still pending, nor for someone else\'s client', async () => {
    await iscrivi('IN_ATTESA');
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    for (const chi of [trainer, altroTrainer]) {
      const lettura = await server.richiesta('GET', `/misurazioni/cliente/${utente.id}`, { token: tokenPer(chi) });
      assert.equal(lettura.stato, 403);
      assert.equal(lettura.corpo.messaggio, 'Non sei il Personal Trainer di questo cliente');
      const scrittura = await server.richiesta('POST', `/misurazioni/cliente/${utente.id}`, { token: tokenPer(chi), corpo: { peso: 1 } });
      assert.equal(scrittura.stato, 403);
    }
    assert.equal(await prisma.misurazioneCorporea.count(), 0);
  });
});
