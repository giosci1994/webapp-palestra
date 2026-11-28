// The bot's texts and keyboards (bot/formato.js): pure functions, imported
// here because the bot is a separate package without tests of its own.
// Everything that comes from users or from the catalog is escaped for
// Telegram's HTML formatting.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, chiaveChat, messaggioErrore, testoComandoSconosciuto, testoAggiunto, testoSchedaSalvata,
  tastiera, tastieraSchede, tastieraCategorie, tastieraGruppi, tastieraEsercizi, tastieraSerie, tastieraMinuti, tastieraDopoAggiunta
} from '../../../bot/formato.js';

const utente = codice => ({ from: { language_code: codice }, chat: { id: 4242 } });
const en = utente('en');
const ita = utente('it');
/** Text and callback data of each button, row by row */
const bottoni = m => m.inline_keyboard.map(riga => riga.map(b => [b.text, b.callback_data]));

describe('bot formatting: escaping', () => {
  it('escapes & < > and leaves the Markdown characters alone (HTML ignores them)', () => {
    assert.equal(escapeHtml('Upper_A *heavy* [1] `v2` <b>&'), 'Upper_A *heavy* [1] `v2` &lt;b&gt;&amp;');
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
    assert.equal(escapeHtml(12), '12');
    assert.equal(escapeHtml(), '');
  });

  it('the exercise added: the name is escaped and in bold, the plural follows the count', () => {
    const forza = testoAggiunto(en, { aggiunto: 'Curl <EZ> & bar', totaleEsercizi: 2 }, 3, '8-12');
    assert.equal(forza, '✅ Added <b>Curl &lt;EZ&gt; &amp; bar</b> (3×8-12). Draft: 2 exercises.');
    const cardio = testoAggiunto(ita, { aggiunto: 'Tapis_roulant', cardio: true, durataMinuti: 15, totaleEsercizi: 1 });
    assert.equal(cardio, '✅ Aggiunto <b>Tapis_roulant</b> (15 min). Bozza: 1 esercizio.');
  });

  it('the plan saved: the title is escaped', () => {
    assert.equal(testoSchedaSalvata(en, { titolo: 'A <i>*', numEsercizi: 1 }), '🎉 Plan <b>A &lt;i&gt;*</b> saved with 1 exercise!\nSee it with /schede');
  });
});

describe('bot formatting: errors and unknown commands', () => {
  it('a chat not linked yet, a message from the backend, or the generic error', () => {
    assert.match(messaggioErrore(en, { status: 409, corpo: { codice: 'NON_COLLEGATO' } }), /not linked yet/);
    assert.equal(messaggioErrore(en, { status: 409, corpo: { codice: 'BOT_OCCUPATO', messaggio: 'Busy' } }), '⚠️ Busy');
    assert.equal(messaggioErrore(en, { status: 500, corpo: {} }), '⚠️ Something went wrong, please try again.');
    assert.equal(messaggioErrore(ita, { status: 0 }), '⚠️ Si è verificato un errore, riprova.');
  });

  it('an unknown command gets the list of commands, in the user\'s language', () => {
    for (const [ctx, inizio] of [[en, /^🤔 I don't know that command/], [ita, /^🤔 Non conosco questo comando/]]) {
      const testo = testoComandoSconosciuto(ctx);
      assert.match(testo, inizio);
      for (const comando of ['/nuova', '/guidata', '/schede', '/statistiche', '/annulla', '/start']) assert.ok(testo.includes(comando), comando);
    }
  });
});

describe('bot formatting: keyboards', () => {
  it('rows of [text, data] as Telegram takes them', () => {
    assert.deepEqual(tastiera([[['A', 'a'], ['B', 'b']], [['C', 'c']]]), {
      inline_keyboard: [[{ text: 'A', callback_data: 'a' }, { text: 'B', callback_data: 'b' }], [{ text: 'C', callback_data: 'c' }]]
    });
  });

  it('/schede: at most 20 plans, one per row, with the number of exercises (plain text: not escaped)', () => {
    const schede = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, titolo: `P_${i} <x>`, numEsercizi: i }));
    const righe = bottoni(tastieraSchede(schede));
    assert.equal(righe.length, 20);
    assert.deepEqual(righe[0], [['P_0 <x> (0)', 'scheda:1']]);
  });

  it('guided creation: the most used first, then regions and groups with their labels', () => {
    const categorie = bottoni(tastieraCategorie(en, { regioni: ['Core', 'Parte Superiore'], etichette: { 'Parte Superiore': 'Upper Body' } }));
    assert.deepEqual(categorie, [[['⭐ Your most used', 'gcat:__usati__']], [['Core', 'gcat:Core']], [['Upper Body', 'gcat:Parte Superiore']]]);
    assert.deepEqual(bottoni(tastieraGruppi({ gruppi: ['Petto'], etichette: { Petto: 'Chest' } })), [[['Chest', 'ggrp:Petto']]]);
    assert.deepEqual(bottoni(tastieraGruppi({})), []);
  });

  it('a cardio exercise asks for minutes, the others for sets x reps', () => {
    assert.deepEqual(bottoni(tastieraEsercizi([{ id: 7, nome: 'Bench' }, { id: 9, nome: 'Treadmill', cardio: true }])),
      [[['Bench', 'gex:7']], [['Treadmill', 'gcx:9']]]);
    assert.deepEqual(bottoni(tastieraSerie(7)), [
      [['3×8', 'gadd:7:3:8'], ['3×10', 'gadd:7:3:10'], ['3×12', 'gadd:7:3:12']],
      [['4×10', 'gadd:7:4:10'], ['4×12', 'gadd:7:4:12'], ['3×8-12', 'gadd:7:3:8-12']]
    ]);
    assert.deepEqual(bottoni(tastieraMinuti(9)), [[['10 min', 'gcadd:9:10'], ['15 min', 'gcadd:9:15'], ['20 min', 'gcadd:9:20'], ['30 min', 'gcadd:9:30']]]);
    assert.deepEqual(bottoni(tastieraDopoAggiunta(ita)), [[['➕ Aggiungi altro', 'gmenu'], ['✅ Termina', 'gfine']]]);
  });

  it('every callback data fits Telegram\'s 64 bytes', () => {
    const tutti = [tastieraSerie(2147483647), tastieraMinuti(2147483647), tastieraSchede([{ id: 2147483647, titolo: 'x', numEsercizi: 1 }])]
      .flatMap(m => m.inline_keyboard.flat().map(b => b.callback_data));
    assert.deepEqual(tutti.filter(d => Buffer.byteLength(d) > 64), []);
  });
});

describe('bot: updates in order per chat', () => {
  it('the key is the chat id; an update without a chat has none (no ordering)', () => {
    assert.equal(chiaveChat({ chat: { id: -100123 } }), '-100123');
    assert.equal(chiaveChat({}), undefined);
  });
});
