// The guided creation of the Telegram bot: the exercises of a group come in a
// stable order (the user's most used, then alphabetical) a page at a time; a
// "Cardio / warm-up" category lists the cardio machines; /guidata tells about
// a draft that is not empty; "Finish" asks for the title, and the next text
// is the title, not a message for the AI; an exercise that left the catalog is
// taken out of the draft instead of making every "finish" fail.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, titoloDiOggi } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI, ESERCIZI_PER_PAGINA } from '../../src/services/bot.service.js';
import { TITOLO_MASSIMO } from '../../src/validators/bot.schema.js';

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
  impostaClientAI(null);
  await new Promise(risolvi => io.close(risolvi));
  await prisma.$disconnect();
  redis.disconnect();
});
beforeEach(async () => {
  await svuotaDatabase();
  const chiavi = await redis.keys('bot:*');
  if (chiavi.length) await redis.del(...chiavi);
  // Any call to Gemini that a test does not expect fails it
  geminiFinto([]);
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

/** A fake Gemini: each step is a `{ functionCalls }` or a `{ text }`; it counts the calls */
function geminiFinto(passi) {
  const chiamate = { numero: 0 };
  impostaClientAI({
    models: {
      generateContent: async () => {
        chiamate.numero++;
        const passo = passi.shift();
        if (!passo) throw new Error('Unexpected call to Gemini');
        return passo;
      }
    }
  });
  return chiamate;
}
const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });

async function statoSalvato(utente) {
  const raw = await redis.get(`bot:stato:${utente.id}`);
  return raw ? JSON.parse(raw) : null;
}
const schedeDi = utente => prisma.schedaAllenamento.findMany({ where: { creatoreId: utente.id }, include: { esercizi: true } });

/** A treadmill like the seed's: group "Cardio", equipment of the CARDIO category, no body region */
async function tapis() {
  const attrezzatura = await prisma.attrezzatura.create({ data: { nome: 'Tapis Roulant', categoria: 'CARDIO' } });
  return creaEsercizio({ nome: 'Treadmill', nomeIt: 'Tapis Roulant', gruppoMuscoloPrimario: 'Cardio', attrezzaturaRichiestaId: attrezzatura.id });
}

describe('bot guided creation: the exercises of a group, a page at a time', () => {
  it('the most used first, then alphabetical; 12 per page with the offsets of the other pages', async () => {
    const utente = await utenteCollegato();
    // Created out of order: the database order is not the one shown
    const nomi = ['Press', 'Arnold', 'Lateral', 'Zottman', 'Front', 'Upright', 'Shrug', 'Cuban', 'Bus', 'Y Raise', 'Halo', 'Face Pull', 'Dip', 'W Raise'];
    const esercizi = [];
    for (const nome of nomi) esercizi.push(await creaEsercizio({ nome, gruppoMuscoloPrimario: 'Spalle' }));
    await creaEsercizio({ nome: 'Other group', gruppoMuscoloPrimario: 'Petto' });
    // The user has "Zottman" in a plan: it comes first
    await creaScheda(utente, [esercizi[3]]);

    const alfabetico = ['Arnold', 'Bus', 'Cuban', 'Dip', 'Face Pull', 'Front', 'Halo', 'Lateral', 'Press', 'Shrug', 'Upright', 'W Raise', 'Y Raise'];
    const prima = (await bot('guida/esercizi', { gruppo: 'Spalle' })).corpo.dati;
    assert.equal(prima.esercizi.length, ESERCIZI_PER_PAGINA);
    assert.deepEqual(prima.esercizi.map(e => e.nome), ['Zottman', ...alfabetico.slice(0, 11)]);
    assert.deepEqual([prima.offset, prima.totale, prima.precedente, prima.successivo], [0, 14, null, 12]);
    assert.equal(prima.etichettaGruppo, 'Shoulders');

    const seconda = (await bot('guida/esercizi', { gruppo: 'Spalle', offset: 12 })).corpo.dati;
    assert.deepEqual(seconda.esercizi.map(e => e.nome), ['W Raise', 'Y Raise']);
    assert.deepEqual([seconda.offset, seconda.precedente, seconda.successivo], [12, 0, null]);

    // The same order at every request
    assert.deepEqual((await bot('guida/esercizi', { gruppo: 'Spalle' })).corpo.dati.esercizi, prima.esercizi);
    // An offset past the end (the catalog changed): the last page; the callback data is text
    const oltre = (await bot('guida/esercizi', { gruppo: 'Spalle', offset: '500' })).corpo.dati;
    assert.deepEqual([oltre.offset, oltre.esercizi.length], [12, 2]);
  });

  it('alphabetical by the name shown, in the user\'s language', async () => {
    const utente = await utenteCollegato('it');
    await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana' });
    await creaEsercizio({ nome: 'Push-up', nomeIt: 'Flessioni' });
    await creaEsercizio({ nome: 'Cable Fly', nomeIt: 'Croci ai cavi' });
    const italiano = (await bot('guida/esercizi', { gruppo: 'Petto' }, 'it')).corpo.dati.esercizi.map(e => e.nome);
    assert.deepEqual(italiano, ['Croci ai cavi', 'Flessioni', 'Panca piana']);
    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'en' } });
    const inglese = (await bot('guida/esercizi', { gruppo: 'Petto' })).corpo.dati.esercizi.map(e => e.nome);
    assert.deepEqual(inglese, ['Bench Press', 'Cable Fly', 'Push-up']);
  });

  it('a wrong offset is a clear 400, in the user\'s language', async () => {
    await utenteCollegato('it');
    for (const offset of [-1, 'abc', 1.5, 100001]) {
      const risposta = await bot('guida/esercizi', { gruppo: 'Petto', offset });
      assert.equal(risposta.stato, 400, String(offset));
      assert.equal(risposta.corpo.messaggio, 'La pagina non è valida');
    }
  });
});

describe('bot guided creation: "Cardio / warm-up"', () => {
  it('the categories say whether there is cardio; the list has the machines, marked cardio', async () => {
    await utenteCollegato();
    await creaEsercizio({ nome: 'Bench Press', bodyRegion: 'Parte Superiore' });
    assert.equal((await bot('guida/categorie')).corpo.dati.cardio, false);

    const macchina = await tapis();
    // Cardio by its equipment only
    const cyclette = await prisma.attrezzatura.create({ data: { nome: 'Cyclette', categoria: 'CARDIO' } });
    const bici = await creaEsercizio({ nome: 'Exercise Bike', gruppoMuscoloPrimario: 'Quadricipiti', attrezzaturaRichiestaId: cyclette.id });
    const categorie = (await bot('guida/categorie')).corpo.dati;
    assert.equal(categorie.cardio, true);
    // The machines have no body region: without the category no button shows them
    assert.deepEqual(categorie.regioni, ['Parte Superiore']);

    const elenco = (await bot('guida/esercizi', { soloCardio: true })).corpo.dati;
    assert.deepEqual(elenco.esercizi, [
      { id: bici.id, nome: 'Exercise Bike', cardio: true },
      { id: macchina.id, nome: 'Treadmill', cardio: true }
    ]);
    assert.deepEqual([elenco.precedente, elenco.successivo, elenco.etichettaGruppo], [null, null, null]);

    // Picked from there: the minutes buttons add a cardio entry
    const aggiunto = await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: '15' });
    assert.deepEqual(aggiunto.corpo.dati, { aggiunto: 'Treadmill', totaleEsercizi: 1, cardio: true, durataMinuti: 15 });
  });

  it('"soloCardio" must be true or false', async () => {
    await utenteCollegato();
    const risposta = await bot('guida/esercizi', { soloCardio: 'yes' });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'The "cardio" choice is not valid');
  });
});

describe('bot guided creation: a draft that is not empty', () => {
  it('the categories tell how many entries the draft has; "start again" empties it like /nuova', async () => {
    await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    assert.deepEqual((await bot('guida/categorie')).corpo.dati.bozza, { numEsercizi: 0 });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    assert.deepEqual((await bot('guida/categorie')).corpo.dati.bozza, { numEsercizi: 2 });
    assert.equal((await bot('annulla')).stato, 200);
    assert.deepEqual((await bot('guida/categorie')).corpo.dati.bozza, { numEsercizi: 0 });
  });
});

describe('bot guided creation: the title', () => {
  it('"Finish" proposes the default title; the next text is the title, and the AI is not called', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    const gemini = geminiFinto([]);

    const domanda = await bot('guida/titolo');
    assert.equal(domanda.stato, 200);
    assert.deepEqual(domanda.corpo.dati, { titoloProposto: titoloDiOggi('en'), numEsercizi: 1 });

    const risposta = await bot('messaggio', { testo: '  Pull <day> & more  ' });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.scheda.titolo, 'Pull <day> & more');
    assert.equal(risposta.corpo.dati.scheda.numEsercizi, 1);
    assert.deepEqual(risposta.corpo.dati.scheda.tolti, []);
    assert.equal(gemini.numero, 0);
    const [scheda] = await schedeDi(utente);
    assert.equal(scheda.titolo, 'Pull <day> & more');
    const stato = await statoSalvato(utente);
    assert.equal(stato.bozza.esercizi.length, 0);
    assert.equal(stato.attesaTitoloFino, undefined);
  });

  it('"Use the suggested title": the default one, in the user\'s language', async () => {
    const utente = await utenteCollegato('it');
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    assert.equal((await bot('guida/titolo', {}, 'it')).corpo.dati.titoloProposto, titoloDiOggi('it'));
    assert.match(titoloDiOggi('it'), /^Scheda del \d{2}\/\d{2}$/);
    const fine = await bot('guida/termina', {}, 'it');
    assert.equal(fine.stato, 200);
    assert.equal(fine.corpo.dati.titolo, titoloDiOggi('it'));
    assert.equal((await schedeDi(utente)).length, 1);
    // The wait is over: the next text goes to the AI
    const gemini = geminiFinto([{ text: 'Ciao!' }]);
    assert.equal((await bot('messaggio', { testo: 'ciao' }, 'it')).corpo.dati.risposta, 'Ciao!');
    assert.equal(gemini.numero, 1);
  });

  it('the default title has today in the user\'s time zone, also for an empty title and the AI without one', async () => {
    // UTC+14: for most of the day a different date from the gym's
    const utente = await utenteCollegato();
    await prisma.utente.update({ where: { id: utente.id }, data: { fusoOrario: 'Pacific/Kiritimati' } });
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    assert.equal((await bot('guida/titolo')).corpo.dati.titoloProposto, titoloDiOggi('en', 'Pacific/Kiritimati'));
    assert.equal((await bot('guida/termina', { titolo: '   ' })).corpo.dati.titolo, titoloDiOggi('en', 'Pacific/Kiritimati'));

    geminiFinto([chiama('aggiungi_esercizio', { esercizioId: esercizio.id }), chiama('termina_scheda', {}), { text: 'Saved!' }]);
    assert.equal((await bot('messaggio', { testo: 'row, done' })).stato, 200);
    const titoli = (await schedeDi(utente)).map(s => s.titolo);
    assert.deepEqual(titoli, [titoloDiOggi('en', 'Pacific/Kiritimati'), titoloDiOggi('en', 'Pacific/Kiritimati')]);
  });

  it(`a title longer than ${TITOLO_MASSIMO} characters is refused and the draft still waits for one`, async () => {
    const utente = await utenteCollegato('it');
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    await bot('guida/titolo');

    const lungo = await bot('messaggio', { testo: 'x'.repeat(TITOLO_MASSIMO + 1) });
    assert.equal(lungo.stato, 400);
    assert.equal(lungo.corpo.messaggio, 'Il titolo è troppo lungo (al massimo 100 caratteri)');
    const dalPulsante = await bot('guida/termina', { titolo: 'x'.repeat(TITOLO_MASSIMO + 1) });
    assert.equal(dalPulsante.stato, 400);
    assert.equal(dalPulsante.corpo.messaggio, 'Il titolo è troppo lungo (al massimo 100 caratteri)');
    assert.equal((await schedeDi(utente)).length, 0);

    assert.equal((await bot('messaggio', { testo: 'x'.repeat(TITOLO_MASSIMO) })).stato, 200);
    assert.equal((await schedeDi(utente))[0].titolo, 'x'.repeat(TITOLO_MASSIMO));
  });

  it('adding another exercise or going back to the categories ends the wait', async () => {
    await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });

    await bot('guida/titolo');
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    let gemini = geminiFinto([{ text: 'Sure' }]);
    assert.equal((await bot('messaggio', { testo: 'add a squat' })).corpo.dati.risposta, 'Sure');
    assert.equal(gemini.numero, 1);

    await bot('guida/titolo');
    assert.equal((await bot('guida/categorie')).stato, 200);
    gemini = geminiFinto([{ text: 'Sure' }]);
    assert.equal((await bot('messaggio', { testo: 'add a squat' })).corpo.dati.risposta, 'Sure');
    assert.equal(gemini.numero, 1);
  });

  it('a wait that has expired: the text goes to the AI', async () => {
    const utente = await utenteCollegato();
    const esercizio = await creaEsercizio({ nome: 'Row' });
    await bot('guida/aggiungi', { esercizioId: esercizio.id });
    await bot('guida/titolo');
    const stato = await statoSalvato(utente);
    stato.attesaTitoloFino = Date.now() - 1000;
    await redis.set(`bot:stato:${utente.id}`, JSON.stringify(stato), 'EX', 3600);
    const gemini = geminiFinto([{ text: 'Hi' }]);
    assert.equal((await bot('messaggio', { testo: 'hello' })).corpo.dati.risposta, 'Hi');
    assert.equal(gemini.numero, 1);
    assert.equal((await schedeDi(utente)).length, 0);
  });

  it('"Finish" with an empty draft: a clear 400, nothing waits for a title', async () => {
    const utente = await utenteCollegato();
    const risposta = await bot('guida/titolo');
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'The draft is empty: add at least one exercise.');
    assert.equal(await statoSalvato(utente), null);
  });
});

describe('bot: an exercise no longer in the catalog is taken out of the draft', () => {
  it('guided: the plan is saved without it, and the answer says which', async () => {
    const utente = await utenteCollegato();
    const resta = await creaEsercizio({ nome: 'Squat' });
    const sparito = await creaEsercizio({ nome: 'Lunge', nomeIt: 'Affondo' });
    await bot('guida/aggiungi', { esercizioId: resta.id });
    await bot('guida/aggiungi', { esercizioId: sparito.id });
    await bot('guida/aggiungi', { esercizioId: sparito.id });
    await prisma.esercizio.delete({ where: { id: sparito.id } });

    const fine = await bot('guida/termina', { titolo: 'Legs' });
    assert.equal(fine.stato, 200);
    assert.deepEqual([fine.corpo.dati.numEsercizi, fine.corpo.dati.tolti], [1, ['Lunge']]);
    const [scheda] = await schedeDi(utente);
    assert.deepEqual(scheda.esercizi.map(e => [e.esercizioId, e.ordineEsecuzione]), [[resta.id, 1]]);
  });

  it('guided, with the title written as text: the same', async () => {
    await utenteCollegato('it');
    const resta = await creaEsercizio({ nome: 'Squat' });
    const sparito = await creaEsercizio({ nome: 'Lunge', nomeIt: 'Affondo' });
    await bot('guida/aggiungi', { esercizioId: resta.id });
    await bot('guida/aggiungi', { esercizioId: sparito.id });
    await bot('guida/titolo');
    await prisma.esercizio.delete({ where: { id: sparito.id } });
    const risposta = await bot('messaggio', { testo: 'Gambe' }, 'it');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.scheda.tolti, ['Affondo']);
    assert.equal(risposta.corpo.dati.scheda.numEsercizi, 1);
  });

  it('guided: nothing left is a clear 400 and an empty draft, so it does not fail forever', async () => {
    const utente = await utenteCollegato();
    const sparito = await creaEsercizio({ nome: 'Lunge' });
    await bot('guida/aggiungi', { esercizioId: sparito.id });
    await prisma.esercizio.delete({ where: { id: sparito.id } });

    const fine = await bot('guida/termina');
    assert.equal(fine.stato, 400);
    assert.equal(fine.corpo.messaggio, 'The exercises in your draft are no longer in the catalog (Lunge): the draft is now empty, add new ones.');
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
    assert.equal((await schedeDi(utente)).length, 0);
    // In Italian too
    await prisma.utente.update({ where: { id: utente.id }, data: { lingua: 'it' } });
    const ancora = await bot('guida/termina', {}, 'it');
    assert.equal(ancora.stato, 400);
    assert.equal(ancora.corpo.messaggio, 'La bozza è vuota: aggiungi almeno un esercizio.');
  });

  it('AI: the plan is saved without it, and the reply ends with what was taken out', async () => {
    const utente = await utenteCollegato();
    const resta = await creaEsercizio({ nome: 'Squat' });
    const sparito = await creaEsercizio({ nome: 'Lunge' });
    geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: resta.id, serie: 5, ripetizioni: '5' }),
      chiama('aggiungi_esercizio', { esercizioId: sparito.id, serie: 3, ripetizioni: '10' }),
      { text: 'Added' }
    ]);
    await bot('messaggio', { testo: 'squat and lunges' });
    await prisma.esercizio.delete({ where: { id: sparito.id } });

    geminiFinto([chiama('termina_scheda', { titolo: 'Legs' }), { text: 'Saved!' }]);
    const risposta = await bot('messaggio', { testo: 'done' });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.risposta, 'Saved!\n\n⚠️ Removed from the plan, no longer in the catalog: Lunge.');
    const [scheda] = await schedeDi(utente);
    assert.equal(scheda.esercizi.length, 1);
  });

  it('AI: nothing left empties the draft and the reply says so', async () => {
    const utente = await utenteCollegato('it');
    const sparito = await creaEsercizio({ nome: 'Lunge', nomeIt: 'Affondo' });
    geminiFinto([chiama('aggiungi_esercizio', { esercizioId: sparito.id }), { text: 'Aggiunto' }]);
    await bot('messaggio', { testo: 'affondi' }, 'it');
    await prisma.esercizio.delete({ where: { id: sparito.id } });

    geminiFinto([chiama('termina_scheda', { titolo: 'Gambe' }), { text: 'La bozza è vuota.' }]);
    const risposta = await bot('messaggio', { testo: 'fatto' }, 'it');
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.risposta,
      'La bozza è vuota.\n\nGli esercizi della bozza non sono più nel catalogo (Affondo): la bozza ora è vuota, aggiungine di nuovi.');
    assert.equal((await statoSalvato(utente)).bozza.esercizi.length, 0);
    assert.equal((await schedeDi(utente)).length, 0);
  });
});
