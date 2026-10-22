// Free workouts: a workout without a plan. Deleting a plan keeps the workouts
// done with it, as free workouts with its name, and a free workout works
// everywhere a workout does.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, giorniFa, MINUTO } from '../supporto/dati.js';
import { chiudiSessioniDimenticate } from '../../src/services/conclusioneSessione.service.js';
import { giornoLocale } from '../../src/utils/date.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ lingua: 'it' });
  panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
  scheda = await creaScheda(utente, [panca], { titolo: 'Push' });
});

const chiedi = (metodo, percorso, corpo, chi = utente) => server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo });
const leggi = s => prisma.sessioneAllenamento.findUnique({ where: { id: s.id } });
/** A finished workout on the plan, with three sets at 80 kg */
const fatto = (inizio = giorniFa(2), conScheda = scheda, chi = utente) => creaSessione(chi, conScheda, {
  inizio, serie: [1, 2, 3].map(() => ({ esercizio: panca, peso: 80, rep: 8 }))
});
/** A free workout, finished, with its name */
async function libero(titolo = null, inizio = giorniFa(2)) {
  const sessione = await fatto(inizio, { id: null });
  return prisma.sessioneAllenamento.update({ where: { id: sessione.id }, data: { titolo } });
}

describe('deleting a plan', () => {
  it('keeps the workouts done with it: free workouts with its name, statistics unchanged', async () => {
    const primo = await fatto(giorniFa(3));
    await fatto(giorniFa(1));
    await prisma.recordPersonale.create({ data: { utenteId: utente.id, esercizioId: panca.id, pesoMaxRaggiunto: 80 } });
    await prisma.allenamentoPianificato.create({ data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(giorniFa(-1)) } });
    const prima = (await chiedi('GET', '/statistiche/riepilogo')).corpo.dati;

    const risposta = await chiedi('DELETE', `/schede/${scheda.id}`);
    assert.equal(risposta.stato, 200);

    assert.equal(await prisma.schedaAllenamento.count(), 0);
    assert.equal(await prisma.esercizioScheda.count(), 0);
    // The calendar entries of the plan go with it
    assert.equal(await prisma.allenamentoPianificato.count(), 0);
    const rimasto = await leggi(primo);
    assert.deepEqual([rimasto.schedaId, rimasto.titolo], [null, 'Push']);
    assert.equal(await prisma.logSerie.count(), 6);
    assert.deepEqual((await chiedi('GET', '/statistiche/riepilogo')).corpo.dati, { ...prima, schedeCreate: 0 });

    const storico = (await chiedi('GET', '/sessioni/storico')).corpo.dati;
    assert.deepEqual(storico.map(s => [s.scheda, s.titolo, s.serieCompletate]), [[null, 'Push', 3], [null, 'Push', 3]]);
  });

  it("an admin deleting a global plan keeps other people's workouts too", async () => {
    const globale = await creaScheda(utente, [panca], { titolo: 'Full body', visibilita: 'GLOBALE' });
    const altro = await creaUtente();
    const suo = await fatto(giorniFa(1), globale, altro);
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });
    assert.equal((await chiedi('DELETE', `/schede/${globale.id}`, undefined, admin)).stato, 200);
    assert.deepEqual([(await leggi(suo)).schedaId, (await leggi(suo)).titolo], [null, 'Full body']);
  });

  it('a workout still open on it is closed first; an empty one is deleted', async () => {
    const aperto = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 30 * MINUTO), conclusa: false, serie: [{ esercizio: panca, peso: 80, rep: 8 }]
    });
    const vuoto = await creaSessione(await creaUtente(), scheda, { inizio: new Date(Date.now() - 5 * MINUTO), conclusa: false });
    assert.equal((await chiedi('DELETE', `/schede/${scheda.id}`)).stato, 200);

    const chiuso = await leggi(aperto);
    assert.ok(chiuso.dataFine);
    assert.deepEqual([chiuso.schedaId, chiuso.titolo, chiuso.volumeTotaleKg], [null, 'Push', 640]);
    assert.equal(await leggi(vuoto), null);
  });

  it('a trainer removing a plan the client trained with: the client keeps the workouts', async () => {
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await prisma.iscrizionePT.create({ data: { utenteId: utente.id, trainerId: trainer.id, stato: 'ATTIVA' } });
    const assegnata = await creaScheda(utente, [panca], { titolo: 'Forza (da PT)', assegnataDaPTId: trainer.id });
    const allenamento = await fatto(giorniFa(1), assegnata);

    const risposta = await chiedi('DELETE', `/pt/clienti/${utente.id}/schede/${assegnata.id}`, undefined, trainer);
    assert.equal(risposta.stato, 200);
    assert.deepEqual([(await leggi(allenamento)).schedaId, (await leggi(allenamento)).titolo], [null, 'Forza (da PT)']);
  });
});

describe('a free workout', () => {
  it('shows with its name, or "Allenamento libero" in the language of the app', async () => {
    await libero('Push + Gambe', giorniFa(2));
    await libero(null, giorniFa(1));

    const it = (await chiedi('GET', '/sessioni/storico')).corpo.dati;
    assert.deepEqual(it.map(s => s.titolo), ['Allenamento libero', 'Push + Gambe']);
    const en = (await server.richiesta('GET', '/sessioni/storico', { token: tokenPer(utente), lingua: 'en' })).corpo.dati;
    assert.equal(en[0].titolo, 'Free workout');

    // The dashboard list has the raw fields: no plan, and the name
    const lista = (await chiedi('GET', '/sessioni')).corpo.dati;
    assert.deepEqual(lista.map(s => [s.scheda, s.titolo]), [[null, null], [null, 'Push + Gambe']]);
  });

  it('counts in the statistics like any other', async () => {
    await libero('Push + Gambe', giorniFa(1));
    assert.equal((await chiedi('GET', '/statistiche/riepilogo')).corpo.dati.totaleSessioni, 1);
    const { gruppi } = (await chiedi('GET', '/statistiche/muscoli?giorni=30')).corpo.dati;
    assert.equal(gruppi.find(g => g.nome === 'Petto').seriePeriodo, 3);
  });

  it('cannot be resumed, but can be corrected, moved to another day, saved as a plan and deleted', async () => {
    const sessione = await libero('Push + Gambe', new Date(Date.now() - 70 * MINUTO));

    const riprendi = await chiedi('PATCH', `/sessioni/${sessione.id}/riapri`);
    assert.equal(riprendi.stato, 400);
    assert.equal(riprendi.corpo.messaggio, 'Un allenamento libero non si riprende: puoi correggerlo dallo Storico');

    const corretto = await chiedi('PATCH', `/sessioni/${sessione.id}`, { dataInizio: giorniFa(3).toISOString(), noteFinali: 'Unito' });
    assert.equal(corretto.stato, 200);
    assert.deepEqual([corretto.corpo.dati.titolo, corretto.corpo.dati.noteFinali], ['Push + Gambe', 'Unito']);

    const salvata = await chiedi('POST', `/sessioni/${sessione.id}/scheda`, {});
    assert.equal(salvata.stato, 201);
    assert.match(salvata.corpo.dati.titolo, /^Push \+ Gambe \(/);
    const nuova = await prisma.schedaAllenamento.findUnique({ where: { id: salvata.corpo.dati.id }, include: { esercizi: true } });
    assert.equal(nuova.livello, 'BASE');
    assert.deepEqual(nuova.esercizi.map(e => [e.esercizioId, e.serieTarget]), [[panca.id, 3]]);

    assert.equal((await chiedi('DELETE', `/sessioni/${sessione.id}`)).stato, 200);
    assert.equal(await leggi(sessione), null);
  });

  it('left open, the server closes it like the others', async () => {
    const aperto = await creaSessione(utente, { id: null }, {
      inizio: new Date(Date.now() - 300 * MINUTO), conclusa: false,
      serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: new Date(Date.now() - 280 * MINUTO) }]
    });
    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 1, eliminate: 0 });
    assert.equal((await leggi(aperto)).durataMinuti, 20);
    const [notifica] = await prisma.allenamentoNotifica.findMany({ where: { utenteId: utente.id } });
    assert.match(notifica.messaggio, /Allenamento libero/);
  });
});
