// The bot's commands (bot/comandi.js): every command answers to its Italian
// and its English name, the Telegram menu and the help texts show the names
// of the user's language. Imported here because the bot is a separate package
// without tests of its own.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMANDI, nomiComando, nomiInLingua, menuComandi } from '../../../bot/comandi.js';
import { CHAT_RICORDATE, ricordaLingua, linguaDi } from '../../../bot/testi.js';

const testi = lingua => JSON.parse(readFileSync(new URL(`../../../bot/testi/${lingua}.json`, import.meta.url), 'utf8'));

describe('bot commands: Italian and English names', () => {
  it('each command answers to both names (one handler), start only once', () => {
    assert.deepEqual(COMANDI.map(c => nomiComando(c.it)), [
      ['nuova', 'new'], ['guidata', 'guided'], ['schede', 'plans'], ['statistiche', 'stats'], ['annulla', 'cancel'], ['start']
    ]);
    assert.throws(() => nomiComando('new'), /Unknown command/);
  });

  it('every name is one Telegram takes (1-32 lowercase letters, digits, _) and no name is used twice', () => {
    const tutti = COMANDI.flatMap(c => nomiComando(c.it));
    for (const nome of tutti) assert.match(nome, /^[a-z0-9_]{1,32}$/);
    assert.equal(new Set(tutti).size, tutti.length);
  });

  it('the menu: the names and the descriptions of each language (English for any other)', () => {
    assert.deepEqual(menuComandi('it').map(c => c.command), ['nuova', 'guidata', 'schede', 'statistiche', 'annulla', 'start']);
    assert.deepEqual(menuComandi('en').map(c => c.command), ['new', 'guided', 'plans', 'stats', 'cancel', 'start']);
    assert.deepEqual(nomiInLingua('de'), nomiInLingua('en'));
    assert.equal(menuComandi('it')[0].description, 'Crea una scheda scrivendo gli esercizi');
    assert.equal(menuComandi('en')[2].description, 'Your plans');
    // Every description is a text of its own, not the key left as it is
    for (const lingua of ['it', 'en']) {
      for (const { description } of menuComandi(lingua)) assert.ok(description && !/^comando[A-Z]/.test(description), description);
    }
  });

  it('the bot\'s texts name only the commands of their language', () => {
    for (const lingua of ['it', 'en']) {
      const nomi = new Set(nomiInLingua(lingua));
      for (const [chiave, testo] of Object.entries(testi(lingua))) {
        for (const [, nome] of testo.matchAll(/(?:^|[\s(])\/([a-z]+)/g)) assert.ok(nomi.has(nome), `${lingua}.${chiave}: /${nome}`);
      }
    }
  });
});

describe('bot texts: the language remembered per chat', () => {
  it('at most CHAT_RICORDATE chats: the least recently answered is forgotten first', () => {
    const chat = id => ({ chat: { id: `lru-${id}` }, from: { language_code: 'en' } });
    ricordaLingua(chat(0), 'it');
    for (let i = 1; i < CHAT_RICORDATE; i++) ricordaLingua(chat(i), 'it');
    // Chat 0 answered again: now chat 1 is the oldest
    ricordaLingua(chat(0), 'it');
    ricordaLingua(chat(CHAT_RICORDATE), 'it');
    assert.equal(linguaDi(chat(0)), 'it');
    assert.equal(linguaDi(chat(1)), 'en');
    assert.equal(linguaDi(chat(CHAT_RICORDATE)), 'it');
  });
});
