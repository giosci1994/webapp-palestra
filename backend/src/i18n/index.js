// ============================================
// GymMaster — Languages on the server
// ============================================
//
// The same model as the app (frontend/src/i18n): English is the base
// language, texts live in testi/<language>/<namespace>.json, keys are
// "<namespace>.<key>", with {placeholders}, plurals (key_one / key_other)
// and English as the fallback.
//
// Which language:
// - During a request, the app's: it sends it in Accept-Language. The
//   language is kept for the whole request (AsyncLocalStorage), so t() works
//   anywhere, in services too, without passing it around.
// - Outside a request (push notifications, reminders, the bot), the
//   recipient's: linguaDiUtente(), the one chosen in Profile, otherwise the
//   one the app last used (Utente.linguaApp), otherwise English. Run that
//   code inside conLingua(lingua, () => ...).

import { AsyncLocalStorage } from 'node:async_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINGUE, LINGUA_BASE, LOCALE } from '../utils/lingue.js';

const CARTELLA = join(dirname(fileURLToPath(import.meta.url)), 'testi');

/** { "<namespace>.<key>": text } from one namespace; nested objects become dotted keys */
function appiattisci(namespace, valore, testi = {}) {
  if (valore && typeof valore === 'object') {
    for (const [k, v] of Object.entries(valore)) appiattisci(`${namespace}.${k}`, v, testi);
  } else {
    testi[namespace] = valore;
  }
  return testi;
}

/** Every folder under testi/ is a language */
function carica() {
  const perLingua = {};
  for (const lingua of readdirSync(CARTELLA)) {
    const testi = (perLingua[lingua] = {});
    for (const file of readdirSync(join(CARTELLA, lingua)).filter(f => f.endsWith('.json'))) {
      appiattisci(file.replace(/\.json$/, ''), JSON.parse(readFileSync(join(CARTELLA, lingua, file), 'utf8')), testi);
    }
  }
  return perLingua;
}

const TESTI = carica();

// --- The current language ---

const contesto = new AsyncLocalStorage();

/** A supported language from a code like "it", "it-IT" or "en_US"; null if not supported */
export function linguaSupportata(codice) {
  const base = String(codice || '').toLowerCase().split(/[-_]/)[0];
  return LINGUE.includes(base) ? base : null;
}

/** The first supported language of an Accept-Language header, by preference; English otherwise */
export function linguaDaIntestazione(intestazione) {
  const preferenze = String(intestazione || '').split(',')
    .map((parte, ordine) => {
      const [codice, ...parametri] = parte.trim().split(';');
      const q = parametri.map(p => p.trim()).find(p => p.startsWith('q='));
      return { codice, peso: q ? Number(q.slice(2)) || 0 : 1, ordine };
    })
    .filter(p => p.codice && p.peso > 0)
    .sort((a, b) => b.peso - a.peso || a.ordine - b.ordine);
  for (const { codice } of preferenze) {
    const lingua = linguaSupportata(codice);
    if (lingua) return lingua;
  }
  return LINGUA_BASE;
}

/** The language for messages to a user outside a request: Profile choice, then the app's last one */
export function linguaDiUtente(utente) {
  return linguaSupportata(utente?.lingua) || linguaSupportata(utente?.linguaApp) || LINGUA_BASE;
}

/** The language of the current request (or of the surrounding conLingua) */
export function linguaCorrente() {
  return contesto.getStore() || LINGUA_BASE;
}

/** The locale for dates, numbers and lists in a language (the current one by default) */
export function localeDi(lingua = linguaCorrente()) {
  return LOCALE[lingua] || LOCALE[LINGUA_BASE];
}

/** Runs fn with `lingua` as the current language, for messages outside a request */
export function conLingua(lingua, fn) {
  return contesto.run(linguaSupportata(lingua) || LINGUA_BASE, fn);
}

/** Express middleware: the request's language from Accept-Language, for the whole request */
export function linguaRichiesta(req, res, next) {
  req.lingua = linguaDaIntestazione(req.headers['accept-language']);
  contesto.run(req.lingua, next);
}

// --- Translating ---

const regolePlurali = {};
const categoria = (lingua, n) => (regolePlurali[lingua] ??= new Intl.PluralRules(lingua)).select(n);

function cerca(testi = {}, lingua, chiave, variabili) {
  if (typeof variabili.count === 'number') {
    const plurale = testi[`${chiave}_${categoria(lingua, variabili.count)}`] ?? testi[`${chiave}_other`];
    if (plurale != null) return plurale;
  }
  return testi[chiave];
}

/**
 * The text of `chiave` in `lingua` (the current one by default), with the
 * placeholders filled in. Falls back to English, then to the key itself.
 */
export function traduci(chiave, variabili = {}, lingua = linguaCorrente()) {
  const testo = cerca(TESTI[lingua], lingua, chiave, variabili) ?? cerca(TESTI[LINGUA_BASE], LINGUA_BASE, chiave, variabili) ?? chiave;
  return String(testo).replace(/\{(\w+)\}/g, (segnaposto, nome) =>
    variabili[nome] != null ? String(variabili[nome]) : segnaposto);
}

/** Short name, as in the app */
export const t = traduci;

/** Whether `chiave` has a text in English (for tests) */
export function esisteChiave(chiave) {
  return chiave in TESTI[LINGUA_BASE] || `${chiave}_other` in TESTI[LINGUA_BASE];
}

/** All the texts of a language, flattened (for tests) */
export function testiDi(lingua) {
  return TESTI[lingua] || {};
}
