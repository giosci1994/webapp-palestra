// The admin area: who gets in, temporary passwords, gyms, exercises,
// equipment, the banner and the "what's new" stories. Suggestions are in
// suggerimenti.test.js, exercises created with the full form in
// esercizi-creati.test.js.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, tokenPer } from '../supporto/dati.js';

// The banner is a file of the repository: the test puts it back as it was
const FILE_BANNER = path.resolve('prisma/dati/banner.json');
const bannerOriginale = fs.readFileSync(FILE_BANNER, 'utf8');

let server;
let admin;

before(async () => { server = await avviaServer(); });
after(async () => {
  fs.writeFileSync(FILE_BANNER, bannerOriginale, 'utf8');
  await server.chiudi();
});
beforeEach(async () => {
  await svuotaDatabase();
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
});

const comeAdmin = (metodo, percorso, corpo) => server.richiesta(metodo, percorso, { token: tokenPer(admin), corpo });

describe('who gets in', () => {
  it('only the admin: not a user, not a trainer, not without signing in', async () => {
    const utente = await creaUtente();
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const palestra = await prisma.palestra.create({ data: { nomeCatena: 'P', citta: 'C', indirizzo: 'I' } });
    const rotte = [
      ['PUT', `/admin/utenti/${utente.id}/reset-password`], ['POST', '/admin/palestre'], ['PUT', `/admin/palestre/${palestra.id}`],
      ['DELETE', `/admin/palestre/${palestra.id}`], ['POST', '/admin/attrezzature'], ['PUT', '/admin/banner'],
      ['GET', '/admin/novita'], ['POST', '/admin/novita']
    ];
    for (const [metodo, percorso] of rotte) {
      const corpo = metodo === 'GET' || metodo === 'DELETE' ? undefined : { nomeCatena: 'X', titolo: 'X', visibile: true, testo: 'X' };
      assert.equal((await server.richiesta(metodo, percorso, { corpo })).stato, 401, `${metodo} ${percorso}`);
      for (const chi of [utente, trainer]) {
        assert.equal((await server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo })).stato, 403, `${metodo} ${percorso}`);
      }
    }
    assert.equal((await prisma.palestra.findUnique({ where: { id: palestra.id } })).nomeCatena, 'P');
    assert.equal(fs.readFileSync(FILE_BANNER, 'utf8'), bannerOriginale);
  });
});

describe('temporary password', () => {
  it('replaces the old one, and the user signs in with it', async () => {
    const utente = await creaUtente({ password: 'vecchia-password' });
    const risposta = await comeAdmin('PUT', `/admin/utenti/${utente.id}/reset-password`, {});
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Password resettata');
    const { passwordTemporanea } = risposta.corpo.dati;
    assert.match(passwordTemporanea, /^[\w-]{12}$/);

    const accesso = password => server.richiesta('POST', '/auth/login', { corpo: { email: utente.email, password } });
    assert.equal((await accesso(passwordTemporanea)).stato, 200);
    assert.equal((await accesso('vecchia-password')).stato, 401);
  });

  it('for a user who does not exist: 404', async () => {
    assert.equal((await comeAdmin('PUT', '/admin/utenti/99999/reset-password', {})).stato, 404);
  });
});

describe('gyms', () => {
  it('created, in Italy unless said otherwise', async () => {
    const risposta = await comeAdmin('POST', '/admin/palestre', { nomeCatena: 'FitClub', citta: 'Roma', indirizzo: 'Via 1' });
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.nazione, 'Italia');
    assert.equal(risposta.corpo.dati.googlePlaceId, null);

    const estera = await comeAdmin('POST', '/admin/palestre', {
      nomeCatena: 'Gym', citta: 'Aarhus', indirizzo: 'Vej 2', nazione: 'Danimarca', googlePlaceId: 'ChIJ123'
    });
    assert.deepEqual([estera.corpo.dati.nazione, estera.corpo.dati.googlePlaceId], ['Danimarca', 'ChIJ123']);
  });

  it('updated only in the fields sent; an empty Google id is removed', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/palestre', {
      nomeCatena: 'FitClub', citta: 'Roma', indirizzo: 'Via 1', googlePlaceId: 'ChIJ123'
    })).corpo;
    const risposta = await comeAdmin('PUT', `/admin/palestre/${dati.id}`, { citta: 'Milano' });
    assert.equal(risposta.stato, 200);
    assert.deepEqual([risposta.corpo.dati.nomeCatena, risposta.corpo.dati.citta, risposta.corpo.dati.googlePlaceId], ['FitClub', 'Milano', 'ChIJ123']);

    const senzaId = await comeAdmin('PUT', `/admin/palestre/${dati.id}`, { googlePlaceId: '' });
    assert.equal(senzaId.corpo.dati.googlePlaceId, null);
    assert.equal((await comeAdmin('PUT', '/admin/palestre/99999', { citta: 'X' })).stato, 404);
  });

  it('deleted; a missing one is 404', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/palestre', { nomeCatena: 'FitClub', citta: 'Roma', indirizzo: 'Via 1' })).corpo;
    const risposta = await comeAdmin('DELETE', `/admin/palestre/${dati.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Palestra eliminata');
    assert.equal(await prisma.palestra.count(), 0);
    assert.equal((await comeAdmin('DELETE', `/admin/palestre/${dati.id}`)).stato, 404);
  });
});

describe('exercises and equipment', () => {
  it('an exercise is deleted; a missing one is 404', async () => {
    const esercizio = await creaEsercizio();
    const risposta = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Esercizio eliminato');
    assert.equal(await prisma.esercizio.count(), 0);
    assert.equal((await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`)).stato, 404);
  });

  it('a piece of equipment is created, with or without its target muscles', async () => {
    const risposta = await comeAdmin('POST', '/admin/attrezzature', { nome: 'Leg press', categoria: 'MACCHINE' });
    assert.equal(risposta.stato, 201);
    assert.deepEqual([risposta.corpo.dati.nome, risposta.corpo.dati.categoria, risposta.corpo.dati.muscoliBersaglio], ['Leg press', 'MACCHINE', null]);
    const conMuscoli = await comeAdmin('POST', '/admin/attrezzature', { nome: 'Lat machine', categoria: 'MACCHINE', muscoliBersaglio: 'Dorsali' });
    assert.equal(conMuscoli.corpo.dati.muscoliBersaglio, 'Dorsali');
  });
});

describe('banner', () => {
  it('the admin writes it, and everyone reads it', async () => {
    const risposta = await comeAdmin('PUT', '/admin/banner', { visibile: 1, testo: 'Palestra chiusa a Natale' });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati, { visibile: true, testo: 'Palestra chiusa a Natale' });
    assert.deepEqual((await server.richiesta('GET', '/banner')).corpo.dati, { visibile: true, testo: 'Palestra chiusa a Natale' });

    await comeAdmin('PUT', '/admin/banner', {});
    assert.deepEqual((await server.richiesta('GET', '/banner')).corpo.dati, { visibile: false, testo: '' });
  });
});

describe("\"what's new\" stories", () => {
  it('need a title', async () => {
    const risposta = await comeAdmin('POST', '/admin/novita', { sottotitolo: 'Senza titolo' });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Titolo obbligatorio');
    assert.equal(await prisma.novita.count(), 0);
  });

  it('created active unless said otherwise, the points saved as JSON', async () => {
    const punti = [{ icona: '⏱️', testo: 'Recupero finito' }];
    const risposta = await comeAdmin('POST', '/admin/novita', { titolo: 'Notifiche', punti, ordine: '2', ctaRotta: '/profilo' });
    assert.equal(risposta.stato, 201);
    const n = risposta.corpo.dati;
    assert.deepEqual([n.titolo, n.attiva, n.ordine, n.ctaRotta, n.sottotitolo], ['Notifiche', true, 2, '/profilo', null]);
    assert.deepEqual(JSON.parse(n.punti), punti);

    const spenta = await comeAdmin('POST', '/admin/novita', { titolo: 'Spenta', attiva: false, punti: '[]' });
    assert.deepEqual([spenta.corpo.dati.attiva, spenta.corpo.dati.ordine, spenta.corpo.dati.punti], [false, 0, '[]']);
  });

  it('the admin sees them all, inactive ones too, by order', async () => {
    await comeAdmin('POST', '/admin/novita', { titolo: 'Seconda', ordine: 2 });
    await comeAdmin('POST', '/admin/novita', { titolo: 'Spenta', ordine: 1, attiva: false });
    await comeAdmin('POST', '/admin/novita', { titolo: 'Prima', ordine: 0 });
    const risposta = await comeAdmin('GET', '/admin/novita');
    assert.deepEqual(risposta.corpo.dati.map(n => n.titolo), ['Prima', 'Spenta', 'Seconda']);
  });

  it('updated only in the fields sent', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/novita', {
      titolo: 'Notifiche', sottotitolo: 'Sotto', punti: [{ icona: '⏱️', testo: 'Uno' }], ordine: 3
    })).corpo;
    const risposta = await comeAdmin('PUT', `/admin/novita/${dati.id}`, { titolo: 'Avvisi', attiva: 0, punti: null, ordine: 'x' });
    assert.equal(risposta.stato, 200);
    const n = risposta.corpo.dati;
    assert.deepEqual([n.titolo, n.sottotitolo, n.attiva, n.punti, n.ordine], ['Avvisi', 'Sotto', false, null, 0]);
    assert.equal((await comeAdmin('PUT', '/admin/novita/99999', { titolo: 'X' })).stato, 404);
  });

  it('deleted; a missing one is 404', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/novita', { titolo: 'Notifiche' })).corpo;
    const risposta = await comeAdmin('DELETE', `/admin/novita/${dati.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Novità eliminata');
    assert.equal((await comeAdmin('DELETE', `/admin/novita/${dati.id}`)).stato, 404);
  });
});
