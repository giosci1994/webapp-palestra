// The Telegram bot's routes answer in the language of the linked user's
// account (Profile, otherwise the one the app last used), whatever Telegram
// says; an unlinked chat gets Telegram's, from Accept-Language.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, titoloDiOggi } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { RICHIESTE_BOT_PER_CHAT, RICHIESTE_BOT_TOTALI, CHIAVE_BOT_TOTALE, limitatoreBotTotale, chiaveChatBot } from '../../src/middleware/limitatore.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777001;

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
beforeEach(svuotaDatabase);

/** What the bot sends: the secret, and the Telegram user's language in Accept-Language */
async function bot(percorso, corpo, telegram = 'it') {
  const intestazioni = { 'content-type': 'application/json', 'x-bot-secret': SEGRETO };
  if (telegram) intestazioni['accept-language'] = telegram;
  const risposta = await fetch(`${base}/${percorso}`, { method: 'POST', headers: intestazioni, body: JSON.stringify(corpo) });
  return { stato: risposta.status, corpo: await risposta.json(), lingua: risposta.headers.get('content-language') };
}

/** A user linked to the chat, with the language saved on the account */
async function utenteCollegato(lingua = {}) {
  const utente = await creaUtente(lingua);
  await prisma.collegamentoTelegram.create({
    data: { utenteId: utente.id, telegramChatId: BigInt(CHAT_ID), collegatoIl: new Date() }
  });
  return utente;
}

describe('bot: the language of a linked user', () => {
  it('the account language wins over Telegram\'s, both ways', async () => {
    const utente = await utenteCollegato({ lingua: 'en' });
    const inglese = await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'it');
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [404, 'Plan not found']);

    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    const italiano = await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'en');
    assert.deepEqual([italiano.stato, italiano.corpo.messaggio], [404, 'Scheda non trovata']);
    // The bot's own texts follow the language the backend answered in
    assert.deepEqual([inglese.lingua, italiano.lingua], ['en', 'it']);
  });

  it('without a choice in Profile, the language the app last used', async () => {
    await utenteCollegato({ linguaApp: 'en' });
    const risposta = await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'it');
    assert.equal(risposta.corpo.messaggio, 'Plan not found');
  });

  it('an account with no language at all keeps Telegram\'s', async () => {
    await utenteCollegato();
    assert.equal((await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'it')).corpo.messaggio, 'Scheda non trovata');
    assert.equal((await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'en')).corpo.messaggio, 'Plan not found');
    assert.equal((await bot('scheda', { chatId: CHAT_ID, schedaId: 999 }, 'fr')).corpo.messaggio, 'Plan not found');
  });

  it('confirmations and statistics', async () => {
    const utente = await utenteCollegato({ lingua: 'en' });
    assert.equal((await bot('annulla', { chatId: CHAT_ID }, 'it')).corpo.messaggio, 'Draft cancelled');
    assert.match((await bot('statistiche', { chatId: CHAT_ID }, 'it')).corpo.dati.testo, /Your stats/);

    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    assert.equal((await bot('annulla', { chatId: CHAT_ID }, 'en')).corpo.messaggio, 'Bozza annullata');
    assert.match((await bot('statistiche', { chatId: CHAT_ID }, 'en')).corpo.dati.testo, /Le tue statistiche/);
  });

  it('exercise names: the English name in English, the Italian one (when there is) in Italian', async () => {
    const utente = await utenteCollegato({ lingua: 'en' });
    const panca = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const plank = await creaEsercizio({ nome: 'Plank', gruppoMuscoloPrimario: 'Petto' });
    const scheda = await creaScheda(utente, [panca, plank], { livello: 'AVANZATO' });
    // Only the first has a rest time
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: panca.id }, data: { recuperoSecondi: 90 } });

    const inglese = (await bot('scheda', { chatId: CHAT_ID, schedaId: scheda.id }, 'it')).corpo.dati.testo;
    assert.match(inglese, /Level: Advanced/);
    assert.match(inglese, /1\. Bench Press — 3x8-12 \(rest 90s\)/);
    assert.match(inglese, /2\. Plank — 3x8-12$/);

    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    const italiano = (await bot('scheda', { chatId: CHAT_ID, schedaId: scheda.id }, 'en')).corpo.dati.testo;
    assert.match(italiano, /Livello: Avanzato/);
    assert.match(italiano, /1\. Panca piana — 3x8-12 \(rec 90s\)/);
    assert.match(italiano, /2\. Plank — 3x8-12$/);

    // The guided creation: same names on the buttons, and the labels to show
    const guida = (lingua, corpo) => bot('guida/esercizi', { chatId: CHAT_ID, ...corpo }, lingua);
    const elenco = (await guida('en', { gruppo: 'Petto' })).corpo.dati;
    assert.deepEqual(elenco.esercizi.map(e => e.nome).sort(), ['Panca piana', 'Plank']);
    assert.equal(elenco.etichettaGruppo, 'Petto');
    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'en' } });
    const english = (await guida('it', { gruppo: 'Petto' })).corpo.dati;
    assert.deepEqual(english.esercizi.map(e => e.nome).sort(), ['Bench Press', 'Plank']);
    assert.equal(english.etichettaGruppo, 'Chest');
  });

  it('a plan with a superset: labels A1, A2, the pause and the rest after the round', async () => {
    const utente = await utenteCollegato({ lingua: 'en' });
    const panca = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const rematore = await creaEsercizio({ nome: 'Barbell Row', nomeIt: 'Rematore', gruppoMuscoloPrimario: 'Schiena' });
    const curl = await creaEsercizio({ nome: 'Curl', gruppoMuscoloPrimario: 'Bicipiti' });
    const scheda = await creaScheda(utente, [panca, rematore, curl]);
    const imposta = (esercizio, data) => prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: esercizio.id }, data });
    await imposta(panca, { gruppo: 1, recuperoSecondi: 0 });
    await imposta(rematore, { gruppo: 1, recuperoSecondi: 120 });
    await imposta(curl, { recuperoSecondi: 60 });

    const inglese = (await bot('scheda', { chatId: CHAT_ID, schedaId: scheda.id }, 'it')).corpo.dati.testo;
    assert.match(inglese, /🔗 Superset A\nA1\. Bench Press — 3x8-12\n/);
    assert.match(inglese, /A2\. Barbell Row — 3x8-12 \(rest 120s after the round\)/);
    assert.match(inglese, /3\. Curl — 3x8-12 \(rest 60s\)$/);

    await imposta(panca, { recuperoSecondi: 15 });
    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    const italiano = (await bot('scheda', { chatId: CHAT_ID, schedaId: scheda.id }, 'en')).corpo.dati.testo;
    assert.match(italiano, /A1\. Panca piana — 3x8-12 \(pausa 15s\)/);
    assert.match(italiano, /🔗 Superset A\nA1\. Panca piana/);
    assert.match(italiano, /A2\. Rematore — 3x8-12 \(rec 120s dopo il giro\)/);

    // Three members make a circuit, with its own heading
    await imposta(curl, { gruppo: 1 });
    const circuito = (await bot('scheda', { chatId: CHAT_ID, schedaId: scheda.id }, 'en')).corpo.dati.testo;
    assert.match(circuito, /🔗 Circuito A\nA1\. Panca piana/);
    assert.match(circuito, /A3\. Curl — 3x8-12 \(rec 60s dopo il giro\)/);
    assert.equal((circuito.match(/🔗/g) || []).length, 1);
  });

  it('the guided creation sends back the data as it is, with the names to show', async () => {
    await utenteCollegato({ lingua: 'en' });
    await creaEsercizio({ gruppoMuscoloPrimario: 'Petto', bodyRegion: 'Parte Superiore' });
    const regioni = (await bot('guida/categorie', { chatId: CHAT_ID })).corpo.dati;
    assert.deepEqual(regioni.regioni, ['Parte Superiore']);
    assert.deepEqual(regioni.etichette, { 'Parte Superiore': 'Upper body' });
    const gruppi = (await bot('guida/gruppi', { chatId: CHAT_ID, bodyRegion: 'Parte Superiore' })).corpo.dati;
    assert.deepEqual(gruppi.gruppi, ['Petto']);
    assert.deepEqual(gruppi.etichette, { Petto: 'Chest' });
    assert.equal(gruppi.etichettaRegione, 'Upper body');
  });

  it('a plan saved from the guided creation has its title and description in the user\'s language', async () => {
    const utente = await utenteCollegato({ lingua: 'en' });
    const esercizio = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana' });
    const aggiunto = await bot('guida/aggiungi', { chatId: CHAT_ID, esercizioId: esercizio.id, serie: 3, ripetizioni: '10' }, 'it');
    assert.equal(aggiunto.corpo.dati.aggiunto, 'Bench Press');
    const fine = await bot('guida/termina', { chatId: CHAT_ID }, 'it');
    assert.equal(fine.corpo.dati.titolo, titoloDiOggi('en'));
    const salvata = await prisma.schedaAllenamento.findFirst({ where: { creatoreId: utente.id } });
    assert.equal(salvata.descrizione, 'Created via the Telegram bot');
  });
});

describe('bot: a chat that is not linked', () => {
  it('gets Telegram\'s language', async () => {
    const italiano = await bot('collega', { chatId: CHAT_ID, codice: 'XXXXXXXX' }, 'it-IT');
    assert.deepEqual([italiano.stato, italiano.corpo.messaggio], [400, 'Codice non valido o scaduto. Generane uno nuovo dall\'app.']);
    const inglese = await bot('collega', { chatId: CHAT_ID, codice: 'XXXXXXXX' }, 'en-US');
    assert.equal(inglese.corpo.messaggio, 'Invalid or expired code. Generate a new one from the app.');
    const altra = await bot('collega', { chatId: CHAT_ID, codice: 'XXXXXXXX' }, 'pt-br');
    assert.equal(altra.corpo.messaggio, 'Invalid or expired code. Generate a new one from the app.');
    // No account, no language for the bot to follow
    assert.equal(altra.lingua, null);
  });
});

// The bot's requests all come from the bot container's address: with the
// right secret they skip the global limit and have their own, per chat
describe('bot: the rate limit', () => {
  /** A bot request from one address, with the secret given (or a wrong one) */
  async function daIndirizzo(chatId, segreto = SEGRETO) {
    const risposta = await fetch(`${base}/annulla`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': segreto, 'cf-connecting-ip': '203.0.113.10', 'accept-language': 'en' }, // controllo-dati: ok (TEST-NET example address)
      body: JSON.stringify({ chatId })
    });
    return { stato: risposta.status, corpo: await risposta.json() };
  }

  it(`each chat has ${RICHIESTE_BOT_PER_CHAT} requests, and all of them together go past the global 500`, async () => {
    const chat = [880001, 880002, 880003];
    // 600 requests from the same address: more than the global limit
    for (const chatId of chat) {
      for (let i = 0; i < RICHIESTE_BOT_PER_CHAT; i++) {
        assert.equal((await daIndirizzo(chatId)).stato, 409);
      }
    }
    // Each chat has used up its own limit
    for (const chatId of chat) {
      const oltre = await daIndirizzo(chatId);
      assert.deepEqual([oltre.stato, oltre.corpo.codice], [429, 'TROPPE_RICHIESTE_BOT']);
      assert.equal(oltre.corpo.messaggio, 'Too many requests from this chat, try again in a few minutes.');
    }
    // Another chat, from the same address, still gets through
    assert.equal((await daIndirizzo(880004)).stato, 409);
  });

  it('123, "123", "0123" and "0x7b" are one chat', async () => {
    assert.deepEqual([123, '123', '0123', '0x7b'].map(chiaveChatBot), ['bot:123', 'bot:123', 'bot:123', 'bot:123']);
    assert.deepEqual(['abc', 1.5, null, undefined, {}, true].map(chiaveChatBot), Array(6).fill('bot:non-valida'));
    // The route accepts decimal digits only: "0x7b" is refused (400), the
    // others reach the unlinked chat (409). The limit counts them all as one
    const forme = [123, '123', '0123', '0x7b'];
    const atteso = { 123: 409, '123': 409, '0123': 409, '0x7b': 400 };
    for (let i = 0; i < RICHIESTE_BOT_PER_CHAT; i++) {
      const forma = forme[i % forme.length];
      assert.equal((await daIndirizzo(forma)).stato, atteso[forma]);
    }
    for (const forma of forme) {
      assert.equal((await daIndirizzo(forma)).corpo.codice, 'TROPPE_RICHIESTE_BOT');
    }
  });

  it(`all the bot's chats together have ${RICHIESTE_BOT_TOTALI} requests`, async () => {
    // The earlier tests' requests do not count here
    await limitatoreBotTotale.resetKey(CHIAVE_BOT_TOTALE);
    const chat = RICHIESTE_BOT_TOTALI / RICHIESTE_BOT_PER_CHAT;
    for (let c = 0; c < chat; c++) {
      for (let i = 0; i < RICHIESTE_BOT_PER_CHAT; i++) {
        assert.equal((await daIndirizzo(870000 + c)).stato, 409);
      }
    }
    // A new chat, with its own limit untouched, meets the ceiling of the bot
    const oltre = await daIndirizzo(879999);
    assert.deepEqual([oltre.stato, oltre.corpo.codice], [429, 'TROPPE_RICHIESTE_BOT_TOTALI']);
    assert.equal(oltre.corpo.messaggio, 'The bot is receiving too many requests, try again in a few minutes.');
    // A chat over its own limit gets that answer, and does not use up the others'
    await limitatoreBotTotale.resetKey(CHIAVE_BOT_TOTALE);
    assert.equal((await daIndirizzo(870000)).corpo.codice, 'TROPPE_RICHIESTE_BOT');
  });

  it('without the right secret the global limit still counts, per address', async () => {
    for (let i = 0; i < 500; i++) {
      // A different chat every time: the chat does not matter without the secret
      assert.equal((await daIndirizzo(990000 + i, 'segreto-sbagliato')).stato, 403);
    }
    const oltre = await daIndirizzo(999999, 'segreto-sbagliato');
    assert.deepEqual([oltre.stato, oltre.corpo.codice], [429, 'TROPPE_RICHIESTE']);
  });
});
