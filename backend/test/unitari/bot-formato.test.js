// The bot's texts and keyboards (bot/formato.js): pure functions, imported
// here because the bot is a separate package without tests of its own.
// Everything that comes from users or from the catalog is escaped for
// Telegram's HTML formatting.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, chiaveChat, messaggioErrore, testoComandoSconosciuto, testoAggiunto, testoSchedaSalvata, testoChiediTitolo,
  tastiera, tastieraSchede, tastieraCategorie, tastieraBozzaInCorso, tastieraGruppi, tastieraEsercizi, tastieraSerie, tastieraMinuti,
  tastieraDopoAggiunta, tastieraTitolo, datiPaginaGruppo, datiPaginaCardio,
  testoChiediNota, tastieraNota, testoNotaSalvata, testoUnito, dividiHtml, messaggiHtml, CARATTERI_MESSAGGIO_MASSIMI, messaggiSchede
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
    assert.equal(testoSchedaSalvata(en, { titolo: 'A <i>*', numEsercizi: 1 }), '🎉 Plan <b>A &lt;i&gt;*</b> saved with 1 exercise!\nSee it with /plans');
  });
});

describe('bot formatting: errors and unknown commands', () => {
  it('a chat not linked yet, a message from the backend, or the generic error', () => {
    assert.match(messaggioErrore(en, { status: 409, corpo: { codice: 'NON_COLLEGATO' } }), /not linked yet/);
    assert.equal(messaggioErrore(en, { status: 409, corpo: { codice: 'BOT_OCCUPATO', messaggio: 'Busy' } }), '⚠️ Busy');
    assert.equal(messaggioErrore(en, { status: 500, corpo: {} }), '⚠️ Something went wrong, please try again.');
    assert.equal(messaggioErrore(ita, { status: 0 }), '⚠️ Si è verificato un errore, riprova.');
  });

  it('an unknown command gets the list of commands, with the names of the user\'s language', () => {
    for (const [ctx, inizio, comandi] of [
      [en, /^🤔 I don't know that command/, ['/new', '/guided', '/plans', '/stats', '/cancel', '/start']],
      [ita, /^🤔 Non conosco questo comando/, ['/nuova', '/guidata', '/schede', '/statistiche', '/annulla', '/start']]
    ]) {
      const testo = testoComandoSconosciuto(ctx);
      assert.match(testo, inizio);
      for (const comando of comandi) assert.match(testo, new RegExp(`${comando} — `), comando);
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

  it('/schede: own plans, then global ones, each in a message with "…N more in the app"', () => {
    const scheda = (id, titolo) => ({ id, titolo, numEsercizi: 2 });
    const tutti = messaggiSchede(ita, { proprie: [scheda(1, 'Mia')], globali: [scheda(2, 'Palestra')], altreProprie: 3, altreGlobali: 1 });
    assert.deepEqual(tutti.map(([testo, extra]) => [testo, bottoni(extra.reply_markup)]), [
      ['📚 Le tue schede:\n…e altre 3 nell\'app.', [[['Mia (2)', 'scheda:1']]]],
      ['🌍 Schede globali:\n…e un\'altra nell\'app.', [[['Palestra (2)', 'scheda:2']]]]
    ]);
    // Nothing more in the app: just the heading
    assert.deepEqual(messaggiSchede(en, { proprie: [scheda(1, 'Mine')], globali: [], altreProprie: 0, altreGlobali: 0 }).map(([testo]) => testo), ['📚 Your plans:']);
    // No own plan: how to make one, then the global ones
    assert.deepEqual(messaggiSchede(en, { proprie: [], globali: [scheda(2, 'Gym')], altreProprie: 0, altreGlobali: 4 }).map(([testo]) => testo),
      ['You don\'t have any plans of your own yet. Create one with /new! 💪', '🌍 Global plans:\n…and 4 more in the app.']);
    assert.deepEqual(messaggiSchede(en, { proprie: [], globali: [] }), [['You don\'t have any plans yet. Create one with /new! 💪', {}]]);
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
    // The longest group name of the catalog is 18 bytes; offsets go up to 100000
    const gruppo = 'Flessori dell\'Anca';
    const tutti = [
      tastieraSerie(2147483647), tastieraMinuti(2147483647), tastieraSchede([{ id: 2147483647, titolo: 'x', numEsercizi: 1 }]),
      tastieraGruppi({ gruppi: [gruppo] }), tastieraCategorie(en, { cardio: true, regioni: ['Tutto il Corpo'] }),
      tastieraEsercizi([{ id: 2147483647, nome: 'x', cardio: true }], en, { precedente: 99988, successivo: 100000 }, o => datiPaginaGruppo(gruppo, o)),
      tastieraEsercizi([], en, { precedente: 99988, successivo: 100000 }, datiPaginaCardio),
      tastieraBozzaInCorso(en, 3), tastieraTitolo(en), tastieraDopoAggiunta(en, { nota: true, unibile: true }), tastieraNota(en)
    ].flatMap(m => m.inline_keyboard.flat().map(b => b.callback_data));
    assert.deepEqual(tutti.filter(d => Buffer.byteLength(d) > 64), []);
  });

  it('a button whose data would pass 64 bytes is left out, the others stay', () => {
    const lungo = 'à'.repeat(40);
    assert.deepEqual(bottoni(tastieraGruppi({ gruppi: ['Petto', lungo] })), [[['Petto', 'ggrp:Petto']]]);
    assert.deepEqual(bottoni(tastiera([[['A', 'a'], ['B', 'b'.repeat(65)]]])), [[['A', 'a']]]);
  });
});

describe('bot formatting: the guided creation, step by step', () => {
  it('the categories: "Cardio / warm-up" after the most used, only when the catalog has cardio', () => {
    assert.deepEqual(bottoni(tastieraCategorie(ita, { cardio: true, regioni: ['Core'] })),
      [[['⭐ I tuoi più usati', 'gcat:__usati__']], [['🏃 Cardio / riscaldamento', 'gcat:__cardio__']], [['Core', 'gcat:Core']]]);
    assert.deepEqual(bottoni(tastieraCategorie(en, { cardio: false, regioni: [] })), [[['⭐ Your most used', 'gcat:__usati__']]]);
  });

  it('a page of exercises: "◀ Back" and "More ▶" only towards the pages there are', () => {
    const es = [{ id: 1, nome: 'A' }, { id: 2, nome: 'B', cardio: true }];
    const versoPetto = o => datiPaginaGruppo('Petto', o);
    assert.deepEqual(bottoni(tastieraEsercizi(es, ita, { precedente: null, successivo: 12 }, versoPetto)),
      [[['A', 'gex:1']], [['B', 'gcx:2']], [['Altri ▶', 'gpg:12:Petto']]]);
    assert.deepEqual(bottoni(tastieraEsercizi(es, en, { precedente: 0, successivo: 24 }, versoPetto)).at(-1),
      [['◀ Back', 'gpg:0:Petto'], ['More ▶', 'gpg:24:Petto']]);
    assert.deepEqual(bottoni(tastieraEsercizi(es, en, { precedente: 12, successivo: null }, datiPaginaCardio)).at(-1), [['◀ Back', 'gcar:12']]);
    // One page only, or no navigation asked for: no extra row
    assert.equal(bottoni(tastieraEsercizi(es, en, { precedente: null, successivo: null }, versoPetto)).length, 2);
    assert.equal(bottoni(tastieraEsercizi(es)).length, 2);
  });

  it('/guidata with a draft: continue (with the count) or start again', () => {
    assert.deepEqual(bottoni(tastieraBozzaInCorso(ita, 1)), [[['▶️ Continua la bozza (1 esercizio)', 'gcont']], [['🔄 Ricomincia', 'griniz']]]);
    assert.deepEqual(bottoni(tastieraBozzaInCorso(en, 3)), [[['▶️ Continue the draft (3 exercises)', 'gcont']], [['🔄 Start again', 'griniz']]]);
  });

  it('"Finish": the question for the title, escaped, with the suggested title and "add more"', () => {
    assert.equal(testoChiediTitolo(en, { titoloProposto: 'Plan <from> & Telegram' }),
      '📝 What should I call the plan? Write me the title, or use the suggested one: <b>Plan &lt;from&gt; &amp; Telegram</b>');
    assert.deepEqual(bottoni(tastieraTitolo(ita)), [[['✅ Usa il titolo proposto', 'gtit']], [['➕ Aggiungi altro', 'gmenu']]]);
  });

  it('the plan saved: the exercises taken out of the catalog come first, escaped', () => {
    assert.equal(testoSchedaSalvata(ita, { titolo: 'Gambe', numEsercizi: 2, tolti: ['Affondo <bulgaro>'] }),
      '⚠️ Tolto <b>Affondo &lt;bulgaro&gt;</b>: non è più nel catalogo.\n🎉 Scheda <b>Gambe</b> salvata con 2 esercizi!\nVedila con /schede');
    assert.equal(testoSchedaSalvata(en, { titolo: 'Legs', numEsercizi: 1, tolti: [] }), '🎉 Plan <b>Legs</b> saved with 1 exercise!\nSee it with /plans');
  });
});

describe('bot: updates in order per chat', () => {
  it('the key is the chat id; an update without a chat has none (no ordering)', () => {
    assert.equal(chiaveChat({ chat: { id: -100123 } }), '-100123');
    assert.equal(chiaveChat({}), undefined);
  });
});

describe('bot formatting: notes and supersets in the guided creation', () => {
  it('after a step: "Note" and "Join the previous one" only when the backend says they fit', () => {
    assert.deepEqual(bottoni(tastieraDopoAggiunta(ita, { nota: true, unibile: true })), [
      [['➕ Aggiungi altro', 'gmenu'], ['✅ Termina', 'gfine']],
      [['📝 Nota', 'gnota'], ['🔗 Unisci al precedente', 'gunisci']]
    ]);
    assert.deepEqual(bottoni(tastieraDopoAggiunta(en, { nota: true, unibile: false })).at(-1), [['📝 Note', 'gnota']]);
    assert.deepEqual(bottoni(tastieraDopoAggiunta(en, { nota: false, unibile: false })), [[['➕ Add another', 'gmenu'], ['✅ Finish', 'gfine']]]);
    assert.deepEqual(bottoni(tastieraNota(ita)), [[['➕ Aggiungi altro', 'gmenu']]]);
  });

  it('the texts: the name and the letter escaped, the summary as the backend sent it (already escaped)', () => {
    assert.equal(testoChiediNota(en, { nome: 'Curl <EZ>' }),
      '📝 Write me the note for <b>Curl &lt;EZ&gt;</b> (technique, tempo, grip…): your next message becomes the note.');
    assert.equal(testoNotaSalvata(ita, { nome: 'Panca & co', riepilogo: '1. Panca &amp; co' }), '📝 Nota salvata su <b>Panca &amp; co</b>.\n\n1. Panca &amp; co');
    assert.equal(testoUnito(ita, { gruppo: 'A', tipo: 'superset', riepilogo: 'R' }), '🔗 Fatto: <b>Superset A</b>.\n\nR');
    assert.equal(testoUnito(en, { gruppo: 'B', tipo: 'circuito', riepilogo: 'R' }), '🔗 Done: <b>Circuit B</b>.\n\nR');
  });
});

describe('bot formatting: long HTML messages in pieces Telegram takes', () => {
  /** Every <b>/<i> opened in a piece is closed in it, in order, and no entity is cut */
  function benFormato(pezzo) {
    const pila = [];
    for (const [, chiusura, nome] of pezzo.matchAll(/<(\/?)([a-z]+)>/g)) {
      if (!chiusura) pila.push(nome);
      else if (pila.pop() !== nome) return false;
    }
    const senzaEntita = pezzo.replace(/&(amp|lt|gt);/g, '');
    return pila.length === 0 && !senzaEntita.includes('&') && !/<[^>]*$/.test(pezzo) && !/^[^<]*>/.test(pezzo);
  }

  it('a short text is one piece, unchanged, with the keyboard', () => {
    assert.deepEqual(dividiHtml('<b>Hi</b> &amp; bye'), ['<b>Hi</b> &amp; bye']);
    const tastiera = { inline_keyboard: [] };
    assert.deepEqual(messaggiHtml('ciao', { reply_markup: tastiera }), [['ciao', { parse_mode: 'HTML', reply_markup: tastiera }]]);
  });

  it('a long plan: cut between lines, every piece within the limit, the keyboard only on the last', () => {
    const righe = Array.from({ length: 300 }, (_, i) => `${i + 1}. <b>Curl &lt;EZ&gt; &amp; bar</b> — 3x10\n   📝 ${'&amp;'.repeat(20)}`);
    const testo = `📋 <b>Plan</b>\n\n${righe.join('\n')}`;
    const tastiera = { inline_keyboard: [[{ text: 'x', callback_data: 'x' }]] };
    const messaggi = messaggiHtml(testo, { reply_markup: tastiera });
    assert.ok(messaggi.length > 1);
    for (const [pezzo] of messaggi) {
      assert.ok(pezzo.length <= CARATTERI_MESSAGGIO_MASSIMI && pezzo.length <= 4096);
      assert.ok(benFormato(pezzo), pezzo.slice(0, 80));
    }
    assert.deepEqual(messaggi.map(([, o]) => o.reply_markup ?? null), [...Array(messaggi.length - 1).fill(null), tastiera]);
    assert.ok(messaggi.every(([, o]) => o.parse_mode === 'HTML'));
    // Nothing lost: the pieces put together are the text
    assert.equal(messaggi.map(([p]) => p).join('\n'), testo);
  });

  it('a tag open across a cut is closed at the end of the piece and opened again in the next', () => {
    const testo = `<b>${Array.from({ length: 30 }, () => 'y'.repeat(100)).join('\n')}</b>`;
    const pezzi = dividiHtml(testo, 1000);
    assert.ok(pezzi.length > 1);
    for (const pezzo of pezzi) {
      assert.ok(pezzo.length <= 1000);
      assert.ok(pezzo.startsWith('<b>') && pezzo.endsWith('</b>'));
      assert.ok(benFormato(pezzo));
    }
  });

  it('one line too long: it loses its formatting and is cut outside entities and emoji', () => {
    const riga = `<b>${'a&amp;💪'.repeat(600)}</b>`;
    const pezzi = dividiHtml(riga, 500);
    assert.ok(pezzi.length > 1);
    for (const pezzo of pezzi) {
      assert.ok(pezzo.length <= 500);
      assert.ok(benFormato(pezzo));
      assert.ok(!/^[\udc00-\udfff]|[\ud800-\udbff]$/.test(pezzo));
    }
    assert.equal(pezzi.join(''), 'a&amp;💪'.repeat(600));
  });
});
