// The controllers' messages follow the language of the request (Accept-Language),
// and a notification for another user is written in that user's language.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaScheda } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
});

const chiama = (metodo, percorso, { corpo, lingua, chi = utente } = {}) =>
  server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo, ...(lingua !== undefined && { lingua }) });

describe('controller messages in the language of the request', () => {
  it('an error: English with Accept-Language en, Italian with it', async () => {
    const inglese = await chiama('GET', '/sessioni/999999', { lingua: 'en' });
    assert.equal(inglese.stato, 404);
    assert.equal(inglese.corpo.messaggio, 'Workout not found');

    const italiano = await chiama('GET', '/sessioni/999999', { lingua: 'it' });
    assert.equal(italiano.corpo.messaggio, 'Sessione non trovata');

    // A language the app does not have, or none at all: English
    assert.equal((await chiama('GET', '/sessioni/999999', { lingua: 'de' })).corpo.messaggio, 'Workout not found');
    assert.equal((await chiama('GET', '/sessioni/999999', { lingua: null })).corpo.messaggio, 'Workout not found');
  });

  it('a message with a variable and a plural', async () => {
    const scheda = await creaScheda(utente, [], { visibilita: 'PERSONALE' });
    const altro = await creaUtente();
    const inglese = await chiama('GET', `/schede/docx?ids=${scheda.id},${scheda.id}`, { chi: altro, lingua: 'en' });
    assert.equal(inglese.corpo.messaggio, 'The same plan is listed more than once');

    const inesistente = await chiama('GET', '/schede/docx?ids=987654', { lingua: 'en' });
    assert.equal(inesistente.corpo.messaggio, 'Plan 987654 not found');
    const inItaliano = await chiama('GET', '/schede/docx?ids=987654', { lingua: 'it' });
    assert.equal(inItaliano.corpo.messaggio, 'Scheda 987654 non trovata');
  });

  it('a confirmation', async () => {
    const corpo = { nome: 'Nuovo Nome' };
    assert.equal((await chiama('PATCH', '/utenti/profilo', { corpo, lingua: 'en' })).corpo.messaggio, 'Profile updated');
    assert.equal((await chiama('PATCH', '/utenti/profilo', { corpo, lingua: 'it' })).corpo.messaggio, 'Profilo aggiornato');
  });
});

describe('a workout scheduled by the personal trainer', () => {
  let trainer;
  let scheda;

  beforeEach(async () => {
    trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna' });
    scheda = await creaScheda(trainer, [], { visibilita: 'GLOBALE', titolo: 'Spinta' });
  });

  const assegna = async (lingua) => {
    const cliente = await creaUtente({ lingua });
    await prisma.iscrizionePT.create({ data: { utenteId: cliente.id, trainerId: trainer.id, stato: 'ATTIVA' } });
    return cliente;
  };
  const notificheDi = cliente => prisma.allenamentoNotifica.findMany({ where: { utenteId: cliente.id } });

  it('notifies the client in the client language, not in the trainer request one', async () => {
    const inglese = await assegna('en');
    const italiano = await assegna('it');

    // Both requests are made by the trainer, in Italian
    for (const cliente of [inglese, italiano]) {
      const risposta = await chiama('POST', '/pianificazione', {
        chi: trainer, lingua: 'it', corpo: { schedaId: scheda.id, data: '2030-01-07', utenteId: cliente.id }
      });
      assert.equal(risposta.stato, 201);
    }

    const [notificaEn] = await notificheDi(inglese);
    assert.deepEqual([notificaEn.titolo, notificaEn.messaggio], ['New workout in your calendar', 'Spinta — 2030-01-07']);
    const [notificaIt] = await notificheDi(italiano);
    assert.deepEqual([notificaIt.titolo, notificaIt.messaggio], ['Nuovo allenamento in calendario', 'Spinta — 2030-01-07']);
  });

  it('the weekly program notification has the right plural and trainer name', async () => {
    const cliente = await assegna('en');
    // 2030-01-07 is a Monday: a single occurrence
    const risposta = await chiama('POST', '/pianificazione/settimanale', {
      chi: trainer, lingua: 'it',
      corpo: { voci: [{ schedaId: scheda.id, giornoSettimana: 0 }], dataInizio: '2030-01-07', settimane: 1, utenteId: cliente.id }
    });
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.creati, 1);

    await chiama('POST', '/pianificazione/settimanale', {
      chi: trainer, lingua: 'it',
      corpo: { voci: [{ schedaId: scheda.id, giornoSettimana: 0 }, { schedaId: scheda.id, giornoSettimana: 2 }], dataInizio: '2030-02-04', settimane: 2, utenteId: cliente.id }
    });

    const notifiche = (await notificheDi(cliente)).sort((a, b) => a.id - b.id);
    assert.deepEqual(notifiche.map(n => n.titolo), ['Your program has been updated', 'Your program has been updated']);
    assert.deepEqual(notifiche.map(n => n.messaggio), [
      '1 workout added to your calendar by Coach Anna',
      '4 workouts added to your calendar by Coach Anna'
    ]);
  });
});
