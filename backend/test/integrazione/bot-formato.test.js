// The texts the bot sends with Telegram's HTML formatting: titles, exercise
// names and reps come from users and from the catalog, and are escaped. A
// title like "Upper_A *heavy*" used to break the Markdown, Telegram refused the
// message and the user got nothing.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777005;

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
  await new Promise(risolvi => io.close(risolvi));
  await prisma.$disconnect();
  redis.disconnect();
});
beforeEach(async () => {
  await svuotaDatabase();
  const chiavi = await redis.keys('bot:*');
  if (chiavi.length) await redis.del(...chiavi);
});

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

/** What Telegram would see as markup: only the tags the texts use, nothing from the data */
const senzaTag = testo => testo.replace(/<\/?(b|i)>/g, '');

describe('bot: HTML formatting', () => {
  it('plan details: title, names and reps with _ * [ ` < > & are escaped', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Curl_EZ *bar* [cable] `x` <b>' });
    const scheda = await creaScheda(utente, [esercizio], { titolo: 'Upper_A *heavy* [1] `v2` <i>&' });
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id }, data: { repTarget: '8<12' } });

    const risposta = await bot('scheda', { schedaId: scheda.id });
    assert.equal(risposta.stato, 200);
    const testo = risposta.corpo.dati.testo;
    assert.match(testo, /^📋 <b>Upper_A \*heavy\* \[1\] `v2` &lt;i&gt;&amp;<\/b>\n/);
    assert.match(testo, /1\. Curl_EZ \*bar\* \[cable\] `x` &lt;b&gt; — 3x8&lt;12/);
    // No markup left from the data, and every & starts an entity
    assert.doesNotMatch(senzaTag(testo), /[<>]/);
    assert.doesNotMatch(testo, /&(?!(amp|lt|gt);)/);
    // The list of plans is shown on buttons, as plain text: the title as it is
    const schede = await bot('schede');
    assert.equal(schede.corpo.dati[0].titolo, 'Upper_A *heavy* [1] `v2` <i>&');
  });

  it('statistics: HTML tags, no Markdown left', async () => {
    await utenteCollegato();
    const testo = (await bot('statistiche')).corpo.dati.testo;
    assert.match(testo, /^<b>📊 Your stats<\/b>/);
    assert.match(testo, /Total workouts: <b>0<\/b>/);
    assert.doesNotMatch(testo, /[*_]/);
  });
});
