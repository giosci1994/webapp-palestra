// Admin → Allenamenti da controllare: the list with its reasons, marking
// as checked, merging into a free workout, and the owner told when an admin
// corrects, closes or deletes their workout.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, giorniFa, MINUTO } from '../supporto/dati.js';

let server;
let admin;
let utente;
let panca;
let squat;
let push;
let gambe;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
  utente = await creaUtente({ nome: 'Giulia', lingua: 'it' });
  panca = await creaEsercizio({ nome: 'Panca piana' });
  squat = await creaEsercizio({ nome: 'Squat', gruppoMuscoloPrimario: 'Quadricipiti' });
  push = await creaScheda(utente, [panca], { titolo: 'Push' });
  gambe = await creaScheda(utente, [squat], { titolo: 'Gambe' });
});

const comeAdmin = (metodo, percorso, corpo) => server.richiesta(metodo, percorso, { token: tokenPer(admin), corpo });
const minutiFa = n => new Date(Date.now() - n * MINUTO);
const serie = (esercizio, n, minuti) => Array.from({ length: n }, (_, i) => ({ esercizio, peso: 60, rep: 10, registrataIl: minutiFa(minuti - i) }));
const elenco = async () => (await comeAdmin('GET', '/admin/allenamenti')).corpo.dati;
const notificheDi = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id }, orderBy: { id: 'asc' } });

describe('the list of workouts to check', () => {
  it('only the admin', async () => {
    assert.equal((await server.richiesta('GET', '/admin/allenamenti', { token: tokenPer(utente) })).stato, 403);
    assert.equal((await server.richiesta('POST', '/admin/allenamenti/unisci', { token: tokenPer(utente), corpo: { ids: [1, 2] } })).stato, 403);
  });

  it('open, overlapping, closed by the server, too long, without sets; a normal one is not there', async () => {
    // This morning: Push left at the third set, then Gambe started on top of it
    const primo = await creaSessione(utente, push, { inizio: minutiFa(60), conclusa: false, serie: serie(panca, 3, 55) });
    const secondo = await creaSessione(utente, gambe, { inizio: minutiFa(30), conclusa: false, serie: serie(squat, 2, 25) });
    const automatico = await creaSessione(utente, push, { inizio: giorniFa(3), durataMinuti: 50, serie: serie(panca, 3, 4000) });
    await prisma.sessioneAllenamento.update({ where: { id: automatico.id }, data: { chiusaAutomaticamente: true } });
    const lungo = await creaSessione(utente, push, { inizio: giorniFa(5), durataMinuti: 300, serie: serie(panca, 3, 7000) });
    const vuoto = await creaSessione(utente, push, { inizio: giorniFa(6), durataMinuti: 2 });
    await creaSessione(utente, push, { inizio: giorniFa(7), durataMinuti: 60, serie: serie(panca, 3, 10000) });

    const voci = await elenco();
    const motivi = Object.fromEntries(voci.map(v => [v.id, v.motivi]));
    assert.deepEqual(motivi, {
      [secondo.id]: ['APERTO', 'SOVRAPPOSTO'],
      [primo.id]: ['APERTO', 'SOVRAPPOSTO'],
      [automatico.id]: ['CHIUSO_IN_AUTOMATICO'],
      [lungo.id]: ['DURATA_SOSPETTA'],
      [vuoto.id]: ['SENZA_SERIE']
    });
    const voce = voci.find(v => v.id === primo.id);
    assert.deepEqual([voce.utente.nome, voce.titolo, voce.serieCompletate], ['Giulia', 'Push', 3]);
  });

  it('marked as checked it leaves the list; an open one stays until it is closed', async () => {
    const lungo = await creaSessione(utente, push, { inizio: giorniFa(5), durataMinuti: 300 });
    const aperto = await creaSessione(utente, push, { inizio: minutiFa(10), conclusa: false });
    for (const s of [lungo, aperto]) assert.equal((await comeAdmin('PATCH', `/admin/allenamenti/${s.id}/controllato`, {})).stato, 200);
    assert.deepEqual((await elenco()).map(v => v.id), [aperto.id]);
    assert.equal((await comeAdmin('PATCH', '/admin/allenamenti/99999/controllato', {})).stato, 404);
  });
});

describe('merging workouts', () => {
  it('two workouts of this morning become one free workout, with all the sets', async () => {
    const primo = await creaSessione(utente, push, { inizio: minutiFa(60), conclusa: false, serie: serie(panca, 3, 55) });
    const secondo = await creaSessione(utente, gambe, { inizio: minutiFa(30), conclusa: false, serie: [...serie(squat, 2, 25), ...serie(panca, 1, 20)] });
    const piano = await prisma.allenamentoPianificato.create({ data: { utenteId: utente.id, schedaId: gambe.id, data: new Date(), stato: 'COMPLETATO', sessioneId: secondo.id } });

    const risposta = await comeAdmin('POST', '/admin/allenamenti/unisci', { ids: [secondo.id, primo.id] });
    assert.equal(risposta.stato, 200);
    const unito = risposta.corpo.dati;
    assert.equal(unito.id, primo.id);
    assert.deepEqual([unito.scheda, unito.titolo, unito.serieCompletate], [null, 'Push + Gambe', 6]);
    assert.equal(await prisma.sessioneAllenamento.findUnique({ where: { id: secondo.id } }), null);

    const salvato = await prisma.sessioneAllenamento.findUnique({ where: { id: primo.id }, include: { logSerie: { orderBy: { id: 'asc' } } } });
    assert.ok(salvato.dataFine && salvato.controllataIl);
    assert.equal(salvato.volumeTotaleKg, 6 * 60 * 10);
    // The bench press of the second workout comes after the three of the first
    assert.deepEqual(salvato.logSerie.filter(s => s.esercizioId === panca.id).map(s => s.serieNumero), [1, 2, 3, 4]);
    assert.equal((await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } })).sessioneId, null);
    // Out of the list
    assert.deepEqual(await elenco(), []);

    const [notifica] = await notificheDi(utente);
    assert.equal(notifica.messaggio, "L'amministratore ha unito 2 tuoi allenamenti in uno solo: «Push + Gambe»");
    assert.equal(notifica.percorso, '/storico');
  });

  it('only workouts of the same user, at least two, that exist', async () => {
    const mio = await creaSessione(utente, push, { inizio: giorniFa(2) });
    const altro = await creaUtente();
    const suo = await creaSessione(altro, await creaScheda(altro, [panca]), { inizio: giorniFa(2) });
    const prova = async (ids, stato) => assert.equal((await comeAdmin('POST', '/admin/allenamenti/unisci', { ids })).stato, stato, JSON.stringify(ids));
    await prova([mio.id, suo.id], 400);
    await prova([mio.id], 400);
    await prova([mio.id, mio.id], 400);
    await prova(['1', '2'], 400);
    await prova([mio.id, 99999], 404);
    assert.equal(await prisma.sessioneAllenamento.count(), 2);
  });
});

describe('the owner is told', () => {
  it('when an admin corrects, closes or deletes their workout; not for their own', async () => {
    const finito = await creaSessione(utente, push, { inizio: giorniFa(2), durataMinuti: 60, serie: serie(panca, 1, 3000) });
    const aperto = await creaSessione(utente, gambe, { inizio: minutiFa(30), conclusa: false, serie: serie(squat, 1, 20) });

    assert.equal((await comeAdmin('PATCH', `/sessioni/${finito.id}`, { noteFinali: 'Corretto' })).stato, 200);
    assert.equal((await comeAdmin('PATCH', `/sessioni/${aperto.id}/completa`, {})).stato, 200);
    assert.equal((await comeAdmin('DELETE', `/sessioni/${finito.id}`)).stato, 200);
    assert.deepEqual((await notificheDi(utente)).map(n => n.messaggio), [
      "L'amministratore ha corretto il tuo allenamento «Push»",
      "L'amministratore ha chiuso il tuo allenamento «Gambe», che era rimasto aperto",
      "L'amministratore ha eliminato il tuo allenamento «Push»"
    ]);

    const mio = await creaSessione(admin, await creaScheda(admin, [panca]), { inizio: giorniFa(1) });
    await comeAdmin('DELETE', `/sessioni/${mio.id}`);
    assert.equal((await notificheDi(admin)).length, 0);
  });
});
