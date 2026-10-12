// The Telegram bot's routes answer in the language of the linked user's
// account (Profile, otherwise the one the app last used), whatever Telegram
// says; an unlinked chat gets Telegram's, from Accept-Language.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';

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
    assert.equal(fine.corpo.dati.titolo, 'Plan from Telegram');
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
