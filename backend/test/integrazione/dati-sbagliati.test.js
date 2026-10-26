// Every API route, sent wrong data: a text, an object, a negative number, a
// huge number, a list, a text with a NUL character and a number too big for
// the database in every field the routes read, and nonsense in the query
// string. The answer must be a client error (400, 403, 404…), never a
// 500: a 500 means the data reached the database or the code unchecked. (A
// 503, a service that is not set up like the AI assistant without its key, is
// fine.)
//
// ANCORA_500 lists the routes that still answer 500. It is empty and must
// stay so: the test fails when a route answers 500, and also when a route in
// the list stops doing it, so that it is taken off.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import argon2 from 'argon2';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaSessione, creaRecord, tokenPer } from '../supporto/dati.js';
import router from '../../src/routes/indice.js';
import { limitatoreGlobale, limitatoreAuth, limitatoreAI } from '../../src/middleware/limitatore.js';
import { azzeraTentativi } from '../../src/utils/tentativiAccesso.js';

const ANCORA_500 = new Set([]);

// The fields the routes read from the body
const CAMPI = [
  'titolo', 'nome', 'email', 'password', 'data', 'dataOra', 'dataInizio', 'peso', 'bmi', 'bmr', 'note',
  'clienteId', 'schedaId', 'esercizioId', 'destinatarioId', 'trainerId', 'utenteId', 'esercizi', 'serie',
  'ruolo', 'stato', 'tipo', 'punti', 'ordine', 'durataMinuti', 'completato', 'messaggio', 'contenuto', 'testo',
  'gruppoMuscoloPrimario', 'gruppoMuscoloSecondario', 'attrezzaturaRichiestaId', 'attrezzaturaSuggerita',
  'descrizione', 'linkVideo', 'nomeCatena', 'citta', 'indirizzo', 'nazione', 'googlePlaceId', 'categoria',
  'muscoliBersaglio', 'visibile', 'priorita', 'motivoRifiuto', 'livello', 'attiva', 'sottotitolo',
  'dataNascita', 'pesoKg', 'altezzaCm', 'genere', 'bio', 'obiettivoFitness', 'immagineProfilo',
  'preferenzeVisibilita', 'gamificationAttiva', 'tipoAccount', 'anniEsperienza', 'specializzazioni',
  'certificazioni', 'contattoPubblico', 'tariffaIndicativa', 'accettaToS', 'accettaPrivacy', 'lingua',
  'conferma', 'vecchiaPassword', 'nuovaPassword', 'notePT', 'pesoEffettivo', 'repEffettive', 'serieNumero',
  'visibilita', 'ids', 'subscription', 'endpoint', 'domanda', 'conversazioneId'
];
const VALORI = ['abc', { x: 1 }, -5, 99999, ['a'], 'a\u0000b', 99999999999];
const QUERY = '?giorni=abc&da=abc&a=abc&clienteId=abc&stato=abc&ruolo=abc&pagina=abc&limite=abc' +
  '&attrezzaturaId=abc&q=ab&ricerca=x&ids=abc&esercizi=abc&dal=abc&al=abc';

// Over a thousand requests from the same user: the rate limits, and the lock
// after too many wrong passwords, would answer 429 long before the last
// routes, which would never be tried. Each request starts with them at zero.
function azzeraLimiti(utente) {
  for (const limitatore of [limitatoreGlobale, limitatoreAuth, limitatoreAI]) limitatore.resetKey(`user:${utente.id}`);
  azzeraTentativi(utente.email);
}

/** "/sessioni" from the pattern Express 4 uses to mount a sub-router */
const prefissoDi = strato => strato.regexp.source
  .replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');

/** Every route: [method, path with the :parameters] */
function tutteLeRotte() {
  const rotte = [];
  for (const strato of router.stack) {
    if (strato.route) {
      for (const metodo of Object.keys(strato.route.methods)) rotte.push([metodo.toUpperCase(), strato.route.path]);
      continue;
    }
    if (!strato.handle?.stack) continue;
    const prefisso = prefissoDi(strato);
    for (const { route } of strato.handle.stack) {
      if (!route) continue;
      for (const metodo of Object.keys(route.methods)) rotte.push([metodo.toUpperCase(), (prefisso + route.path).replace(/(.)\/$/, '$1')]);
    }
  }
  return rotte;
}

// PUT /admin/banner writes a file of the repository: it is put back as it was
const FILE_BANNER = path.resolve('prisma/dati/banner.json');
const bannerOriginale = fs.readFileSync(FILE_BANNER, 'utf8');

let server;
let hash;
before(async () => {
  server = await avviaServer();
  hash = await argon2.hash('password-sicura-123', { type: argon2.argon2id });
});
after(async () => {
  fs.writeFileSync(FILE_BANNER, bannerOriginale, 'utf8');
  await server.chiudi();
});

/**
 * A fresh database where everything has id 1 and the admin can reach it: the
 * admin is also the trainer of client 2, whose ids go in /utenti/:id
 */
async function preparaDati() {
  await svuotaDatabase();
  const admin = await creaUtente({ ruolo: 'SUPERADMIN', passwordHash: hash });
  const cliente = await creaUtente({ passwordHash: hash });
  await prisma.iscrizionePT.create({ data: { utenteId: cliente.id, trainerId: admin.id, stato: 'ATTIVA' } });
  const esercizio = await creaEsercizio();
  const scheda = await creaScheda(admin, [esercizio]);
  await creaSessione(admin, scheda, { conclusa: false, serie: [{ esercizio, peso: 50, rep: 10 }] });
  await creaRecord(admin, esercizio, 50);
  await prisma.palestra.create({ data: { nomeCatena: 'P', citta: 'C', indirizzo: 'I' } });
  await prisma.novita.create({ data: { titolo: 'N' } });
  await prisma.misurazioneCorporea.create({ data: { utenteId: admin.id } });
  await prisma.appuntamentoPT.create({ data: { trainerId: admin.id, clienteId: cliente.id, titolo: 'A', dataOra: new Date() } });
  await prisma.annuncioPT.create({ data: { trainerId: admin.id, titolo: 'A', contenuto: 'B' } });
  await prisma.suggerimentoEsercizio.create({ data: { utenteId: cliente.id, nome: 'S', gruppoMuscoloPrimario: 'Petto' } });
  await prisma.allenamentoNotifica.create({ data: { utenteId: admin.id, titolo: 'T', messaggio: 'M' } });
  await prisma.allenamentoPianificato.create({ data: { utenteId: admin.id, schedaId: scheda.id, data: new Date('2026-01-05') } });
  return { admin, cliente };
}

describe('wrong data', () => {
  it('no route answers 500, except the known ones', async () => {
    const nuove = [];
    const guarite = new Set(ANCORA_500);
    const rotte = tutteLeRotte();
    assert.ok(rotte.length >= 150, `only ${rotte.length} routes found`);

    // The data is made again only after a request that may have changed it
    let dati;
    let cambiati = true;
    for (const [metodo, percorso] of rotte) {
      if (cambiati) {
        dati = await preparaDati();
        cambiati = false;
      }
      const indirizzo = percorso.replace(/:(\w+)/g, (_, nome) =>
        nome === 'id' && percorso.startsWith('/utenti/') ? String(dati.cliente.id) : '1');
      const tentativi = ['POST', 'PUT', 'PATCH'].includes(metodo)
        ? VALORI.map(valore => ({ corpo: Object.fromEntries(CAMPI.map(campo => [campo, valore])), come: JSON.stringify(valore) }))
        : [{ query: QUERY, come: 'the query string' }];

      let errore = null;
      for (const { corpo, query = '', come } of tentativi) {
        azzeraLimiti(dati.admin);
        const risposta = await server.richiesta(metodo, indirizzo + query, { token: tokenPer(dati.admin), corpo });
        if (metodo !== 'GET' && (risposta.stato < 400 || risposta.stato >= 500)) cambiati = true;
        if (risposta.stato === 500) {
          errore = `500 with ${come}: ${risposta.corpo?.messaggio?.split('\n').filter(Boolean).pop()}`;
          break;
        }
        // A rate limit means the route was not tried at all
        if (risposta.stato === 429) {
          errore = `429 with ${come}: not tried`;
          break;
        }
      }
      const rotta = `${metodo} ${percorso}`;
      if (errore && !ANCORA_500.has(rotta)) nuove.push(`${rotta} → ${errore}`);
      if (errore) guarite.delete(rotta);
    }

    assert.deepEqual(nuove, [], 'Routes answering 500 to wrong data');
    assert.deepEqual([...guarite], [], 'They no longer answer 500: take them off ANCORA_500');
  });

  it('a NUL character, which the database cannot store, is refused before any route, in the language of the request', async () => {
    const { admin } = await preparaDati();
    azzeraLimiti(admin);
    const corpo = { titolo: 'Forza\u0000', esercizi: [] };
    const italiano = await server.richiesta('POST', '/schede', { token: tokenPer(admin), corpo });
    const inglese = await server.richiesta('POST', '/schede', { token: tokenPer(admin), corpo, lingua: 'en' });
    assert.deepEqual([italiano.stato, italiano.corpo.messaggio], [400, 'La richiesta contiene un carattere non ammesso']);
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [400, 'The request contains a character that is not allowed']);
    const nellaQuery = await server.richiesta('GET', '/esercizi?ricerca=a%00b', { token: tokenPer(admin) });
    assert.equal(nellaQuery.stato, 400);
    assert.equal(await prisma.schedaAllenamento.count({ where: { titolo: { startsWith: 'Forza' } } }), 0);
  });
});
