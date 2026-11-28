// The bot handles different chats in parallel: the changes to one user's
// draft (add, finish, a message to the AI) take a lock in Redis, so two
// requests of the same user never both rewrite the draft. "Finish" empties
// the draft before it creates the plan: Redis failing leaves no plan, the
// database failing puts the draft back. A plan is never saved twice.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI } from '../../src/services/bot.service.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777004;
const OCCUPATO = "I'm still working on your previous request: wait for my answer, then try again. ⏳";
const NON_SALVATA = "I couldn't save the plan: your draft is still here, try again. 🙏";

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

async function bot(percorso, corpo = {}, lingua = 'en') {
  const risposta = await fetch(`${base}/${percorso}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bot-secret': SEGRETO, 'accept-language': lingua },
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

/** A fake Gemini: each step is a `{ functionCalls }`, a `{ text }`, an Error, or a function returning one of them */
function geminiFinto(passi) {
  impostaClientAI({
    models: {
      generateContent: async () => {
        let passo = passi.shift();
        if (typeof passo === 'function') passo = await passo();
        if (!passo) throw new Error('Unexpected call to Gemini');
        if (passo instanceof Error) throw passo;
        return passo;
      }
    }
  });
}
const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });

async function statoSalvato(utente) {
  const raw = await redis.get(`bot:stato:${utente.id}`);
  return raw ? JSON.parse(raw) : null;
}
const schedeDi = utente => prisma.schedaAllenamento.count({ where: { creatoreId: utente.id } });

const giu = async () => { throw new Error('Connection is closed.'); };
const setVero = redis.set.bind(redis);
/** SET fails only on the conversation state, and only from the n-th call on */
function setGiuSulloStato(dallaVolta = 1) {
  let volte = 0;
  return (chiave, ...resto) => {
    if (chiave.startsWith('bot:stato:') && ++volte >= dallaVolta) return giu();
    return setVero(chiave, ...resto);
  };
}

describe('bot: one change at a time per user', () => {
  it('a busy user gets a clear 409 on add, finish and the AI, and the draft is not touched', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    assert.equal((await bot('guida/aggiungi', { esercizioId: esercizio.id })).stato, 200);
    // Released after the request
    assert.equal(await redis.exists(`bot:blocco:${utente.id}`), 0);

    await redis.set(`bot:blocco:${utente.id}`, 'another-request', 'PX', 60000);
    geminiFinto([{ text: 'should not be called' }]);
    for (const [percorso, corpo] of [['guida/aggiungi', { esercizioId: esercizio.id }], ['guida/termina', {}], ['messaggio', { testo: 'hello' }]]) {
      const risposta = await bot(percorso, corpo);
      assert.equal(risposta.stato, 409, percorso);
      assert.equal(risposta.corpo.codice, 'BOT_OCCUPATO');
      assert.equal(risposta.corpo.messaggio, OCCUPATO);
    }
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 1);
    assert.equal(await schedeDi(utente), 0);
    // Someone else's lock is not released by the refused requests
    assert.equal(await redis.get(`bot:blocco:${utente.id}`), 'another-request');
  });

  it('in Italian too', async () => {
    const utente = await utenteCollegato('it');
    await redis.set(`bot:blocco:${utente.id}`, 'another-request', 'PX', 60000);
    const risposta = await bot('guida/termina', {}, 'it');
    assert.equal(risposta.stato, 409);
    assert.match(risposta.corpo.messaggio, /^Sto ancora lavorando alla richiesta precedente/);
  });

  it('two requests at the same time: the second waits for nothing and changes nothing', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Squat' });
    let sblocca;
    const attesa = new Promise(risolvi => { sblocca = risolvi; });
    let chiamato;
    const geminiChiamato = new Promise(risolvi => { chiamato = risolvi; });
    geminiFinto([
      async () => { chiamato(); await attesa; return chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 5, ripetizioni: '5' }); },
      { text: 'Added' }
    ]);
    const primo = bot('messaggio', { testo: '5x5 squat' });
    await geminiChiamato;
    // The AI is still answering: "Finish" from the buttons is refused
    const secondo = await bot('guida/termina');
    assert.equal(secondo.stato, 409);
    sblocca();
    assert.equal((await primo).stato, 200);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 1);
    assert.equal(await schedeDi(utente), 0);
    assert.equal(await redis.exists(`bot:blocco:${utente.id}`), 0);
  });

  it('Redis unreachable when taking the lock: the usual 503', async () => {
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await utenteCollegato();
    mock.method(redis, 'set', giu);
    const risposta = await bot('guida/aggiungi', { esercizioId: esercizio.id });
    assert.equal(risposta.stato, 503);
    assert.equal(risposta.corpo.messaggio, "The bot's memory can't be reached right now: try again in a moment. ⏳");
  });
});

describe('bot: "finish" empties the draft first, then creates the plan', () => {
  it('guided: Redis failing to empty the draft creates no plan', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });

    mock.method(redis, 'set', setGiuSulloStato());
    assert.equal((await bot('guida/termina')).stato, 503);
    mock.restoreAll();
    assert.equal(await schedeDi(utente), 0);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 1);
  });

  it('guided: the database failing puts the draft back as it was', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id, serie: 4, ripetizioni: '10' });
    const prima = await statoSalvato(utente);
    // The exercise disappears from the catalog: the plan cannot reference it
    await prisma.esercizio.delete({ where: { id: esercizio.id } });

    const risposta = await bot('guida/termina');
    assert.equal(risposta.stato, 500);
    assert.equal(risposta.corpo.codice, 'BOT_SCHEDA_NON_SALVATA');
    assert.equal(risposta.corpo.messaggio, NON_SALVATA);
    assert.equal(await schedeDi(utente), 0);
    assert.deepEqual((await statoSalvato(utente)).bozza, prima.bozza);

    // In Italian too
    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    const italiano = await bot('guida/termina', {}, 'it');
    assert.equal(italiano.stato, 500);
    assert.equal(italiano.corpo.messaggio, 'Non sono riuscito a salvare la scheda: la bozza è ancora qui, riprova. 🙏');
  });

  it('AI: Redis failing to empty the draft creates no plan', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Squat' });
    geminiFinto([chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 5, ripetizioni: '5' }), { text: 'Added' }]);
    await bot('messaggio', { testo: '5x5 squat' });

    geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), { text: 'Saved!' }]);
    mock.method(redis, 'set', setGiuSulloStato());
    assert.equal((await bot('messaggio', { testo: 'done' })).stato, 503);
    mock.restoreAll();
    assert.equal(await schedeDi(utente), 0);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 1);
  });

  it('AI: the database failing puts the draft back, and "done" again saves one plan', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Squat' });
    const altro = await creaEsercizio({ nome: 'Lunge' });
    geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: esercizio.id, serie: 5, ripetizioni: '5' }),
      chiama('aggiungi_esercizio', { esercizioId: altro.id, serie: 3, ripetizioni: '10' }),
      { text: 'Added' }
    ]);
    await bot('messaggio', { testo: 'squat and lunges' });
    const prima = await statoSalvato(utente);
    await prisma.esercizio.delete({ where: { id: altro.id } });

    geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), { text: 'Saved!' }]);
    // Not "Something went wrong with the AI assistant" (502): the AI did its part
    const fallita = await bot('messaggio', { testo: 'done' });
    assert.equal(fallita.stato, 500);
    assert.equal(fallita.corpo.codice, 'BOT_SCHEDA_NON_SALVATA');
    assert.equal(fallita.corpo.messaggio, NON_SALVATA);
    assert.equal(await schedeDi(utente), 0);
    assert.deepEqual((await statoSalvato(utente)).bozza, prima.bozza);

    // The exercise is back: "done" again saves exactly one plan
    await prisma.esercizio.create({ data: { id: altro.id, nome: 'Lunge', gruppoMuscoloPrimario: 'Petto' } });
    geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), { text: 'Saved!' }]);
    assert.equal((await bot('messaggio', { testo: 'done' })).stato, 200);
    assert.equal(await schedeDi(utente), 1);
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
  });
});
