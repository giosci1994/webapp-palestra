// The Telegram bot's own texts (bot/testi): a separate package with its own tiny
// translation module. Same checks as the server's files: Italian has the keys
// of English with the same placeholders, and every key bot.js uses exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, tLingua, linguaDi, ricordaLingua } from '../../../bot/testi.js';

const BOT = join(dirname(fileURLToPath(import.meta.url)), '../../../bot');
const leggi = lingua => JSON.parse(readFileSync(join(BOT, 'testi', `${lingua}.json`), 'utf8'));
const segnaposti = testo => [...String(testo).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
const utente = codice => ({ from: { language_code: codice } });

describe('bot texts', () => {
  const en = leggi('en');
  const ita = leggi('it');

  it('Italian has the same keys as English, with the same placeholders', () => {
    assert.deepEqual(Object.keys(ita).sort(), Object.keys(en).sort());
    assert.deepEqual(Object.keys(en).filter(k => segnaposti(en[k]) !== segnaposti(ita[k])), []);
  });

  it('no empty texts', () => {
    for (const testi of [en, ita]) {
      assert.deepEqual(Object.entries(testi).filter(([, v]) => typeof v !== 'string' || !v.trim()), []);
    }
  });

  it('every key bot.js asks for exists in English', () => {
    const codice = readFileSync(join(BOT, 'bot.js'), 'utf8');
    const usate = [...codice.matchAll(/\b(?:t\(ctx|tLingua\(lingua), '(\w+)'/g)].map(m => m[1]);
    assert.ok(usate.length > 20);
    const esiste = chiave => chiave in en || `${chiave}_other` in en;
    assert.deepEqual(usate.filter(chiave => !esiste(chiave)), []);
  });

  it('Italian for Telegram users whose language is Italian, English for everybody else', () => {
    assert.equal(linguaDi(utente('it')), 'it');
    assert.equal(linguaDi(utente('it-IT')), 'it');
    assert.equal(linguaDi(utente('en')), 'en');
    assert.equal(linguaDi(utente('pt-br')), 'en');
    assert.equal(linguaDi(utente(undefined)), 'en');
    assert.equal(linguaDi({}), 'en');
    assert.equal(t(utente('it'), 'bozzaAnnullata'), ita.bozzaAnnullata);
    assert.equal(t(utente('de'), 'bozzaAnnullata'), en.bozzaAnnullata);
  });

  it('fills the placeholders, and leaves unknown ones alone', () => {
    assert.match(t(utente('en'), 'collegato', { nome: 'Anna' }), /hi Anna!/);
    assert.match(t(utente('it'), 'collegato', { nome: 'Anna' }), /ciao Anna!/);
    assert.match(t(utente('en'), 'scegliGruppo'), /\{regione\}/);
  });

  it('plurals', () => {
    const aggiunto = { nome: 'Panca', serie: 3, ripetizioni: 10 };
    assert.match(t(utente('en'), 'aggiunto', { ...aggiunto, count: 1 }), /1 exercise\.$/);
    assert.match(t(utente('en'), 'aggiunto', { ...aggiunto, count: 2 }), /2 exercises\.$/);
    assert.match(t(utente('it'), 'aggiunto', { ...aggiunto, count: 1 }), /1 esercizio\.$/);
    assert.match(t(utente('it'), 'aggiunto', { ...aggiunto, count: 0 }), /0 esercizi\.$/);
  });

  it('falls back to English, then to the key', () => {
    assert.equal(tLingua('fr', 'bozzaAnnullata'), en.bozzaAnnullata);
    assert.equal(tLingua('it', 'chiaveCheNonEsiste'), 'chiaveCheNonEsiste');
  });

  it("once the backend has answered a chat, the account's language wins over Telegram's", () => {
    const chat = (id, codice) => ({ chat: { id }, from: { language_code: codice } });
    ricordaLingua(chat(1, 'it'), 'en');
    assert.equal(linguaDi(chat(1, 'it')), 'en');
    assert.equal(t(chat(1, 'it'), 'bozzaAnnullata'), en.bozzaAnnullata);
    // Another chat, and a language the bot does not have, change nothing
    assert.equal(linguaDi(chat(2, 'it')), 'it');
    ricordaLingua(chat(3, 'it'), null);
    ricordaLingua(chat(3, 'it'), 'fr');
    assert.equal(linguaDi(chat(3, 'it')), 'it');
  });
});
