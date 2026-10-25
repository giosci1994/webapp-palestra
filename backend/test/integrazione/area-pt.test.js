// The personal trainer area: dashboard, clients and their detail, requests,
// appointments, plans, assigning a plan and the announcement board. The
// notifications between trainer and client are in personal-trainer.test.js.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaSessione, creaRecord, tokenPer, giorniFa, GIORNO } from '../supporto/dati.js';
import { localeDi } from '../../src/i18n/index.js';

let server;
let trainer;
let cliente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna' });
  cliente = await creaUtente({ nome: 'Paolo' });
  await iscrivi(cliente, 'ATTIVA');
});

function iscrivi(chi, stato, dati = {}) {
  return prisma.iscrizionePT.create({ data: { utenteId: chi.id, trainerId: trainer.id, stato, ...dati } });
}
const comePT = (metodo, percorso, corpo, chi = trainer) => server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo, fuso: 'UTC' });
const notificheDi = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id }, orderBy: { id: 'asc' } });

describe('who gets in', () => {
  it('trainers and admins, not users', async () => {
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });
    for (const percorso of ['/pt/dashboard', '/pt/clienti', '/pt/richieste', '/pt/appuntamenti', '/pt/schede', '/pt/annunci']) {
      assert.equal((await comePT('GET', percorso, undefined, cliente)).stato, 403, percorso);
      assert.equal((await comePT('GET', percorso, undefined, admin)).stato, 200, percorso);
      assert.equal((await comePT('GET', percorso)).stato, 200, percorso);
    }
  });
});

describe('dashboard', () => {
  it("counts clients, requests, today's appointments and the clients' workouts", async () => {
    const secondo = await creaUtente();
    await iscrivi(secondo, 'ATTIVA');
    const inAttesa = await creaUtente();
    await iscrivi(inAttesa, 'IN_ATTESA');
    await iscrivi(await creaUtente(), 'TERMINATA');

    const scheda = await creaScheda(cliente);
    await creaSessione(cliente, scheda);
    await creaSessione(cliente, scheda, { conclusa: false });
    await creaSessione(secondo, await creaScheda(secondo));
    await creaSessione(inAttesa, await creaScheda(inAttesa));

    const oggi = new Date().toISOString().slice(0, 10);
    const alle = (giorno, ora) => new Date(`${giorno}T${ora}:00Z`);
    const altroGiorno = n => new Date(Date.parse(oggi) + n * GIORNO).toISOString().slice(0, 10);
    for (const dataOra of [alle(oggi, '00:30'), alle(oggi, '23:30'), alle(altroGiorno(-1), '23:30'), alle(altroGiorno(1), '00:30')]) {
      await prisma.appuntamentoPT.create({ data: { trainerId: trainer.id, clienteId: cliente.id, titolo: 'A', dataOra } });
    }

    const risposta = await comePT('GET', '/pt/dashboard');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati, { clientiAttivi: 2, richiesteInAttesa: 1, appuntamentiOggi: 2, sessioniClienti: 3 });
  });
});

describe('clients', () => {
  it('the active ones, the latest first, with the notes and their counts', async () => {
    const recente = await creaUtente({ nome: 'Recente' });
    await iscrivi(recente, 'ATTIVA', { notePT: 'Ginocchio', dataRichiesta: new Date() });
    await prisma.iscrizionePT.updateMany({ where: { utenteId: cliente.id }, data: { dataRichiesta: giorniFa(10) } });
    await iscrivi(await creaUtente(), 'IN_ATTESA');
    await creaSessione(cliente, await creaScheda(cliente));

    const { dati } = (await comePT('GET', '/pt/clienti')).corpo;
    assert.deepEqual(dati.map(c => c.nome), ['Recente', 'Paolo']);
    assert.equal(dati[0].notePT, 'Ginocchio');
    assert.ok(dati[0].iscrizioneId && dati[0].dataIscrizione);
    assert.deepEqual(dati[1]._count, { sessioni: 1, schedeCreate: 1, recordPersonali: 0 });
  });

  it("someone else's client, or a pending one, stays closed", async () => {
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const inAttesa = await creaUtente();
    await iscrivi(inAttesa, 'IN_ATTESA');
    for (const [chi, di] of [[altroTrainer, cliente], [trainer, inAttesa]]) {
      const risposta = await comePT('GET', `/pt/clienti/${di.id}`, undefined, chi);
      assert.equal(risposta.stato, 403);
      assert.equal(risposta.corpo.messaggio, 'Non è un tuo cliente');
    }
  });

  it("the detail: profile, last workouts, records, assigned plans and statistics in the client's days", async () => {
    // Late evening in New York is already the next day in UTC
    await prisma.utente.update({ where: { id: cliente.id }, data: { fusoOrario: 'America/New_York', dataResetStatistiche: giorniFa(30) } });
    const [panca, curl] = [await creaEsercizio({ gruppoMuscoloPrimario: 'Petto' }), await creaEsercizio({ gruppoMuscoloPrimario: 'Bicipiti' })];
    const scheda = await creaScheda(cliente);
    const sera = new Date(`${giorniFa(3, 'UTC').toISOString().slice(0, 10)}T02:00:00Z`);
    await creaSessione(cliente, scheda, { inizio: sera, durataMinuti: 50, serie: [
      { esercizio: panca, peso: 80, rep: 8 }, { esercizio: panca, peso: 80, rep: 8 }, { esercizio: curl, peso: 20, rep: 10 },
      { esercizio: panca, peso: 40, rep: 10, tipo: 'RISCALDAMENTO' }
    ] });
    await prisma.sessioneAllenamento.updateMany({ where: { dataInizio: sera }, data: { volumeTotaleKg: 1480 } });
    for (let i = 0; i < 5; i++) await creaSessione(cliente, scheda, { inizio: giorniFa(40 + i) });
    await creaRecord(cliente, panca, 100);
    await creaScheda(cliente, [panca], { titolo: 'Da Anna', assegnataDaPTId: trainer.id });
    await creaScheda(cliente, [], { titolo: 'Da un altro', assegnataDaPTId: (await creaUtente({ ruolo: 'PERSONAL_TRAINER' })).id });

    const risposta = await comePT('GET', `/pt/clienti/${cliente.id}`);
    assert.equal(risposta.stato, 200);
    const d = risposta.corpo.dati;
    assert.equal(d.cliente.nome, 'Paolo');
    assert.equal(d.cliente.fusoOrario, undefined);
    assert.equal(d.iscrizione.stato, 'ATTIVA');
    assert.equal(d.ultime5Sessioni.length, 5);
    assert.equal(d.ultime5Sessioni[0]._count.logSerie, 3);
    assert.deepEqual(d.record.map(r => r.pesoMaxRaggiunto), [100]);
    assert.deepEqual(d.schedeAssegnate.map(s => s.titolo), ['Da Anna']);
    assert.deepEqual(d.statistiche, {
      // The five old workouts are from before the reset
      totaleSessioni: 1, totaleDurata: 50, totaleVolume: 1480, totaleRecord: 1,
      sessioni: [{ data: giorniFa(4, 'UTC').toISOString().slice(0, 10), sessioni: 1, durata: 50, volume: 1480 }],
      gruppiMuscolari: [{ nome: 'Petto', serie: 2 }, { nome: 'Bicipiti', serie: 1 }]
    });
  });

  it('a plan assigned by the trainer is removed; not the client\'s own', async () => {
    const assegnata = await creaScheda(cliente, [], { assegnataDaPTId: trainer.id });
    const sua = await creaScheda(cliente);

    const nonSua = await comePT('DELETE', `/pt/clienti/${cliente.id}/schede/${sua.id}`);
    assert.equal(nonSua.stato, 404);
    assert.equal(nonSua.corpo.messaggio, 'Scheda non trovata');

    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    assert.equal((await comePT('DELETE', `/pt/clienti/${cliente.id}/schede/${assegnata.id}`, undefined, altroTrainer)).stato, 403);

    const rimossa = await comePT('DELETE', `/pt/clienti/${cliente.id}/schede/${assegnata.id}`);
    assert.equal(rimossa.stato, 200);
    assert.equal(rimossa.corpo.messaggio, 'Scheda rimossa');
    assert.deepEqual((await prisma.schedaAllenamento.findMany()).map(s => s.id), [sua.id]);
  });

  it('ending the relationship works once, and only with your own clients', async () => {
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    assert.equal((await comePT('DELETE', `/pt/clienti/${cliente.id}`, undefined, altroTrainer)).stato, 404);
    const fine = await comePT('DELETE', `/pt/clienti/${cliente.id}`);
    assert.equal(fine.stato, 200);
    assert.equal(fine.corpo.messaggio, 'Rapporto terminato');
    const ancora = await comePT('DELETE', `/pt/clienti/${cliente.id}`);
    assert.equal(ancora.stato, 404);
    assert.equal(ancora.corpo.messaggio, 'Iscrizione non trovata');
  });
});

describe('requests', () => {
  let nuovo;
  let richiesta;
  beforeEach(async () => {
    nuovo = await creaUtente({ nome: 'Nuovo' });
    richiesta = await iscrivi(nuovo, 'IN_ATTESA', { messaggioRichiesta: 'Ciao' });
  });

  it('only the pending ones sent to you', async () => {
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await prisma.iscrizionePT.create({ data: { utenteId: (await creaUtente()).id, trainerId: altroTrainer.id } });
    const { dati } = (await comePT('GET', '/pt/richieste')).corpo;
    assert.deepEqual(dati.map(r => [r.utente.nome, r.messaggioRichiesta]), [['Nuovo', 'Ciao']]);
  });

  it('accepted with the trainer\'s notes; not twice, not someone else\'s', async () => {
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    assert.equal((await comePT('PATCH', `/pt/richieste/${richiesta.id}/accetta`, {}, altroTrainer)).stato, 404);

    const risposta = await comePT('PATCH', `/pt/richieste/${richiesta.id}/accetta`, { notePT: 'Obiettivo gara' });
    assert.equal(risposta.stato, 200);
    assert.deepEqual([risposta.corpo.dati.stato, risposta.corpo.dati.notePT, risposta.corpo.dati.utente.nome], ['ATTIVA', 'Obiettivo gara', 'Nuovo']);
    assert.ok(risposta.corpo.dati.dataRisposta);

    const ancora = await comePT('PATCH', `/pt/richieste/${richiesta.id}/accetta`, {});
    assert.deepEqual([ancora.stato, ancora.corpo.messaggio], [404, 'Richiesta non trovata']);
    assert.equal((await comePT('PATCH', `/pt/richieste/${richiesta.id}/rifiuta`, {})).stato, 404);
  });

  it('rejected', async () => {
    const risposta = await comePT('PATCH', `/pt/richieste/${richiesta.id}/rifiuta`, {});
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Richiesta rifiutata');
    assert.equal((await prisma.iscrizionePT.findUnique({ where: { id: richiesta.id } })).stato, 'RIFIUTATA');
  });
});

describe('appointments', () => {
  const nuovo = (corpo, chi = trainer) => comePT('POST', '/pt/appuntamenti', { clienteId: cliente.id, titolo: 'Test massimali', ...corpo }, chi);

  it("only with your clients, an hour by default; the client is told the date in their language and time zone", async () => {
    await prisma.utente.update({ where: { id: cliente.id }, data: { lingua: 'en', fusoOrario: 'Pacific/Auckland' } });
    const dataOra = '2026-03-01T23:30:00.000Z';
    const risposta = await nuovo({ dataOra, descrizione: 'Panca e squat' });
    assert.equal(risposta.stato, 201);
    const a = risposta.corpo.dati;
    assert.deepEqual([a.titolo, a.dataOra, a.durataMinuti, a.descrizione, a.note, a.completato, a.cliente.nome],
      ['Test massimali', dataOra, 60, 'Panca e squat', null, false, 'Paolo']);

    const [notifica] = await notificheDi(cliente);
    const giornoCliente = new Date(dataOra).toLocaleDateString(localeDi('en'), { timeZone: 'Pacific/Auckland' });
    assert.equal(notifica.messaggio, `Coach Anna scheduled "Test massimali" for ${giornoCliente}`);
    assert.notEqual(giornoCliente, new Date(dataOra).toLocaleDateString(localeDi('en'), { timeZone: 'UTC' }));
    assert.equal(notifica.percorso, '/dashboard');

    const estraneo = await creaUtente();
    const vietato = await nuovo({ clienteId: estraneo.id, dataOra });
    assert.deepEqual([vietato.stato, vietato.corpo.messaggio], [403, 'Questo utente non è un tuo cliente']);
  });

  it('the list: yours only, by date, with the filters', async () => {
    const secondo = await creaUtente();
    await iscrivi(secondo, 'ATTIVA');
    await nuovo({ dataOra: '2026-05-10T10:00:00Z', titolo: 'Dopo' });
    await nuovo({ dataOra: '2026-05-01T10:00:00Z', titolo: 'Prima' });
    await nuovo({ dataOra: '2026-05-05T10:00:00Z', titolo: 'Secondo', clienteId: secondo.id });
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await prisma.appuntamentoPT.create({ data: { trainerId: altroTrainer.id, clienteId: cliente.id, titolo: 'Altrui', dataOra: new Date('2026-05-03T10:00:00Z') } });

    const titoli = async query => (await comePT('GET', `/pt/appuntamenti${query}`)).corpo.dati.map(a => a.titolo);
    assert.deepEqual(await titoli(''), ['Prima', 'Secondo', 'Dopo']);
    assert.deepEqual(await titoli('?da=2026-05-04T00:00:00Z'), ['Secondo', 'Dopo']);
    assert.deepEqual(await titoli('?a=2026-05-06T00:00:00Z'), ['Prima', 'Secondo']);
    assert.deepEqual(await titoli(`?clienteId=${secondo.id}`), ['Secondo']);
  });

  it('changed in the fields sent, and deleted; not someone else\'s', async () => {
    const { dati } = (await nuovo({ dataOra: '2026-05-10T10:00:00Z', note: 'Portare cintura' })).corpo;
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const altrui = await comePT('PATCH', `/pt/appuntamenti/${dati.id}`, { titolo: 'X' }, altroTrainer);
    assert.deepEqual([altrui.stato, altrui.corpo.messaggio], [404, 'Appuntamento non trovato']);
    assert.equal((await comePT('DELETE', `/pt/appuntamenti/${dati.id}`, undefined, altroTrainer)).stato, 404);

    const cambiato = await comePT('PATCH', `/pt/appuntamenti/${dati.id}`, { completato: true, durataMinuti: 90 });
    assert.equal(cambiato.stato, 200);
    assert.deepEqual([cambiato.corpo.dati.titolo, cambiato.corpo.dati.note, cambiato.corpo.dati.completato, cambiato.corpo.dati.durataMinuti],
      ['Test massimali', 'Portare cintura', true, 90]);

    const eliminato = await comePT('DELETE', `/pt/appuntamenti/${dati.id}`);
    assert.deepEqual([eliminato.stato, eliminato.corpo.messaggio], [200, 'Appuntamento eliminato']);
    assert.equal(await prisma.appuntamentoPT.count(), 0);
  });
});

describe('plans', () => {
  it("the trainer's own and the global ones, not other people's personal ones", async () => {
    const altro = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await creaScheda(trainer, [], { titolo: 'Mia' });
    await creaScheda(altro, [], { titolo: 'Globale', visibilita: 'GLOBALE' });
    await creaScheda(altro, [], { titolo: 'Privata altrui' });
    const { dati } = (await comePT('GET', '/pt/schede')).corpo;
    assert.deepEqual(dati.map(s => s.titolo).sort(), ['Globale', 'Mia']);
  });

  it('created with a title and at least one exercise, with the default targets', async () => {
    const [a, b] = [await creaEsercizio(), await creaEsercizio()];
    for (const corpo of [{ esercizi: [{ esercizioId: a.id }] }, { titolo: 'Vuota', esercizi: [] }]) {
      const risposta = await comePT('POST', '/pt/schede', corpo);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Titolo e almeno un esercizio sono obbligatori']);
    }

    const risposta = await comePT('POST', '/pt/schede', {
      titolo: 'Forza', esercizi: [{ esercizioId: String(a.id) }, { esercizioId: b.id, serieTarget: '5', repTarget: '5', recuperoSecondi: 180 }]
    });
    assert.equal(risposta.stato, 201);
    const s = risposta.corpo.dati;
    assert.deepEqual([s.creatoreId, s.livello, s.visibilita, s.descrizione], [trainer.id, 'BASE', 'PERSONALE', null]);
    const esercizi = [...s.esercizi].sort((x, y) => x.ordineEsecuzione - y.ordineEsecuzione)
      .map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.recuperoSecondi, e.ordineEsecuzione]);
    assert.deepEqual(esercizi, [[a.id, 3, '8-12', 90, 1], [b.id, 5, '5', 180, 2]]);
  });

  it('assigned to a client as their own copy, with the same exercises and targets', async () => {
    const [a, b] = [await creaEsercizio(), await creaEsercizio()];
    const originale = await creaScheda(trainer, [a, b], { titolo: 'Forza', descrizione: 'Tre giorni', livello: 'AVANZATO' });
    // The title of the copy is in the client's language
    await prisma.utente.update({ where: { id: cliente.id }, data: { lingua: 'it' } });

    const risposta = await comePT('POST', `/pt/clienti/${cliente.id}/assegna-scheda`, { schedaId: originale.id });
    assert.equal(risposta.stato, 201);
    const copia = await prisma.schedaAllenamento.findUnique({ where: { id: risposta.corpo.dati.id }, include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } } });
    assert.deepEqual([copia.creatoreId, copia.assegnataDaPTId, copia.titolo, copia.descrizione, copia.livello, copia.visibilita],
      [cliente.id, trainer.id, 'Forza (da PT)', 'Tre giorni', 'AVANZATO', 'PERSONALE']);
    assert.deepEqual(copia.esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.ordineEsecuzione]), [[a.id, 3, '8-12', 1], [b.id, 3, '8-12', 2]]);

    const [notifica] = await notificheDi(cliente);
    assert.equal(notifica.tipo, 'SCHEDA_ASSEGNATA');
    assert.equal(notifica.percorso, `/schede/${copia.id}`);
  });

  it('not to someone who is not your client, nor a plan that does not exist', async () => {
    const originale = await creaScheda(trainer);
    const estraneo = await creaUtente();
    const vietata = await comePT('POST', `/pt/clienti/${estraneo.id}/assegna-scheda`, { schedaId: originale.id });
    assert.deepEqual([vietata.stato, vietata.corpo.messaggio], [403, 'Non è un tuo cliente']);
    const mancante = await comePT('POST', `/pt/clienti/${cliente.id}/assegna-scheda`, { schedaId: 99999 });
    assert.deepEqual([mancante.stato, mancante.corpo.messaggio], [404, 'Scheda non trovata']);
    assert.equal(await prisma.schedaAllenamento.count(), 1);
  });
});

describe('announcement board', () => {
  let secondo;
  beforeEach(async () => {
    secondo = await creaUtente();
    await iscrivi(secondo, 'ATTIVA');
    await iscrivi(await creaUtente(), 'IN_ATTESA');
  });
  const annuncia = (corpo, chi = trainer) => comePT('POST', '/pt/annunci', corpo, chi);

  it('needs a title and a text', async () => {
    for (const corpo of [{ titolo: 'Solo titolo' }, { contenuto: 'Solo testo' }]) {
      const risposta = await annuncia(corpo);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Titolo e contenuto sono obbligatori']);
    }
  });

  it('to everyone: each active client gets it, as the trainer wrote it', async () => {
    const lungo = 'x'.repeat(150);
    const risposta = await annuncia({ titolo: 'Chiuso lunedì', contenuto: lungo });
    assert.equal(risposta.stato, 201);
    assert.deepEqual([risposta.corpo.dati.priorita, risposta.corpo.dati.destinatario], ['normale', null]);

    for (const chi of [cliente, secondo]) {
      const [notifica] = await notificheDi(chi);
      assert.equal(notifica.titolo, '📢 Chiuso lunedì');
      assert.equal(notifica.messaggio, 'x'.repeat(100));
    }
    assert.equal(await prisma.allenamentoNotifica.count(), 2);
  });

  it('to one client: only them; not to someone who is not a client', async () => {
    const risposta = await annuncia({ titolo: 'Per te', contenuto: 'Scheda nuova', priorita: 'importante', destinatarioId: cliente.id });
    assert.equal(risposta.stato, 201);
    assert.deepEqual([risposta.corpo.dati.priorita, risposta.corpo.dati.destinatario.id], ['importante', cliente.id]);
    assert.equal((await notificheDi(cliente)).length, 1);
    assert.equal((await notificheDi(secondo)).length, 0);

    const estraneo = await creaUtente();
    const vietato = await annuncia({ titolo: 'X', contenuto: 'Y', destinatarioId: estraneo.id });
    assert.deepEqual([vietato.stato, vietato.corpo.messaggio], [403, 'Questo utente non è un tuo cliente']);
  });

  it('the trainer sees their own, the latest first, and deletes them', async () => {
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await annuncia({ titolo: 'Primo', contenuto: 'A' });
    const secondoAnnuncio = (await annuncia({ titolo: 'Secondo', contenuto: 'B', destinatarioId: cliente.id })).corpo.dati;
    await prisma.annuncioPT.create({ data: { trainerId: altroTrainer.id, titolo: 'Altrui', contenuto: 'C' } });

    const { dati } = (await comePT('GET', '/pt/annunci')).corpo;
    assert.deepEqual(dati.map(a => a.titolo), ['Secondo', 'Primo']);
    assert.equal(dati[0].destinatario.nome, 'Paolo');

    const altrui = await comePT('DELETE', `/pt/annunci/${secondoAnnuncio.id}`, undefined, altroTrainer);
    assert.deepEqual([altrui.stato, altrui.corpo.messaggio], [404, 'Annuncio non trovato']);
    const eliminato = await comePT('DELETE', `/pt/annunci/${secondoAnnuncio.id}`);
    assert.deepEqual([eliminato.stato, eliminato.corpo.messaggio], [200, 'Annuncio eliminato']);
    assert.equal(await prisma.annuncioPT.count({ where: { trainerId: trainer.id } }), 1);
  });
});
