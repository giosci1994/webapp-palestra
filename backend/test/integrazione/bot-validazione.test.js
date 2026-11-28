// The bot's input is checked like the app's: a wrong value on a bot route is a
// 400 with a message (never a 500), the values the AI passes to its functions
// get the same limits before they enter the draft, and a draft that already
// holds a wrong value (saved before these checks) does not block "finish".
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, titoloDiOggi } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI } from '../../src/services/bot.service.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777003;

let io;
let base;

before(async () => {
  process.env.BOT_SECRET = SEGRETO;
  const server = creaServer();
  io = server.io;
  await new Promise(risolvi => server.serverHttp.listen(0, '127.0.0.1', risolvi));
  base = `http://127.0.0.1:${server.serverHttp.address().port}/api/v1/bot`;
});
after(async () => {
  impostaClientAI(null);
  await new Promise(risolvi => io.close(risolvi));
  await prisma.$disconnect();
  redis.disconnect();
});
beforeEach(async () => {
  await svuotaDatabase();
  const chiavi = await redis.keys('bot:*');
  if (chiavi.length) await redis.del(...chiavi);
});
afterEach(() => mock.restoreAll());

/** What the bot sends: the secret and, unless the body says otherwise, the chat */
async function bot(percorso, corpo = {}) {
  const risposta = await fetch(`${base}/${percorso}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bot-secret': SEGRETO, 'accept-language': 'en' },
    body: JSON.stringify({ chatId: CHAT_ID, ...corpo })
  });
  return { stato: risposta.status, corpo: await risposta.json() };
}

async function utenteCollegato(lingua = 'en') {
  const utente = await creaUtente({ lingua });
  await prisma.collegamentoTelegram.create({
    data: { utenteId: utente.id, telegramChatId: BigInt(CHAT_ID), collegatoIl: new Date() }
  });
  return utente;
}

const chiaveStato = utente => `bot:stato:${utente.id}`;

async function statoSalvato(utente) {
  const raw = await redis.get(chiaveStato(utente));
  return raw ? JSON.parse(raw) : null;
}

/** A fake Gemini that answers with the given steps, one per call, and keeps each request */
function geminiFinto(passi) {
  const richieste = [];
  impostaClientAI({
    models: {
      generateContent: async (richiesta) => {
        richieste.push(JSON.parse(JSON.stringify(richiesta)));
        const passo = passi.shift();
        if (!passo) throw new Error('Unexpected call to Gemini');
        return passo;
      }
    }
  });
  return richieste;
}

const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });

/** What the model got back from the function it called in the step before `n` */
const rispostaFunzione = (richieste, n) => richieste[n].contents.at(-1).parts[0].functionResponse.response;

describe('bot routes: wrong values are a 400, never a 500', () => {
  it('a chatId that is not a number', async () => {
    for (const percorso of ['messaggio', 'schede', 'collega']) {
      const r = await bot(percorso, { chatId: 'abc', testo: 'hi', codice: 'ABC123' });
      assert.equal(r.stato, 400, percorso);
      assert.equal(r.corpo.messaggio, 'The chatId is not valid');
    }
    const senza = await bot('schede', { chatId: null });
    assert.equal(senza.stato, 400);
    assert.equal(senza.corpo.messaggio, 'Missing chatId');
  });

  it('a group chat (negative id) is still a chat', async () => {
    const r = await bot('schede', { chatId: '-1001234567890' });
    assert.equal(r.stato, 409);
    assert.equal(r.corpo.codice, 'NON_COLLEGATO');
  });

  it('values of the wrong type, in the language of the account', async () => {
    await utenteCollegato('it');
    const casi = [
      ['scheda', { schedaId: 'abc' }, 'La scheda non è valida'],
      ['scheda', {}, 'La scheda non è valida'],
      ['messaggio', { testo: 5 }, 'Il messaggio deve essere un testo'],
      ['guida/termina', { titolo: { a: 1 } }, 'Il titolo deve essere un testo'],
      ['guida/aggiungi', { esercizioId: 'abc' }, "L'esercizio non è valido"],
      ['guida/aggiungi', {}, "L'esercizio è obbligatorio"],
      // Without a region or a group Prisma read "no filter": the whole catalog
      ['guida/gruppi', {}, 'La regione del corpo non è valida'],
      ['guida/gruppi', { bodyRegion: { not: null } }, 'La regione del corpo non è valida'],
      ['guida/esercizi', {}, 'Il gruppo muscolare non è valido'],
      ['guida/esercizi', { gruppo: '' }, 'Il gruppo muscolare non è valido']
    ];
    for (const [percorso, corpo, messaggio] of casi) {
      const r = await bot(percorso, corpo);
      assert.equal(r.stato, 400, `${percorso} ${JSON.stringify(corpo)}`);
      assert.equal(r.corpo.messaggio, messaggio, `${percorso} ${JSON.stringify(corpo)}`);
    }
  });

  it('sets and reps out of range never enter the draft', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    const casi = [
      [{ serie: '99999999999' }, 'The number of sets is not valid'],
      [{ serie: -5 }, 'The number of sets is not valid'],
      [{ serie: 0 }, 'The number of sets is not valid'],
      [{ serie: 1001 }, 'The number of sets is not valid'],
      [{ serie: 'tre' }, 'The number of sets is not valid'],
      [{ ripetizioni: 'x'.repeat(3000) }, 'The reps are too long (at most 30 characters, for example 8-12)'],
      [{ ripetizioni: ['8'] }, 'The reps must be text (for example 8-12)']
    ];
    for (const [valori, messaggio] of casi) {
      const r = await bot('guida/aggiungi', { esercizioId: esercizio.id, serie: 3, ripetizioni: '8', ...valori });
      assert.equal(r.stato, 400, JSON.stringify(valori).slice(0, 40));
      assert.equal(r.corpo.messaggio, messaggio);
    }
    assert.equal(await statoSalvato(utente), null);
  });

  it('the values the buttons send still work, from start to finish', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press', gruppoMuscoloPrimario: 'Petto', bodyRegion: 'Parte Superiore' });
    assert.equal((await bot('guida/gruppi', { bodyRegion: 'Parte Superiore' })).stato, 200);
    const elenco = await bot('guida/esercizi', { gruppo: 'Petto' });
    assert.deepEqual(elenco.corpo.dati.esercizi.map(e => e.id), [esercizio.id]);
    assert.equal((await bot('guida/esercizi', { soloPiuUsati: true })).stato, 200);
    // The callback data are text: "3" and "8-12"
    assert.equal((await bot('guida/aggiungi', { esercizioId: String(esercizio.id), serie: '3', ripetizioni: '8-12' })).stato, 200);
    assert.equal((await bot('guida/aggiungi', { esercizioId: esercizio.id, serie: 1000, ripetizioni: '5' })).stato, 200);
    const fine = await bot('guida/termina');
    assert.equal(fine.stato, 200);
    const salvata = await prisma.schedaAllenamento.findFirst({ where: { creatoreId: utente.id }, include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } } });
    assert.deepEqual(salvata.esercizi.map(e => [e.serieTarget, e.repTarget, e.recuperoSecondi]), [[3, '8-12', 90], [1000, '5', 90]]);
  });
});

describe('bot: a draft saved before the checks does not block "finish"', () => {
  /** A draft with the values that used to get in: every "finish" was a 500 */
  async function bozzaAvvelenata(utente, esercizio) {
    const bozza = {
      titolo: null, livello: null,
      esercizi: [
        { tipo: 'FORZA', esercizioId: esercizio.id, nome: esercizio.nome, serie: 99999999999, ripetizioni: 'x'.repeat(3000), recuperoSecondi: -10 },
        { tipo: 'FORZA', esercizioId: esercizio.id, nome: esercizio.nome, serie: 4, ripetizioni: '10', recuperoSecondi: 0 },
        { tipo: 'CARDIO', esercizioId: esercizio.id, nome: esercizio.nome, durataMinuti: 'venti', velocitaKmh: 1e9, distanzaKm: 5 }
      ]
    };
    await redis.set(chiaveStato(utente), JSON.stringify({ bozza, storia: [] }), 'EX', 3600);
  }

  const vociSalvate = async utente => {
    const scheda = await prisma.schedaAllenamento.findFirst({ where: { creatoreId: utente.id }, include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } } });
    return scheda.esercizi.map(e => [e.serieTarget, e.repTarget, e.recuperoSecondi, e.durataMinuti, e.velocitaKmh, e.distanzaKm]);
  };
  // The wrong values take the defaults, the right ones (rest 0 included) stay
  // The cardio entry's wrong minutes take the cardio default (10), like missing ones
  const ATTESE = [[3, '8-12', 90, null, null, null], [4, '10', 0, null, null, null], [1, null, 0, 10, null, 5]];

  it('from the guided creation', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    await bozzaAvvelenata(utente, esercizio);
    const fine = await bot('guida/termina');
    assert.equal(fine.stato, 200);
    assert.equal(fine.corpo.dati.numEsercizi, 3);
    assert.deepEqual(await vociSalvate(utente), ATTESE);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
  });

  it('from the AI', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    await bozzaAvvelenata(utente, esercizio);
    const richieste = geminiFinto([chiama('termina_scheda', { titolo: { a: 1 } }), { text: 'Saved!' }]);
    const fine = await bot('messaggio', { testo: 'done' });
    assert.equal(fine.stato, 200);
    const risultato = rispostaFunzione(richieste, 1);
    assert.equal(risultato.ok, true);
    // A title that is not text: the default one
    assert.equal(risultato.titolo, titoloDiOggi('en'));
    assert.deepEqual(await vociSalvate(utente), ATTESE);
  });
});

describe('bot AI: the function arguments get the same limits', () => {
  it('a strength entry out of range goes back to the model as an error', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    const casi = [
      [{ serie: 99999999999 }, 'The number of sets is not valid'],
      [{ serie: -5 }, 'The number of sets is not valid'],
      [{ recuperoSecondi: 86401 }, 'The rest time is not valid'],
      [{ recuperoSecondi: 'tanto' }, 'The rest time is not valid'],
      [{ ripetizioni: 'x'.repeat(31) }, 'The reps are too long (at most 30 characters, for example 8-12)'],
      [{ esercizioId: 'abc' }, 'The exercise is not valid']
    ];
    for (const [valori, messaggio] of casi) {
      const richieste = geminiFinto([
        chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 3, ripetizioni: '8', ...valori }),
        { text: 'Sorry, that value is not valid' }
      ]);
      const r = await bot('messaggio', { testo: 'add bench press' });
      assert.equal(r.stato, 200);
      assert.deepEqual(rispostaFunzione(richieste, 1), { errore: messaggio }, JSON.stringify(valori).slice(0, 40));
    }
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
  });

  it('valid values enter the draft: rest 0, reps sent as a number, defaults when missing', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 4, ripetizioni: 10, recuperoSecondi: 0 }),
      chiama('aggiungi_esercizio', { esercizioId: String(esercizio.id), serie: '2', ripetizioni: '12', recuperoSecondi: 86400 }),
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id }),
      { text: 'Added' }
    ]);
    assert.equal((await bot('messaggio', { testo: 'add' })).stato, 200);
    const voci = (await statoSalvato(utente)).bozza.esercizi;
    assert.deepEqual(voci.map(e => [e.serie, e.ripetizioni, e.recuperoSecondi]), [[4, '10', 0], [2, '12', 86400], [3, '8-12', 90]]);
  });

  it('a plan title over 100 characters goes back to the model as an error, nothing is saved', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });
    const richieste = geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id }),
      chiama('termina_scheda', { titolo: 'x'.repeat(101) }),
      { text: 'That title is too long' }
    ]);
    assert.equal((await bot('messaggio', { testo: 'bench press, then finish' })).stato, 200);
    assert.deepEqual(rispostaFunzione(richieste, 2), { errore: 'The title is too long (at most 100 characters)' });
    assert.equal(await prisma.schedaAllenamento.count(), 0);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 1);

    // Measured after trimming, like the guided creation: 100 characters are saved
    const ancora = geminiFinto([chiama('termina_scheda', { titolo: `  ${'x'.repeat(100)}  ` }), { text: 'Saved!' }]);
    assert.equal((await bot('messaggio', { testo: 'finish' })).stato, 200);
    assert.equal(rispostaFunzione(ancora, 1).ok, true);
    assert.equal((await prisma.schedaAllenamento.findFirst({ where: { creatoreId: utente.id } })).titolo, 'x'.repeat(100));
  });

  it('a cardio entry out of range goes back to the model as an error', async () => {
    const utente = await utenteCollegato();
    // The values are checked before the machine is looked up in the catalog
    const casi = [
      [{ durataMinuti: 'venti' }, 'The duration is not valid'],
      [{ durataMinuti: 1441 }, 'The duration is not valid'],
      [{ velocitaKmh: 201 }, 'The speed is not valid'],
      [{ inclinazione: 101 }, 'The incline is not valid'],
      [{ distanzaKm: -1 }, 'The distance is not valid']
    ];
    for (const [valori, messaggio] of casi) {
      const richieste = geminiFinto([chiama('aggiungi_cardio', { macchina: 'tapis roulant', ...valori }), { text: 'Not valid' }]);
      assert.equal((await bot('messaggio', { testo: 'treadmill' })).stato, 200);
      assert.deepEqual(rispostaFunzione(richieste, 1), { errore: messaggio }, JSON.stringify(valori));
    }
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
  });
});
