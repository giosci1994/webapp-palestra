// The bot's AI engine with a fake Gemini: each function that changes the
// draft is saved at once, so an AI failure halfway through a message neither
// loses the exercises already added nor leaves a saved plan in the draft
// (writing "done" again would save it twice). With Redis unreachable the bot
// says so (503) instead of losing the draft without a word.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI } from '../../src/services/bot.service.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777002;

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
  // The ids start again after each cleanup: no draft or rate limit left over
  const chiavi = await redis.keys('bot:*');
  if (chiavi.length) await redis.del(...chiavi);
});
afterEach(() => mock.restoreAll());

/** What the bot sends: the secret and the chat */
async function bot(percorso, corpo = {}) {
  const risposta = await fetch(`${base}/${percorso}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bot-secret': SEGRETO, 'accept-language': 'en' },
    body: JSON.stringify({ chatId: CHAT_ID, ...corpo })
  });
  return { stato: risposta.status, corpo: await risposta.json() };
}

async function utenteCollegato() {
  const utente = await creaUtente({ lingua: 'en' });
  await prisma.collegamentoTelegram.create({
    data: { utenteId: utente.id, telegramChatId: BigInt(CHAT_ID), collegatoIl: new Date() }
  });
  return utente;
}

/**
 * A fake Gemini that answers with the given steps, one per call: a
 * `{ functionCalls }`, a `{ text }` or an Error to throw. It keeps a copy of
 * each request.
 */
function geminiFinto(passi) {
  const richieste = [];
  impostaClientAI({
    models: {
      generateContent: async (richiesta) => {
        richieste.push(JSON.parse(JSON.stringify(richiesta)));
        const passo = passi.shift();
        if (!passo) throw new Error('Unexpected call to Gemini');
        if (passo instanceof Error) throw passo;
        return passo;
      }
    }
  });
  return { richieste, passi };
}

const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });

async function statoSalvato(utente) {
  const raw = await redis.get(`bot:stato:${utente.id}`);
  return raw ? JSON.parse(raw) : null;
}

describe('bot AI: search, add, finish', () => {
  it('saves the plan and empties the draft', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Dumbbell Lateral Raise', nomeIt: 'Alzate laterali' });

    const gemini = geminiFinto([
      chiama('cerca_esercizio', { descrizione: 'dumbbell lateral raise' }),
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 3, ripetizioni: '8' }),
      { text: 'Added: Dumbbell Lateral Raise 3x8' }
    ]);
    const primo = await bot('messaggio', { testo: '3x8 lateral raises' });
    assert.equal(primo.stato, 200);
    assert.equal(primo.corpo.dati.risposta, 'Added: Dumbbell Lateral Raise 3x8');
    // The model got the candidates found in the catalog
    const risultatoRicerca = gemini.richieste[1].contents.at(-1).parts[0].functionResponse.response;
    assert.deepEqual(risultatoRicerca.candidati.map(c => c.id), [esercizio.id]);

    let stato = await statoSalvato(utente);
    assert.deepEqual(stato.bozza.esercizi.map(e => [e.esercizioId, e.serie, e.ripetizioni]), [[esercizio.id, 3, '8']]);
    assert.equal(stato.storia.length, 2);

    geminiFinto([chiama('termina_scheda', { titolo: 'Shoulders' }), { text: 'Saved!' }]);
    const fine = await bot('messaggio', { testo: 'done' });
    assert.equal(fine.corpo.dati.risposta, 'Saved!');

    const schede = await prisma.schedaAllenamento.findMany({ where: { creatoreId: utente.id }, include: { esercizi: true } });
    assert.equal(schede.length, 1);
    assert.equal(schede[0].titolo, 'Shoulders');
    assert.deepEqual(schede[0].esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget]), [[esercizio.id, 3, '8']]);
    stato = await statoSalvato(utente);
    assert.equal(stato.bozza.esercizi.length, 0);
    assert.equal(stato.storia.length, 4);
  });
});

describe('bot AI: a failure halfway through a message', () => {
  it('keeps the exercises already added, and the history says so', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Bench Press' });

    geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 4, ripetizioni: '10' }),
      new Error('fetch failed')
    ]);
    const risposta = await bot('messaggio', { testo: '4x10 bench press' });
    assert.equal(risposta.stato, 502);
    assert.equal(risposta.corpo.messaggio, 'Something went wrong with the AI assistant, try again shortly.');

    const stato = await statoSalvato(utente);
    assert.deepEqual(stato.bozza.esercizi.map(e => e.esercizioId), [esercizio.id]);
    assert.equal(stato.storia.at(-2).text, '4x10 bench press');
    assert.match(stato.storia.at(-1).text, /aggiungi_esercizio: Bench Press/);

    // The next message sees the draft and the history
    const gemini = geminiFinto([{ text: 'You have 1 exercise' }]);
    await bot('messaggio', { testo: 'what do I have?' });
    assert.match(gemini.richieste[0].config.systemInstruction, /Bench Press/);
    assert.match(gemini.richieste[0].contents[1].parts[0].text, /aggiungi_esercizio: Bench Press/);
  });

  it('a plan saved before the failure is not saved twice when the user writes "done" again', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Squat' });

    geminiFinto([chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 5, ripetizioni: '5' }), { text: 'Added' }]);
    await bot('messaggio', { testo: '5x5 squat' });

    geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), new Error('429 RESOURCE_EXHAUSTED: quota')]);
    const fine = await bot('messaggio', { testo: 'done' });
    assert.equal(fine.stato, 429);
    assert.equal(await prisma.schedaAllenamento.count({ where: { creatoreId: utente.id } }), 1);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);

    // "done" again: the draft is empty, the function refuses
    const gemini = geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), { text: 'Your plan is already saved' }]);
    const ancora = await bot('messaggio', { testo: 'done' });
    assert.equal(ancora.stato, 200);
    assert.match(gemini.richieste[1].contents.at(-1).parts[0].functionResponse.response.errore, /^The draft is empty/);
    assert.equal(await prisma.schedaAllenamento.count({ where: { creatoreId: utente.id } }), 1);
  });

  it('nothing changed, nothing new in the history', async () => {
    const utente = await utenteCollegato();
    geminiFinto([new Error('fetch failed')]);
    assert.equal((await bot('messaggio', { testo: 'hello' })).stato, 502);
    assert.equal(await statoSalvato(utente), null);
  });
});

describe('bot: Redis unreachable', () => {
  const giu = async () => { throw new Error('Connection is closed.'); };
  // Only the conversation state fails to save: the user's lock (bot:blocco:)
  // uses SET too, and must not be what answers 503 here
  const setVero = redis.set.bind(redis);
  const setGiuSulloStato = (chiave, ...resto) => (chiave.startsWith('bot:stato:') ? giu() : setVero(chiave, ...resto));

  it('the AI engine answers 503 instead of starting from an empty draft', async () => {
    await utenteCollegato();
    geminiFinto([{ text: 'should not be called' }]);
    mock.method(redis, 'get', giu);
    const risposta = await bot('messaggio', { testo: 'hello' });
    assert.equal(risposta.stato, 503);
    assert.equal(risposta.corpo.messaggio, "The bot's memory can't be reached right now: try again in a moment. ⏳");
  });

  it('an exercise the AI adds and cannot save is a 503, not a confirmation', async () => {
    const esercizio = await creaEsercizio({ nome: 'Deadlift' });
    await utenteCollegato();
    geminiFinto([chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 3, ripetizioni: '5' }), { text: 'Added' }]);
    mock.method(redis, 'set', setGiuSulloStato);
    assert.equal((await bot('messaggio', { testo: '3x5 deadlift' })).stato, 503);
  });

  it('the guided creation does not say "Draft: 1 exercise" when it cannot save it', async () => {
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await utenteCollegato();
    mock.method(redis, 'set', setGiuSulloStato);
    assert.equal((await bot('guida/aggiungi', { esercizioId: esercizio.id })).stato, 503);
    mock.restoreAll();

    mock.method(redis, 'get', giu);
    assert.equal((await bot('guida/termina')).stato, 503);
  });

  it('cancelling a draft it cannot reach is a 503, not "Draft cancelled"', async () => {
    await utenteCollegato();
    mock.method(redis, 'del', giu);
    assert.equal((await bot('annulla')).stato, 503);
  });
});
