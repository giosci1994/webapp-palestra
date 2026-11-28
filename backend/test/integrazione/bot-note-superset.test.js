// Notes and supersets from the Telegram bot: the AI can give a strength entry
// a technique note and join entries next to each other into a superset or
// circuit (unisci_superset, with the app's rules: no cardio, no warm-up);
// the guided creation has "Note" (the next text is the note of the last
// entry) and "Join the previous one". The saved plan has the groups numbered
// 1, 2... and the notes; the plan's details show them, escaped.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI } from '../../src/services/bot.service.js';

const SEGRETO = 'segreto-di-prova-del-bot';
const CHAT_ID = 777011;

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

/**
 * A fake Gemini: each step is a `{ functionCalls }` or a `{ text }`. It keeps
 * the function responses it receives, to read what the bot told the model.
 */
function geminiFinto(passi) {
  const registro = { numero: 0, risposte: [] };
  impostaClientAI({
    models: {
      generateContent: async ({ contents }) => {
        registro.numero++;
        const ultimo = contents.at(-1);
        for (const parte of ultimo?.parts || []) if (parte.functionResponse) registro.risposte.push(parte.functionResponse);
        const passo = passi.shift();
        if (!passo) throw new Error('Unexpected call to Gemini');
        return passo;
      }
    }
  });
  return registro;
}
const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });

async function statoSalvato(utente) {
  const raw = await redis.get(`bot:stato:${utente.id}`);
  return raw ? JSON.parse(raw) : null;
}
const voci = async utente => (await prisma.schedaAllenamento.findFirst({
  where: { creatoreId: utente.id },
  include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } }
})).esercizi;

/** A treadmill like the seed's: group "Cardio", equipment of the CARDIO category */
async function tapis() {
  const attrezzatura = await prisma.attrezzatura.create({ data: { nome: 'Tapis Roulant', categoria: 'CARDIO' } });
  return creaEsercizio({ nome: 'Treadmill', nomeIt: 'Tapis Roulant', gruppoMuscoloPrimario: 'Cardio', attrezzaturaRichiestaId: attrezzatura.id });
}

describe('bot AI: notes and supersets', () => {
  it('a note on aggiungi_esercizio, then unisci_superset: the plan has the group and the note', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    const rematore = await creaEsercizio({ nome: 'Barbell Row' });
    const curl = await creaEsercizio({ nome: 'Curl' });
    const gemini = geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: panca.id, serie: 4, ripetizioni: '8', note: '  scapole addotte  ' }),
      chiama('aggiungi_esercizio', { esercizioId: rematore.id, serie: 4, ripetizioni: '8' }),
      chiama('aggiungi_esercizio', { esercizioId: curl.id, serie: 3, ripetizioni: '12', note: '' }),
      chiama('unisci_superset', { posizioni: [2, 1] }),
      chiama('mostra_bozza'),
      chiama('termina_scheda', { titolo: 'Push pull' }),
      { text: 'Saved!' }
    ]);
    const risposta = await bot('messaggio', { testo: 'bench and row in superset, then curls' });
    assert.equal(risposta.stato, 200);

    const unito = gemini.risposte.find(r => r.name === 'unisci_superset').response;
    assert.deepEqual({ ok: unito.ok, gruppo: unito.gruppo, tipo: unito.tipo, membri: unito.membri }, { ok: true, gruppo: 'A', tipo: 'superset', membri: 2 });
    const riepilogo = gemini.risposte.find(r => r.name === 'mostra_bozza').response.riepilogo;
    assert.equal(riepilogo, [
      'Title: (to be defined)',
      'Items (3):',
      '🔗 Superset A',
      '1 · A1. Bench Press — 4x8',
      '   📝 scapole addotte',
      '2 · A2. Barbell Row — 4x8 (rest 90s after the round)',
      '3. Curl — 3x12 (rest 90s)'
    ].join('\n'));

    const salvate = await voci(utente);
    assert.deepEqual(salvate.map(v => [v.esercizioId, v.gruppo, v.note, v.recuperoSecondi]), [
      [panca.id, 1, 'scapole addotte', 0],
      [rematore.id, 1, null, 90],
      [curl.id, null, null, 90]
    ]);
  });

  it('unisci_superset refused: not next to each other, out of the draft, cardio, too few; nothing changes', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    const rematore = await creaEsercizio({ nome: 'Barbell Row' });
    const macchina = await tapis();
    await bot('guida/aggiungi', { esercizioId: panca.id });
    await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: 10 });
    await bot('guida/aggiungi', { esercizioId: rematore.id });
    const prima = (await statoSalvato(utente)).bozza.esercizi;

    const gemini = geminiFinto([
      chiama('unisci_superset', { posizioni: [1, 3] }),
      chiama('unisci_superset', { posizioni: [3, 4] }),
      chiama('unisci_superset', { posizioni: [1, 2] }),
      chiama('unisci_superset', { posizioni: [2] }),
      // Two calls in one round: the bot answers Gemini at most six times per message
      { functionCalls: [{ name: 'unisci_superset', args: { posizioni: [0, 1] } }, { name: 'unisci_superset', args: { posizioni: 'all' } }] },
      { text: 'Cannot' }
    ]);
    assert.equal((await bot('messaggio', { testo: 'superset please' })).stato, 200);
    const errori = gemini.risposte.map(r => r.response.errore);
    assert.deepEqual(errori, [
      'The entries to join must be next to each other in the draft',
      'Posizione 4 fuori dalla bozza: le voci sono 3.',
      'Cardio e riscaldamento non si uniscono in un superset (posizione 2).',
      'At least two positions of the draft are needed (numbers from 1)',
      'The position is not valid (a number from 1, as in the draft summary)',
      'At least two positions of the draft are needed (numbers from 1)'
    ]);
    assert.deepEqual((await statoSalvato(utente)).bozza.esercizi, prima);
  });

  it('separa_superset and rimuovi_ultimo: the new last member takes the rest after the round', async () => {
    const utente = await utenteCollegato();
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(nome => creaEsercizio({ nome })));
    const gemini = geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: a.id, serie: 3, ripetizioni: '10', recuperoSecondi: 60 }),
      chiama('aggiungi_esercizio', { esercizioId: b.id, serie: 3, ripetizioni: '10', recuperoSecondi: 60 }),
      chiama('aggiungi_esercizio', { esercizioId: c.id, serie: 3, ripetizioni: '10', recuperoSecondi: 120 }),
      chiama('unisci_superset', { posizioni: [1, 2, 3] }),
      chiama('separa_superset', { posizione: 9 }),
      chiama('rimuovi_ultimo'),
      { text: 'Done' }
    ]);
    assert.equal((await bot('messaggio', { testo: 'circuit, then drop the last' })).stato, 200);
    assert.equal(gemini.risposte[3].response.tipo, 'circuito');
    assert.equal(gemini.risposte[4].response.errore, 'Posizione 9 fuori dalla bozza: le voci sono 3.');
    const bozza = (await statoSalvato(utente)).bozza.esercizi;
    assert.deepEqual(bozza.map(e => [e.esercizioId, e.gruppo, e.recuperoSecondi]), [[a.id, 1, 0], [b.id, 1, 120]]);

    geminiFinto([chiama('separa_superset', { posizione: 1 }), chiama('separa_superset', { posizione: 1 }), { text: 'Ok' }]);
    assert.equal((await bot('messaggio', { testo: 'split it' })).stato, 200);
    assert.deepEqual((await statoSalvato(utente)).bozza.esercizi.map(e => e.gruppo), [null, null]);
  });

  it('a note that is not text goes back to the model as an error', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    const gemini = geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: panca.id, serie: 3, ripetizioni: '8', note: 42 }),
      { text: 'Oops' }
    ]);
    assert.equal((await bot('messaggio', { testo: 'bench' })).stato, 200);
    assert.equal(gemini.risposte[0].response.errore, 'The notes must be text');
    assert.equal(await statoSalvato(utente).then(s => s.bozza.esercizi.length), 0);
  });
});

describe('bot guided creation: "Note"', () => {
  it('the next text becomes the note of the last entry, without the AI; the summary shows it escaped', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench <Press>' });
    const aggiunto = await bot('guida/aggiungi', { esercizioId: panca.id, serie: 3, ripetizioni: '8' });
    assert.equal(aggiunto.corpo.dati.nota, true);
    assert.equal(aggiunto.corpo.dati.unibile, false);
    const gemini = geminiFinto([]);

    const domanda = await bot('guida/nota');
    assert.equal(domanda.stato, 200);
    assert.deepEqual(domanda.corpo.dati, { nome: 'Bench <Press>', nota: null });

    const risposta = await bot('messaggio', { testo: '  elbows <45°> & slow  ' });
    assert.equal(risposta.stato, 200);
    assert.equal(gemini.numero, 0);
    const { nota } = risposta.corpo.dati;
    assert.equal(nota.nome, 'Bench <Press>');
    assert.equal(nota.riepilogo, 'Title: (to be defined)\nItems (1):\n1. Bench &lt;Press&gt; — 3x8 (rest 90s)\n   📝 elbows &lt;45°&gt; &amp; slow');
    const stato = await statoSalvato(utente);
    assert.equal(stato.bozza.esercizi[0].note, 'elbows <45°> & slow');
    assert.equal(stato.attesaNotaFino, undefined);

    // A long note is short in the summary, whole in the plan
    await bot('guida/nota');
    const lunga = 'x'.repeat(300);
    assert.match((await bot('messaggio', { testo: lunga })).corpo.dati.nota.riepilogo, /📝 x{39}…$/);
    await bot('guida/termina', { titolo: 'Push' });
    assert.equal((await voci(utente))[0].note, lunga);
  });

  it('a wait that has expired: the text goes to the AI', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    await bot('guida/aggiungi', { esercizioId: panca.id });
    await bot('guida/nota');
    const stato = await statoSalvato(utente);
    stato.attesaNotaFino = Date.now() - 1000;
    await redis.set(`bot:stato:${utente.id}`, JSON.stringify(stato), 'EX', 3600);
    const gemini = geminiFinto([{ text: 'Hi' }]);
    assert.equal((await bot('messaggio', { testo: 'hello' })).corpo.dati.risposta, 'Hi');
    assert.equal(gemini.numero, 1);
    assert.equal((await statoSalvato(utente)).bozza.esercizi[0].note, undefined);
  });

  it('/annulla, another exercise, the categories or "Finish" end the wait', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    for (const fine of [
      () => bot('annulla'),
      () => bot('guida/aggiungi', { esercizioId: panca.id }),
      () => bot('guida/categorie'),
      () => bot('guida/titolo')
    ]) {
      await bot('guida/aggiungi', { esercizioId: panca.id });
      assert.equal((await bot('guida/nota')).stato, 200);
      await fine();
      const stato = await statoSalvato(utente);
      assert.equal(stato?.attesaNotaFino, undefined);
    }
    // After "Finish" the next text is the title, not the note
    assert.equal((await bot('messaggio', { testo: 'Chest day' })).corpo.dati.scheda.titolo, 'Chest day');
    assert.ok((await voci(utente)).every(v => v.note === null));
  });

  it('cardio has no note, as in the app; an empty draft has nothing to note', async () => {
    await utenteCollegato('it');
    assert.equal((await bot('guida/nota', {}, 'it')).corpo.messaggio, 'La bozza è vuota: aggiungi almeno un esercizio.');
    const macchina = await tapis();
    const aggiunto = await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: 15 }, 'it');
    assert.equal(aggiunto.corpo.dati.nota, false);
    const risposta = await bot('guida/nota', {}, 'it');
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'La nota si mette su un esercizio di forza: il cardio non ha note, come nell\'app.');
  });
});

describe('bot guided creation: "Join the previous one"', () => {
  it('two make a superset, a third joins it as a circuit; the saved plan has the group and the rests', async () => {
    const utente = await utenteCollegato();
    const [a, b, c] = await Promise.all(['Squat', 'Lunge', 'Calf <raise>'].map(nome => creaEsercizio({ nome })));
    await bot('guida/aggiungi', { esercizioId: a.id });
    const secondo = await bot('guida/aggiungi', { esercizioId: b.id });
    assert.equal(secondo.corpo.dati.unibile, true);

    const unito = await bot('guida/unisci');
    assert.equal(unito.stato, 200);
    assert.deepEqual([unito.corpo.dati.gruppo, unito.corpo.dati.tipo, unito.corpo.dati.unibile, unito.corpo.dati.nota], ['A', 'superset', false, true]);

    assert.equal((await bot('guida/aggiungi', { esercizioId: c.id })).corpo.dati.unibile, true);
    const circuito = await bot('guida/unisci');
    assert.equal(circuito.corpo.dati.tipo, 'circuito');
    assert.equal(circuito.corpo.dati.riepilogo, [
      'Title: (to be defined)', 'Items (3):', '🔗 Circuit A',
      '1 · A1. Squat — 3x8-12', '2 · A2. Lunge — 3x8-12', '3 · A3. Calf &lt;raise&gt; — 3x8-12 (rest 90s after the round)'
    ].join('\n'));

    await bot('guida/termina', { titolo: 'Legs' });
    assert.deepEqual((await voci(utente)).map(v => [v.gruppo, v.recuperoSecondi]), [[1, 0], [1, 0], [1, 90]]);
  });

  it('not with cardio, not alone, not twice: a clear 400 and the draft as it was', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    const macchina = await tapis();
    await bot('guida/aggiungi', { esercizioId: panca.id });
    assert.equal((await bot('guida/unisci')).stato, 400);
    const conCardio = await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: 10 });
    assert.equal(conCardio.corpo.dati.unibile, false);
    const rifiuto = await bot('guida/unisci');
    assert.equal(rifiuto.stato, 400);
    assert.equal(rifiuto.corpo.messaggio, 'The last entry cannot be joined to the one before: two strength exercises are needed, not already together.');
    assert.ok((await statoSalvato(utente)).bozza.esercizi.every(e => e.gruppo == null));
  });
});

describe('bot: plan details with notes', () => {
  it('the notes of a plan from the app are shown, escaped and shortened, under their entry', async () => {
    const utente = await utenteCollegato();
    const [a, b] = await Promise.all([creaEsercizio({ nome: 'Dip' }), creaEsercizio({ nome: 'Pull-up' })]);
    const scheda = await creaScheda(utente, [a, b]);
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: a.id }, data: { note: '<b>lean</b> & go', gruppo: 4 } });
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: b.id }, data: { note: 'y'.repeat(250), gruppo: 4 } });

    const risposta = await bot('scheda', { schedaId: scheda.id });
    assert.equal(risposta.stato, 200);
    const righe = risposta.corpo.dati.testo.split('\n');
    assert.deepEqual(righe.slice(3), [
      '🔗 Superset A',
      'A1. Dip — 3x8-12',
      '   📝 &lt;b&gt;lean&lt;/b&gt; &amp; go',
      'A2. Pull-up — 3x8-12',
      `   📝 ${'y'.repeat(199)}…`
    ]);
  });
});
