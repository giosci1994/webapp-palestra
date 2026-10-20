// A notification reaches Telegram too, for whoever linked it in Profile and
// does not have the app open (as chat messages already did). No real message:
// the calls to the Telegram API are intercepted.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente } from '../supporto/dati.js';
import { creaNotifica } from '../../src/services/notifiche.service.js';

let messaggi;
const fetchVero = globalThis.fetch;

before(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'token-di-prova';
  mock.method(globalThis, 'fetch', async (indirizzo, opzioni) => {
    if (!String(indirizzo).startsWith('https://api.telegram.org/')) return fetchVero(indirizzo, opzioni);
    messaggi.push(JSON.parse(opzioni.body));
    return new Response('{"ok":true}', { status: 200 });
  });
});
after(async () => {
  mock.restoreAll();
  delete process.env.TELEGRAM_BOT_TOKEN;
  await prisma.$disconnect();
});
beforeEach(async () => {
  await svuotaDatabase();
  messaggi = [];
});

/** A socket.io stand-in: the user has `connessioni` open connections */
const io = connessioni => ({
  to: () => ({ emit() {} }),
  in: () => ({ fetchSockets: async () => Array.from({ length: connessioni }) })
});
const collega = (utente, chatId) => prisma.collegamentoTelegram.create({ data: { utenteId: utente.id, telegramChatId: BigInt(chatId) } });
// creaNotifica does not wait for Telegram: a moment for the message to leave
const pausa = () => new Promise(r => setTimeout(r, 150));

describe('notifications on Telegram', () => {
  it('reach a linked user without the app open, in their language, with the link to the page', async () => {
    const utente = await creaUtente({ lingua: 'en' });
    await collega(utente, 4242);
    await creaNotifica(io(0), utente.id, {
      titolo: 'ptRoutes.richiestaAccettataTitolo',
      messaggio: 'ptRoutes.richiestaAccettataMessaggio',
      variabili: { nome: 'Coach <Anna>' },
      percorso: '/trova-pt'
    });
    await pausa();
    assert.equal(messaggi.length, 1);
    const [{ chat_id, text, parse_mode }] = messaggi;
    assert.equal(chat_id, 4242);
    assert.equal(parse_mode, 'HTML');
    const salvata = await prisma.allenamentoNotifica.findFirst({ where: { utenteId: utente.id } });
    assert.ok(text.startsWith(`🔔 <b>${salvata.titolo}</b>`), text);
    assert.match(text, /Coach &lt;Anna&gt;/);
    assert.match(text, /<a href="https:\/\/palestra\.test\/trova-pt">Open in GymMaster<\/a>$/);
  });

  it('not to whoever has the app open, nor to whoever never linked Telegram', async () => {
    const aperta = await creaUtente();
    await collega(aperta, 1);
    const senzaTelegram = await creaUtente();
    await creaNotifica(io(1), aperta.id, { titolo: 'Titolo', messaggio: 'Testo' });
    await creaNotifica(io(0), senzaTelegram.id, { titolo: 'Titolo', messaggio: 'Testo' });
    await pausa();
    assert.equal(messaggi.length, 0);
    // The notification is saved all the same
    assert.equal(await prisma.allenamentoNotifica.count(), 2);
  });

  it('from a timer without socket.io, the user counts as not connected', async () => {
    const utente = await creaUtente();
    await collega(utente, 7);
    await creaNotifica(null, utente.id, { titolo: 'Promemoria', messaggio: 'Scheda A' });
    await pausa();
    assert.equal(messaggi.length, 1);
    assert.equal(messaggi[0].chat_id, 7);
  });
});
