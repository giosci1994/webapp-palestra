// "Termina" asks what time you finished: the end the user picks counts,
// instead of the server's estimate, kept between the start of the workout
// and the moment "Termina" was tapped.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, MINUTO } from '../supporto/dati.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ lingua: 'it' });
  panca = await creaEsercizio({ nome: 'Panca piana' });
  scheda = await creaScheda(utente, [panca], { titolo: 'Push' });
});

const minutiFa = n => new Date(Date.now() - n * MINUTO);
/** Open since `inizio` minutes ago, with one set `serie` minutes ago */
const aperto = (inizio, serie) => creaSessione(utente, scheda, {
  inizio: minutiFa(inizio), conclusa: false,
  serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(serie) }]
});
const termina = (sessione, corpo) =>
  server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, { token: tokenPer(utente), corpo });
const leggi = s => prisma.sessioneAllenamento.findUnique({ where: { id: s.id } });

describe('"Termina" with the end the user picked', () => {
  it('ends the workout at that time', async () => {
    const sessione = await aperto(120, 50);
    const fine = minutiFa(45);
    const risposta = await termina(sessione, { fine: fine.toISOString() });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dimenticata, false);

    const chiusa = await leggi(sessione);
    assert.equal(chiusa.dataFine.getTime(), fine.getTime());
    assert.equal(chiusa.durataMinuti, 75);
    // The record belongs to the end of the workout
    const [record] = await prisma.recordPersonale.findMany();
    assert.equal(record.dataRecord.getTime(), fine.getTime());
  });

  it('counts even hours after the last set: the user knows when they stopped', async () => {
    const sessione = await aperto(400, 300);
    const fine = minutiFa(250);
    await termina(sessione, { fine: fine.toISOString() });
    assert.equal((await leggi(sessione)).dataFine.getTime(), fine.getTime());
  });

  it('not before the start', async () => {
    const sessione = await aperto(60, 30);
    await termina(sessione, { fine: minutiFa(90).toISOString() });
    const chiusa = await leggi(sessione);
    assert.deepEqual([chiusa.dataFine.getTime(), chiusa.durataMinuti], [chiusa.dataInizio.getTime(), 0]);
  });

  it('not after the moment "Termina" was tapped', async () => {
    // Tapped without a network 20 minutes ago, with an end after the tap
    const sessione = await aperto(60, 25);
    const tocco = minutiFa(20);
    await termina(sessione, { conclusaIl: tocco.toISOString(), fine: minutiFa(5).toISOString() });
    assert.equal((await leggi(sessione)).dataFine.getTime(), tocco.getTime());

    // And not in the future
    const futuro = await aperto(30, 5);
    const prima = Date.now();
    await termina(futuro, { fine: new Date(Date.now() + 60 * MINUTO).toISOString() });
    const fine = (await leggi(futuro)).dataFine.getTime();
    assert.ok(fine >= prima && fine <= Date.now(), new Date(fine).toISOString());
  });

  it('not a time: 400, and the workout stays open', async () => {
    const sessione = await aperto(60, 10);
    for (const fine of ['ieri', {}, true]) {
      assert.equal((await termina(sessione, { fine })).stato, 400, JSON.stringify(fine));
    }
    assert.equal((await leggi(sessione)).dataFine, null);
  });

  it('without it nothing changes: a workout left idle for hours ends at its last set', async () => {
    const sessione = await aperto(400, 300);
    const risposta = await termina(sessione, {});
    assert.equal(risposta.corpo.dimenticata, true);
    assert.equal((await leggi(sessione)).durataMinuti, 100);
  });
});
