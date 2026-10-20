// Exercises suggested by users: the proposal, the admins' list, approval
// (which creates the exercise) and rejection, with the notifications.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;
let admin;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ nome: 'Marta' });
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
});

const suggerisci = (corpo, chi = utente) =>
  server.richiesta('POST', '/suggerimenti-esercizi', { token: tokenPer(chi), corpo });
const comeAdmin = (metodo, percorso, corpo) => server.richiesta(metodo, percorso, { token: tokenPer(admin), corpo });
const notificheDi = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id }, orderBy: { id: 'asc' } });

describe('suggesting an exercise', () => {
  it('needs the name and the primary group', async () => {
    for (const corpo of [{}, { nome: 'Hip thrust' }, { gruppoMuscoloPrimario: 'Glutei' }, { nome: '  ', gruppoMuscoloPrimario: 'Glutei' }]) {
      const risposta = await suggerisci(corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      assert.equal(risposta.corpo.messaggio, 'Nome e gruppo muscolare primario sono obbligatori');
    }
    assert.equal(await prisma.suggerimentoEsercizio.count(), 0);
  });

  it('is saved trimmed, waiting, and every admin hears about it', async () => {
    const altroAdmin = await creaUtente({ ruolo: 'SUPERADMIN' });
    const risposta = await suggerisci({
      nome: '  Hip thrust  ', gruppoMuscoloPrimario: ' Glutei ', gruppoMuscoloSecondario: '  ',
      attrezzaturaSuggerita: 'Panca', descrizione: ' Con bilanciere '
    });
    assert.equal(risposta.stato, 201);
    const dati = risposta.corpo.dati;
    assert.equal(dati.nome, 'Hip thrust');
    assert.equal(dati.gruppoMuscoloPrimario, 'Glutei');
    assert.equal(dati.gruppoMuscoloSecondario, null);
    assert.equal(dati.attrezzaturaSuggerita, 'Panca');
    assert.equal(dati.descrizione, 'Con bilanciere');
    assert.equal(dati.stato, 'IN_ATTESA');
    assert.deepEqual(dati.utente, { id: utente.id, nome: 'Marta' });

    for (const chi of [admin, altroAdmin]) {
      const [notifica] = await notificheDi(chi);
      assert.equal(notifica.percorso, '/admin/esercizi');
      assert.match(notifica.messaggio, /Marta.*Hip thrust/);
    }
    assert.deepEqual(await notificheDi(utente), []);
  });

  it('you see only your own suggestions, the most recent first', async () => {
    const altro = await creaUtente();
    await suggerisci({ nome: 'Primo', gruppoMuscoloPrimario: 'Petto' });
    await suggerisci({ nome: 'Secondo', gruppoMuscoloPrimario: 'Petto' });
    await suggerisci({ nome: 'Altrui', gruppoMuscoloPrimario: 'Petto' }, altro);

    const risposta = await server.richiesta('GET', '/suggerimenti-esercizi', { token: tokenPer(utente) });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.map(s => s.nome), ['Secondo', 'Primo']);
    assert.equal(risposta.corpo.dati[0].esercizio, null);
  });
});

describe('suggestions, for the admin', () => {
  let suggerimento;
  beforeEach(async () => {
    suggerimento = (await suggerisci({
      nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei', gruppoMuscoloSecondario: 'Femorali', descrizione: 'Spinta'
    })).corpo.dati;
  });

  it('only the admin sees them and handles them', async () => {
    for (const [metodo, percorso] of [
      ['GET', '/admin/suggerimenti'], ['GET', '/admin/suggerimenti/conteggio'],
      ['PATCH', `/admin/suggerimenti/${suggerimento.id}/approva`], ['PATCH', `/admin/suggerimenti/${suggerimento.id}/rifiuta`]
    ]) {
      const risposta = await server.richiesta(metodo, percorso, { token: tokenPer(utente), corpo: metodo === 'PATCH' ? {} : undefined });
      assert.equal(risposta.stato, 403, `${metodo} ${percorso}`);
    }
    assert.equal((await prisma.suggerimentoEsercizio.findUnique({ where: { id: suggerimento.id } })).stato, 'IN_ATTESA');
  });

  it('the list, by state, with who sent it; the count of the waiting ones', async () => {
    const altro = (await suggerisci({ nome: 'Altro', gruppoMuscoloPrimario: 'Petto' })).corpo.dati;
    await comeAdmin('PATCH', `/admin/suggerimenti/${altro.id}/rifiuta`, {});

    const tutti = await comeAdmin('GET', '/admin/suggerimenti');
    assert.equal(tutti.stato, 200);
    // The waiting ones first
    assert.deepEqual(tutti.corpo.dati.map(s => [s.nome, s.stato]), [['Hip thrust', 'IN_ATTESA'], ['Altro', 'RIFIUTATO']]);
    assert.equal(tutti.corpo.dati[0].utente.email, utente.email);

    const rifiutati = await comeAdmin('GET', '/admin/suggerimenti?stato=RIFIUTATO');
    assert.deepEqual(rifiutati.corpo.dati.map(s => s.nome), ['Altro']);

    assert.deepEqual((await comeAdmin('GET', '/admin/suggerimenti/conteggio')).corpo.dati, { pendenti: 1 });
  });

  it('approving creates the exercise, with what the admin changed, and tells the user', async () => {
    const risposta = await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/approva`, {
      nome: 'Hip thrust con bilanciere', linkVideo: 'https://video.test/hip'
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Suggerimento approvato ed esercizio creato');
    const esercizio = risposta.corpo.dati;
    assert.equal(esercizio.nome, 'Hip thrust con bilanciere');
    assert.equal(esercizio.gruppoMuscoloPrimario, 'Glutei');
    assert.equal(esercizio.gruppoMuscoloSecondario, 'Femorali');
    assert.equal(esercizio.descrizione, 'Spinta');
    assert.equal(esercizio.linkVideo, 'https://video.test/hip');

    const salvato = await prisma.suggerimentoEsercizio.findUnique({ where: { id: suggerimento.id } });
    assert.equal(salvato.stato, 'APPROVATO');
    assert.equal(salvato.esercizioCreato, esercizio.id);
    assert.ok(salvato.gestitoIl);

    const [notifica] = await notificheDi(utente);
    assert.equal(notifica.percorso, '/catalogo');
    assert.match(notifica.messaggio, /Hip thrust/);

    // The user sees the exercise next to their suggestion
    const miei = await server.richiesta('GET', '/suggerimenti-esercizi', { token: tokenPer(utente) });
    assert.equal(miei.corpo.dati[0].esercizio.id, esercizio.id);
  });

  it('rejecting, with or without a reason, tells the user', async () => {
    const senza = (await suggerisci({ nome: 'Senza motivo', gruppoMuscoloPrimario: 'Petto' })).corpo.dati;

    const rifiuto = await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/rifiuta`, { motivoRifiuto: 'Esiste già' });
    assert.equal(rifiuto.stato, 200);
    assert.equal(rifiuto.corpo.messaggio, 'Suggerimento rifiutato');
    await comeAdmin('PATCH', `/admin/suggerimenti/${senza.id}/rifiuta`, {});

    const salvato = await prisma.suggerimentoEsercizio.findUnique({ where: { id: suggerimento.id } });
    assert.equal(salvato.stato, 'RIFIUTATO');
    assert.equal(salvato.motivoRifiuto, 'Esiste già');

    const [conMotivo, senzaMotivo] = await notificheDi(utente);
    assert.equal(conMotivo.messaggio, '"Hip thrust" non è stato approvato: Esiste già');
    assert.equal(senzaMotivo.messaggio, '"Senza motivo" non è stato approvato.');
    assert.equal(await prisma.esercizio.count(), 0);
  });

  it('a suggestion already handled, or missing, is not handled again', async () => {
    await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/rifiuta`, {});
    for (const azione of ['approva', 'rifiuta']) {
      const ancora = await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/${azione}`, {});
      assert.equal(ancora.stato, 400);
      assert.equal(ancora.corpo.messaggio, 'Suggerimento già gestito');
      assert.equal((await comeAdmin('PATCH', `/admin/suggerimenti/99999/${azione}`, {})).stato, 404);
    }
    assert.equal(await prisma.esercizio.count(), 0);
  });
});
