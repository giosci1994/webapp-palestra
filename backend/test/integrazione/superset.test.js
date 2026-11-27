// Supersets and circuits: the group of the exercises in a plan (saved, read,
// fixed when it is left with one member, copied wherever a plan is copied)
// and the group a set is logged with, taken from the plan by the server.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, giorniFa } from '../supporto/dati.js';

let server;
let utente;
let panca;
let rematore;
let squat;
let tapis;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  [panca, rematore, squat, tapis] = [await creaEsercizio(), await creaEsercizio(), await creaEsercizio(), await creaEsercizio()];
});

const come = (metodo, percorso, corpo, chi = utente, lingua) =>
  server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo, lingua, fuso: 'UTC' });
const righe = esercizi => [...esercizi].sort((a, b) => a.ordineEsecuzione - b.ordineEsecuzione).map(e => [e.esercizioId, e.gruppo]);
const eserciziDi = schedaId => prisma.esercizioScheda.findMany({ where: { schedaId }, orderBy: { ordineEsecuzione: 'asc' } });

/** Warm-up, panca + rematore in a superset (4 and 3 sets, no pause between them), squat on its own */
const supersetDiProva = () => [
  { esercizioId: tapis.id, riscaldamento: true, durataMinuti: 10, gruppo: 5 },
  { esercizioId: panca.id, serieTarget: 4, recuperoSecondi: 0, gruppo: 5 },
  { esercizioId: rematore.id, serieTarget: 3, recuperoSecondi: 120, gruppo: 5 },
  { esercizioId: squat.id, serieTarget: 3 }
];

async function schedaConSuperset(chi = utente) {
  const risposta = await come('POST', '/schede', { titolo: 'Spinta e tirata', esercizi: supersetDiProva() }, chi);
  assert.equal(risposta.stato, 201);
  return risposta.corpo.dati;
}

describe('the group in a plan', () => {
  it('saved and read back numbered from 1, warm-up outside, pause 0 and different sets kept', async () => {
    const scheda = await schedaConSuperset();
    assert.deepEqual(righe(scheda.esercizi), [[tapis.id, null], [panca.id, 1], [rematore.id, 1], [squat.id, null]]);

    const { dati } = (await come('GET', `/schede/${scheda.id}`)).corpo;
    assert.deepEqual(righe(dati.esercizi), [[tapis.id, null], [panca.id, 1], [rematore.id, 1], [squat.id, null]]);
    assert.deepEqual(dati.esercizi.slice(1, 3).map(e => [e.serieTarget, e.recuperoSecondi]), [[4, 0], [3, 120]]);
    // The list of plans has it too
    const lista = (await come('GET', '/schede')).corpo.dati;
    assert.deepEqual(righe(lista[0].esercizi), righe(dati.esercizi));
  });

  it('changed with the plan; a member left alone is no group', async () => {
    const scheda = await schedaConSuperset();
    const risposta = await come('PUT', `/schede/${scheda.id}`, {
      esercizi: [
        { esercizioId: panca.id, gruppo: 1 },
        { esercizioId: squat.id },
        { esercizioId: rematore.id, gruppo: 1 },
        { esercizioId: tapis.id, gruppo: 2 }
      ]
    });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(righe(risposta.corpo.dati.esercizi), [[panca.id, null], [squat.id, null], [rematore.id, null], [tapis.id, null]]);

    await come('PUT', `/schede/${scheda.id}`, {
      esercizi: [{ esercizioId: squat.id, gruppo: 3 }, { esercizioId: panca.id, gruppo: '3' }, { esercizioId: rematore.id, gruppo: 3 }]
    });
    assert.deepEqual(righe(await eserciziDi(scheda.id)), [[squat.id, 1], [panca.id, 1], [rematore.id, 1]]);
  });

  it('a group that is not a whole number from 1 is a 400, in the language of the request', async () => {
    for (const gruppo of [0, -2, 'A', 1.5, { x: 1 }]) {
      const risposta = await come('POST', '/schede', { titolo: 'X', esercizi: [{ esercizioId: panca.id, gruppo }] });
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Il gruppo del superset non è valido'], String(gruppo));
    }
    const inglese = await come('POST', '/schede', { titolo: 'X', esercizi: [{ esercizioId: panca.id, gruppo: 'A' }] }, utente, 'en');
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [400, 'The superset group is not valid']);
    const modifica = await come('PUT', `/schede/${(await creaScheda(utente, [panca])).id}`, { esercizi: [{ esercizioId: panca.id, gruppo: 0 }] });
    assert.equal(modifica.stato, 400);
    assert.equal(await prisma.schedaAllenamento.count({ where: { titolo: 'X' } }), 0);
  });

  it('a rest of 0 seconds stays 0, also when an exercise is added to a plan', async () => {
    const scheda = await creaScheda(utente, [panca]);
    const zero = await come('POST', `/schede/${scheda.id}/esercizi`, { esercizioId: rematore.id, recuperoSecondi: 0 });
    assert.deepEqual([zero.stato, zero.corpo.dati.recuperoSecondi, zero.corpo.dati.gruppo], [201, 0, null]);
    // Not sent: the default
    const predefinito = await come('POST', `/schede/${scheda.id}/esercizi`, { esercizioId: squat.id });
    assert.equal(predefinito.corpo.dati.recuperoSecondi, 90);

    const creata = await come('POST', '/schede', { titolo: 'Zero', esercizi: [{ esercizioId: panca.id, recuperoSecondi: 0 }] });
    assert.equal(creata.corpo.dati.esercizi[0].recuperoSecondi, 0);
  });

  it('plans from before the column have no groups', async () => {
    const vecchia = await creaScheda(utente, [panca, rematore]);
    const { dati } = (await come('GET', `/schede/${vecchia.id}`)).corpo;
    assert.deepEqual(righe(dati.esercizi), [[panca.id, null], [rematore.id, null]]);
  });

  it('the data export carries it', async () => {
    await schedaConSuperset();
    const { schede } = (await come('GET', '/utenti/esportazione')).corpo;
    assert.deepEqual(righe(schede[0].esercizi), [[tapis.id, null], [panca.id, 1], [rematore.id, 1], [squat.id, null]]);
  });
});

describe('the group in the copies of a plan', () => {
  it('cloning keeps it', async () => {
    const scheda = await schedaConSuperset();
    const risposta = await come('POST', `/schede/${scheda.id}/clona`);
    assert.equal(risposta.stato, 201);
    assert.deepEqual(righe(risposta.corpo.dati.esercizi), [[tapis.id, null], [panca.id, 1], [rematore.id, 1], [squat.id, null]]);
  });

  it('the personal trainer creates a plan with a superset, pause 0 included, and assigns it to a client', async () => {
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const cliente = await creaUtente();
    await prisma.iscrizionePT.create({ data: { utenteId: cliente.id, trainerId: trainer.id, stato: 'ATTIVA' } });

    const creata = await come('POST', '/pt/schede', {
      titolo: 'Circuito',
      esercizi: [
        { esercizioId: panca.id, recuperoSecondi: 0, gruppo: 4 },
        { esercizioId: rematore.id, recuperoSecondi: 0, gruppo: '4' },
        { esercizioId: squat.id, recuperoSecondi: 90, gruppo: 4 }
      ]
    }, trainer);
    assert.equal(creata.stato, 201);
    const originali = await eserciziDi(creata.corpo.dati.id);
    assert.deepEqual(originali.map(e => [e.esercizioId, e.gruppo, e.recuperoSecondi]),
      [[panca.id, 1, 0], [rematore.id, 1, 0], [squat.id, 1, 90]]);

    const sbagliata = await come('POST', '/pt/schede', { titolo: 'No', esercizi: [{ esercizioId: panca.id, gruppo: 0 }] }, trainer);
    assert.deepEqual([sbagliata.stato, sbagliata.corpo.messaggio], [400, 'Il gruppo del superset non è valido']);

    const assegnata = await come('POST', `/pt/clienti/${cliente.id}/assegna-scheda`, { schedaId: creata.corpo.dati.id }, trainer);
    assert.equal(assegnata.stato, 201);
    assert.deepEqual(righe(await eserciziDi(assegnata.corpo.dati.id)), [[panca.id, 1], [rematore.id, 1], [squat.id, 1]]);
  });
});

describe('the group of the logged sets', () => {
  async function avvia(scheda) {
    const risposta = await come('POST', '/sessioni', scheda ? { schedaId: scheda.id } : { libero: true });
    assert.equal(risposta.stato, 201);
    return risposta.corpo.dati;
  }
  const registra = (sessione, esercizio, n, altro = {}) =>
    come('POST', `/sessioni/${sessione.id}/serie`, { esercizioId: esercizio.id, serieNumero: n, pesoEffettivo: 50, repEffettive: 10, ...altro });

  it('taken from the plan by the server, not from the phone, and given back by the workout and the history', async () => {
    const scheda = await schedaConSuperset();
    const sessione = await avvia(scheda);
    const extra = await creaEsercizio();

    const a1 = await registra(sessione, panca, 1, { gruppo: 9 });
    assert.equal(a1.stato, 201);
    assert.equal(a1.corpo.dati.gruppo, 1);
    await registra(sessione, rematore, 1);
    await registra(sessione, panca, 2);
    const fuori = await registra(sessione, squat, 1, { gruppo: 1 });
    assert.equal(fuori.corpo.dati.gruppo, null);
    // An exercise added during the workout is not in the plan
    assert.equal((await registra(sessione, extra, 1)).corpo.dati.gruppo, null);

    const dettaglio = (await come('GET', `/sessioni/${sessione.id}`)).corpo.dati;
    assert.deepEqual(dettaglio.logSerie.map(l => [l.esercizioId, l.gruppo]).sort((x, y) => x[0] - y[0]),
      [[panca.id, 1], [panca.id, 1], [rematore.id, 1], [squat.id, null], [extra.id, null]].sort((x, y) => x[0] - y[0]));

    assert.equal((await come('PATCH', `/sessioni/${sessione.id}/completa`, {})).stato, 200);
    const [storico] = (await come('GET', '/sessioni/storico')).corpo.dati;
    const perEsercizio = Object.fromEntries(storico.esercizi.map(e => [e.esercizio.id, e.gruppo]));
    assert.deepEqual(perEsercizio, { [panca.id]: 1, [rematore.id]: 1, [squat.id]: null, [extra.id]: null });
  });

  it('the history keeps the group of that day after the plan changes', async () => {
    const scheda = await schedaConSuperset();
    const sessione = await avvia(scheda);
    await registra(sessione, panca, 1);
    await come('PUT', `/schede/${scheda.id}`, { esercizi: [{ esercizioId: panca.id }, { esercizioId: rematore.id }] });
    await registra(sessione, rematore, 1);
    const serie = await prisma.logSerie.findMany({ where: { sessioneId: sessione.id }, orderBy: { id: 'asc' } });
    assert.deepEqual(serie.map(l => l.gruppo), [1, null]);
  });

  it('a set sent twice by the queue keeps the group of the first', async () => {
    const sessione = await avvia(await schedaConSuperset());
    const idClient = 'serie-0001-abcd';
    const prima = await registra(sessione, panca, 1, { idClient });
    const seconda = await registra(sessione, panca, 1, { idClient });
    assert.deepEqual([prima.stato, seconda.stato, seconda.corpo.dati.id, seconda.corpo.dati.gruppo], [201, 200, prima.corpo.dati.id, 1]);
  });

  it('none in a free workout', async () => {
    await schedaConSuperset();
    const sessione = await avvia(null);
    assert.equal((await registra(sessione, panca, 1)).corpo.dati.gruppo, null);
  });

  it('a workout recreated from the phone (done without a network) gets the groups of its plan', async () => {
    const scheda = await schedaConSuperset();
    const risposta = await come('POST', '/sessioni/passata', {
      schedaId: scheda.id, dataInizio: giorniFa(1).toISOString(), durataMinuti: 40,
      serie: [
        { esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 60, repEffettive: 8, gruppo: 7 },
        { esercizioId: rematore.id, serieNumero: 1, pesoEffettivo: 50, repEffettive: 10 },
        { esercizioId: squat.id, serieNumero: 1, pesoEffettivo: 80, repEffettive: 5 }
      ]
    });
    assert.equal(risposta.stato, 201);
    const serie = await prisma.logSerie.findMany({ where: { sessioneId: risposta.corpo.dati.id }, orderBy: { id: 'asc' } });
    assert.deepEqual(serie.map(l => [l.esercizioId, l.gruppo]), [[panca.id, 1], [rematore.id, 1], [squat.id, null]]);
  });

  it('a set added from the history joins the superset of its exercise', async () => {
    const sessione = await avvia(await schedaConSuperset());
    const prima = (await registra(sessione, panca, 1)).corpo.dati;
    await come('PATCH', `/sessioni/${sessione.id}/completa`, {});
    const risposta = await come('PATCH', `/sessioni/${sessione.id}`, {
      serie: [{ id: prima.id }, { esercizioId: panca.id, pesoEffettivo: 55, repEffettive: 8 }]
    });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.esercizi.map(e => [e.esercizio.id, e.gruppo, e.serie.length]), [[panca.id, 1, 2]]);
    const serie = await prisma.logSerie.findMany({ where: { sessioneId: sessione.id } });
    assert.deepEqual(serie.map(l => l.gruppo), [1, 1]);
  });

  it('"save as plan" keeps the supersets done that day', async () => {
    const sessione = await avvia(await schedaConSuperset());
    for (const [esercizio, n] of [[panca, 1], [rematore, 1], [panca, 2], [rematore, 2], [squat, 1]]) await registra(sessione, esercizio, n);
    await come('PATCH', `/sessioni/${sessione.id}/completa`, {});
    const risposta = await come('POST', `/sessioni/${sessione.id}/scheda`, {});
    assert.equal(risposta.stato, 201);
    assert.deepEqual((await eserciziDi(risposta.corpo.dati.id)).map(e => [e.esercizioId, e.serieTarget, e.gruppo]),
      [[panca.id, 2, 1], [rematore.id, 2, 1], [squat.id, 1, null]]);
  });
});
