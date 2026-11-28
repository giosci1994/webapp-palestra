// Cardio entries stay cardio in the Telegram bot: a cardio machine picked in
// the guided creation (from "most used" too) or added by the AI as an
// exercise becomes a CARDIO entry with its minutes, never sets x reps; a
// cardio entry without minutes takes the default; the plan's details show a
// cardio entry as cardio even when it only has an incline.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda } from '../supporto/dati.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';
import { impostaClientAI } from '../../src/services/bot.service.js';
import { DURATA_CARDIO_PREDEFINITA } from '../../src/validators/bot.schema.js';

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
  // The ids start again after each cleanup: no draft or rate limit left over
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

async function utenteCollegato() {
  const utente = await creaUtente({ lingua: 'en' });
  await prisma.collegamentoTelegram.create({
    data: { utenteId: utente.id, telegramChatId: BigInt(CHAT_ID), collegatoIl: new Date() }
  });
  return utente;
}

/** A fake Gemini that answers with the given steps, one per call */
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
  return { richieste };
}

const chiama = (name, args = {}) => ({ functionCalls: [{ name, args }] });
const rispostaFunzione = richiesta => richiesta.contents.at(-1).parts[0].functionResponse.response;

/** The entries of the user's only plan, as saved */
async function vociSalvate(utente) {
  const schede = await prisma.schedaAllenamento.findMany({
    where: { creatoreId: utente.id }, include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } }
  });
  assert.equal(schede.length, 1);
  return schede[0].esercizi;
}

/** A treadmill like the seed's: group "Cardio", equipment of the CARDIO category */
async function tapis() {
  const attrezzatura = await prisma.attrezzatura.create({ data: { nome: 'Tapis Roulant', categoria: 'CARDIO' } });
  return creaEsercizio({ nome: 'Treadmill', nomeIt: 'Tapis Roulant', gruppoMuscoloPrimario: 'Cardio', attrezzaturaRichiestaId: attrezzatura.id });
}

describe('bot guided creation: cardio', () => {
  it('a treadmill from "most used" is marked cardio and saved as a cardio entry with its minutes', async () => {
    const utente = await utenteCollegato();
    const macchina = await tapis();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    await creaScheda(utente, [macchina, panca]);

    const usati = (await bot('guida/esercizi', { soloPiuUsati: true })).corpo.dati.esercizi;
    assert.deepEqual(usati.map(e => [e.nome, e.cardio]).sort(), [['Bench Press', false], ['Treadmill', true]]);

    const aggiunto = await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: '20' });
    assert.equal(aggiunto.stato, 200);
    assert.deepEqual(aggiunto.corpo.dati, { aggiunto: 'Treadmill', totaleEsercizi: 1, cardio: true, durataMinuti: 20 });
    await bot('guida/termina', { titolo: 'Run' });

    await prisma.schedaAllenamento.deleteMany({ where: { titolo: { not: 'Run' } } });
    const [voce] = await vociSalvate(utente);
    assert.deepEqual(
      [voce.esercizioId, voce.durataMinuti, voce.serieTarget, voce.repTarget, voce.recuperoSecondi, voce.riscaldamento],
      [macchina.id, 20, 1, null, 0, false]
    );
  });

  it('an old sets x reps button on a cardio machine still saves cardio, with the default minutes', async () => {
    const utente = await utenteCollegato();
    // Cardio by its equipment only
    const attrezzatura = await prisma.attrezzatura.create({ data: { nome: 'Cyclette', categoria: 'CARDIO' } });
    const bici = await creaEsercizio({ nome: 'Exercise Bike', gruppoMuscoloPrimario: 'Quadricipiti', attrezzaturaRichiestaId: attrezzatura.id });

    const aggiunto = await bot('guida/aggiungi', { esercizioId: bici.id, serie: 3, ripetizioni: '8' });
    assert.equal(aggiunto.corpo.dati.cardio, true);
    assert.equal(aggiunto.corpo.dati.durataMinuti, DURATA_CARDIO_PREDEFINITA);
    await bot('guida/termina');
    const [voce] = await vociSalvate(utente);
    assert.deepEqual([voce.durataMinuti, voce.serieTarget, voce.repTarget], [DURATA_CARDIO_PREDEFINITA, 1, null]);
  });

  it('a strength exercise keeps sets and reps', async () => {
    const utente = await utenteCollegato();
    const panca = await creaEsercizio({ nome: 'Bench Press' });
    const aggiunto = await bot('guida/aggiungi', { esercizioId: panca.id, serie: 4, ripetizioni: '10' });
    assert.equal(aggiunto.corpo.dati.cardio, false);
    assert.equal(aggiunto.corpo.dati.durataMinuti, undefined);
    await bot('guida/termina');
    const [voce] = await vociSalvate(utente);
    assert.deepEqual([voce.serieTarget, voce.repTarget, voce.recuperoSecondi, voce.durataMinuti], [4, '10', 90, null]);
  });

  it('minutes out of the app\'s limits are a 400', async () => {
    await utenteCollegato();
    const macchina = await tapis();
    assert.equal((await bot('guida/aggiungi', { esercizioId: macchina.id, durataMinuti: 99999 })).stato, 400);
  });
});

describe('bot AI: cardio', () => {
  it('aggiungi_esercizio with a cardio machine adds a cardio entry and tells the model', async () => {
    const utente = await utenteCollegato();
    const macchina = await tapis();

    const gemini = geminiFinto([
      chiama('aggiungi_esercizio', { esercizioId: macchina.id, serie: 3, ripetizioni: '8' }),
      { text: 'Added' },
      chiama('termina_scheda', { titolo: 'Cardio' }),
      { text: 'Saved' }
    ]);
    await bot('messaggio', { testo: 'treadmill' });
    const risultato = rispostaFunzione(gemini.richieste[1]);
    assert.equal(risultato.ok, true);
    assert.equal(risultato.cardio, true);
    assert.equal(risultato.durataMinuti, DURATA_CARDIO_PREDEFINITA);
    assert.match(risultato.nota, /aggiungi_cardio/);

    await bot('messaggio', { testo: 'done' });
    const [voce] = await vociSalvate(utente);
    assert.deepEqual([voce.durataMinuti, voce.serieTarget, voce.repTarget, voce.recuperoSecondi], [DURATA_CARDIO_PREDEFINITA, 1, null, 0]);
  });

  it('aggiungi_cardio without minutes saves the default minutes', async () => {
    const utente = await utenteCollegato();
    const macchina = await tapis();

    geminiFinto([
      chiama('aggiungi_cardio', { macchina: 'tapis roulant' }),
      chiama('termina_scheda', { titolo: 'Treadmill' }),
      { text: 'Saved' }
    ]);
    await bot('messaggio', { testo: 'I do the treadmill' });
    const [voce] = await vociSalvate(utente);
    assert.deepEqual([voce.esercizioId, voce.durataMinuti, voce.serieTarget], [macchina.id, DURATA_CARDIO_PREDEFINITA, 1]);
  });
});

describe('bot: plan details with cardio entries', () => {
  it('an entry with only an incline, and a cardio exercise without values, read as cardio', async () => {
    const utente = await utenteCollegato();
    const macchina = await tapis();
    const stepper = await creaEsercizio({ nome: 'Stepper', gruppoMuscoloPrimario: 'Cardio' });
    const scheda = await creaScheda(utente, [macchina, stepper]);
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: macchina.id }, data: { inclinazione: 5, serieTarget: 1, repTarget: null } });
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id, esercizioId: stepper.id }, data: { serieTarget: 1, repTarget: null, recuperoSecondi: 0 } });

    const testo = (await bot('scheda', { schedaId: scheda.id })).corpo.dati.testo;
    assert.match(testo, /1\. 🏃 Treadmill — .*5/);
    assert.match(testo, /2\. 🏃 Stepper$/m);
    assert.doesNotMatch(testo, /\{\w+\}/);
    assert.doesNotMatch(testo, /1x/);
  });

  it('a strength entry without reps has no placeholder left', async () => {
    const utente = await utenteCollegato();
    const plank = await creaEsercizio({ nome: 'Plank' });
    const scheda = await creaScheda(utente, [plank]);
    await prisma.esercizioScheda.updateMany({ where: { schedaId: scheda.id }, data: { repTarget: null } });
    const testo = (await bot('scheda', { schedaId: scheda.id })).corpo.dati.testo;
    assert.match(testo, /1\. Plank — 3x—/);
    assert.doesNotMatch(testo, /\{\w+\}/);
  });
});
