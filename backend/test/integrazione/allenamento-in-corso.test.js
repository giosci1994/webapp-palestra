// An open workout is resumed, not started over: starting another one asks
// first, the app can show the one in progress, and one the server closed
// because it was forgotten open can be resumed until the end of the day.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, MINUTO, GIORNO } from '../supporto/dati.js';
import { chiudiSessioniDimenticate } from '../../src/services/conclusioneSessione.service.js';

let server;
let utente;
let panca;
let push;
let gambe;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ lingua: 'it' });
  panca = await creaEsercizio({ nome: 'Panca piana' });
  push = await creaScheda(utente, [panca], { titolo: 'Push' });
  gambe = await creaScheda(utente, [panca], { titolo: 'Gambe' });
});

const minutiFa = n => new Date(Date.now() - n * MINUTO);
/** An open workout started `inizio` minutes ago, with sets logged that many minutes ago */
const aperto = (inizio, serie = [], chi = utente, scheda = push) => creaSessione(chi, scheda, {
  inizio: minutiFa(inizio),
  conclusa: false,
  serie: serie.map(([n, tipo = 'LAVORO']) => ({ esercizio: panca, peso: 80, rep: 8, tipo, registrataIl: minutiFa(n) }))
});
const leggi = s => prisma.sessioneAllenamento.findUnique({ where: { id: s.id } });
const avvia = (corpo, opzioni = {}) => server.richiesta('POST', '/sessioni', { token: tokenPer(utente), corpo, ...opzioni });

describe('starting a workout with another one open', () => {
  it('asks first: 409 with the open workout, and nothing is started', async () => {
    const vecchio = await aperto(30, [[25, 'RISCALDAMENTO'], [20], [10]]);
    const risposta = await avvia({ schedaId: gambe.id });
    assert.equal(risposta.stato, 409);
    assert.equal(risposta.corpo.codice, 'ALLENAMENTO_IN_CORSO');
    assert.equal(risposta.corpo.messaggio, 'Hai già un allenamento in corso');
    // The completed working sets: the warm-up does not count
    assert.deepEqual(risposta.corpo.dettagli.sessione, {
      id: vecchio.id, dataInizio: vecchio.dataInizio.toISOString(), scheda: { id: push.id, titolo: 'Push' }, serie: 2
    });
    assert.equal(await prisma.sessioneAllenamento.count(), 1);

    // Only true closes it: anything else asks again
    assert.equal((await avvia({ schedaId: gambe.id, chiudiAperte: 'true' })).stato, 409);
  });

  it('in the language of the app', async () => {
    await aperto(30, [[10]]);
    const risposta = await avvia({ schedaId: gambe.id }, { lingua: 'en' });
    assert.equal(risposta.corpo.messaggio, 'You already have a workout in progress');
  });

  it('"close it and start the new one": the open one ends, the new one starts', async () => {
    const recente = await aperto(40, [[30], [5]]);
    const risposta = await avvia({ schedaId: gambe.id, chiudiAperte: true });
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.schedaId, gambe.id);

    const chiuso = await leggi(recente);
    assert.ok(chiuso.dataFine);
    assert.equal(chiuso.volumeTotaleKg, 2 * 80 * 8);
    assert.equal(chiuso.chiusaAutomaticamente, false);
    assert.deepEqual((await prisma.recordPersonale.findMany()).map(r => r.pesoMaxRaggiunto), [80]);
  });

  it('one left idle for hours ends at its last set', async () => {
    const dimenticato = await aperto(300, [[290], [240]]);
    assert.equal((await avvia({ schedaId: gambe.id, chiudiAperte: true })).stato, 201);
    const chiuso = await leggi(dimenticato);
    const ultimaSerie = await prisma.logSerie.findFirst({ where: { sessioneId: dimenticato.id }, orderBy: { registrataIl: 'desc' } });
    assert.deepEqual([chiuso.dataFine, chiuso.durataMinuti], [ultimaSerie.registrataIl, 60]);
  });

  it('one without sets was not a workout: it is deleted; several open ones all go', async () => {
    const vuoto = await aperto(10);
    const conSerie = await aperto(50, [[45]], utente, gambe);
    assert.equal((await avvia({ schedaId: push.id, chiudiAperte: true })).stato, 201);
    assert.equal(await leggi(vuoto), null);
    assert.ok((await leggi(conSerie)).dataFine);
    assert.equal(await prisma.sessioneAllenamento.count({ where: { dataFine: null } }), 1);
  });

  it("someone else's open workout, or a finished one, does not count", async () => {
    const altro = await creaUtente();
    await aperto(10, [[5]], altro, await creaScheda(altro, [panca]));
    await creaSessione(utente, push, { inizio: minutiFa(90), durataMinuti: 60 });
    assert.equal((await avvia({ schedaId: gambe.id })).stato, 201);
  });

  it('the plan is checked first: a missing one is 404 even with a workout open', async () => {
    await aperto(10, [[5]]);
    assert.equal((await avvia({ schedaId: 99999 })).stato, 404);
  });
});

describe('the workout in progress', () => {
  const inCorso = (chi = utente) => server.richiesta('GET', '/sessioni/in-corso', { token: tokenPer(chi) });

  it('nothing when there is none', async () => {
    await creaSessione(utente, push, { inizio: minutiFa(90) });
    const risposta = await inCorso();
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati, null);
  });

  it('the most recent open one, with its plan and the sets done; only yours', async () => {
    await aperto(200, [[190]]);
    const ultimo = await aperto(20, [[15], [10], [5, 'RISCALDAMENTO']], utente, gambe);
    const altro = await creaUtente();
    await aperto(5, [[1]], altro, await creaScheda(altro, [panca]));

    assert.deepEqual((await inCorso()).corpo.dati, {
      id: ultimo.id, dataInizio: ultimo.dataInizio.toISOString(), scheda: { id: gambe.id, titolo: 'Gambe' }, serie: 2
    });
  });
});

describe('resuming a workout closed because it was forgotten', () => {
  // A time zone where it is around midday now: a workout of this morning,
  // forgotten for three hours, is still from today
  const scarto = 12 - new Date().getUTCHours();
  const FUSO = scarto === 0 ? 'UTC' : `Etc/GMT${scarto > 0 ? '-' : '+'}${Math.abs(scarto)}`;
  const chiedi = (metodo, percorso) => server.richiesta(metodo, percorso, { token: tokenPer(utente), fuso: FUSO, corpo: metodo === 'GET' ? undefined : {} });

  beforeEach(async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { fusoOrario: FUSO } });
  });

  it('can be resumed until the end of the day, and then is not closed again right away', async () => {
    const dimenticato = await aperto(240, [[230], [180]]);
    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 1, eliminate: 0 });
    const chiuso = await leggi(dimenticato);
    assert.equal(chiuso.chiusaAutomaticamente, true);

    // The history offers it until the next local midnight
    const [voce] = (await chiedi('GET', '/sessioni/storico')).corpo.dati;
    assert.equal(voce.chiusaAutomaticamente, true);
    const finoA = new Date(voce.riapribileFinoA);
    assert.ok(finoA - Date.now() > 9 * 60 * MINUTO && finoA - Date.now() < 15 * 60 * MINUTO, voce.riapribileFinoA);
    const ora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(finoA);
    assert.equal(ora, '00:00');

    // Three hours after its last set, it is resumed
    assert.equal((await chiedi('PATCH', `/sessioni/${dimenticato.id}/riapri`)).stato, 200);
    const ripreso = await leggi(dimenticato);
    assert.deepEqual([ripreso.dataFine, ripreso.chiusaAutomaticamente], [null, false]);
    assert.ok(Date.now() - ripreso.riapertaIl < 5000);

    // Resuming counts as activity: an hour later it is still open
    assert.deepEqual(await chiudiSessioniDimenticate(null, new Date(Date.now() + 60 * MINUTO)), { chiuse: 0, eliminate: 0 });
    // Forgotten again, it ends at its last set, not when it was resumed
    assert.deepEqual(await chiudiSessioniDimenticate(null, new Date(Date.now() + 130 * MINUTO)), { chiuse: 1, eliminate: 0 });
    const richiuso = await leggi(dimenticato);
    assert.equal(richiuso.durataMinuti, 60);
    assert.equal(richiuso.chiusaAutomaticamente, true);
  });

  it('not the day after', async () => {
    const ieri = await creaSessione(utente, push, { inizio: new Date(Date.now() - GIORNO - 120 * MINUTO), durataMinuti: 60 });
    await prisma.sessioneAllenamento.update({ where: { id: ieri.id }, data: { chiusaAutomaticamente: true } });
    const risposta = await chiedi('PATCH', `/sessioni/${ieri.id}/riapri`);
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Un allenamento chiuso in automatico si può riprendere solo entro la giornata');
  });

  it('one closed with "Termina" keeps the half hour', async () => {
    const finito = await creaSessione(utente, push, { inizio: minutiFa(100), durataMinuti: 60 });
    const [voce] = (await chiedi('GET', '/sessioni/storico')).corpo.dati;
    assert.equal(voce.chiusaAutomaticamente, false);
    assert.equal(new Date(voce.riapribileFinoA).getTime(), new Date(finito.dataFine).getTime() + 30 * MINUTO);
    assert.equal((await chiedi('PATCH', `/sessioni/${finito.id}/riapri`)).stato, 400);
  });
});
