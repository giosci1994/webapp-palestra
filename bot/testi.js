// ============================================
// GymMaster — Texts the bot writes itself
// Everything else (AI replies, plans, stats) comes from the backend, already
// in the user's language. This is a tiny copy of the app's translation model
// (the bot is a separate package and cannot import the backend's i18n):
// testi/<language>.json, {placeholders}, plurals (key_one / key_other) and
// English as the fallback.
// ============================================

import { readFileSync } from 'node:fs';

const LINGUA_BASE = 'en';
const carica = (lingua) => JSON.parse(readFileSync(new URL(`./testi/${lingua}.json`, import.meta.url), 'utf8'));
const TESTI = { en: carica('en'), it: carica('it') };

const regolePlurali = {};
const categoria = (lingua, n) => (regolePlurali[lingua] ??= new Intl.PluralRules(lingua)).select(n);

// The language of the linked account for each chat, as the backend last
// answered in it (Content-Language): the bot's own texts follow it too
const lingueChat = new Map();

/** Remembers the language the backend answered this chat in */
export function ricordaLingua(ctx, lingua) {
  if (ctx?.chat?.id != null && Object.hasOwn(TESTI, lingua ?? '')) lingueChat.set(ctx.chat.id, lingua);
}

/**
 * The language for a Telegram user: their account's, once the backend has
 * answered; otherwise their Telegram app's when the bot has it ("it-IT" →
 * Italian), English for everybody else
 */
export function linguaDi(ctx) {
  const delAccount = lingueChat.get(ctx?.chat?.id);
  if (delAccount) return delAccount;
  const diTelegram = String(ctx?.from?.language_code || '').toLowerCase().split('-')[0];
  return Object.hasOwn(TESTI, diTelegram) ? diTelegram : LINGUA_BASE;
}

function cerca(testi, lingua, chiave, variabili) {
  if (typeof variabili.count === 'number') {
    const plurale = testi[`${chiave}_${categoria(lingua, variabili.count)}`] ?? testi[`${chiave}_other`];
    if (plurale != null) return plurale;
  }
  return testi[chiave];
}

/** The text of `chiave` in `lingua`, with {placeholders} filled in; English, then the key itself, as fallbacks */
export function tLingua(lingua, chiave, variabili = {}) {
  const testo = cerca(TESTI[lingua] || {}, lingua, chiave, variabili) ?? cerca(TESTI[LINGUA_BASE], LINGUA_BASE, chiave, variabili) ?? chiave;
  return String(testo).replace(/\{(\w+)\}/g, (segnaposto, nome) => (variabili[nome] != null ? String(variabili[nome]) : segnaposto));
}

/** The text of `chiave` in the language of the Telegram user in `ctx` */
export function t(ctx, chiave, variabili = {}) {
  return tLingua(linguaDi(ctx), chiave, variabili);
}
