// ============================================
// GymMaster — Languages
// ============================================
//
// English is the base language and Italian a translation; more can follow
// by adding a folder under testi/. The app starts in the language chosen in
// Profile (saved on the account and on this phone), otherwise in the phone's
// language, otherwise in English.
//
// Texts live in testi/<language>/<namespace>.json. A key is
// "<namespace>.<key>", e.g. t('allenamento.termina') reads "termina" from
// testi/en/allenamento.json. Whatever a language lacks falls back to English,
// and a key missing everywhere shows as itself, so it is easy to spot.
//
// - Placeholders: "Hi {name}" with t('...', { name: 'Anna' }).
// - Plurals: with a numeric `count`, "<key>_one" / "<key>_other" (and the
//   other categories of Intl.PluralRules) are picked by the language's rules.
// - The current language is a small store: React components read it with
//   useLingua() (hooks/useLingua.js) and render again when it changes; plain
//   functions (formatters) call traduci() and linguaCorrente().

export const LINGUE = ['en', 'it'];
export const LINGUA_BASE = 'en';

/** Each language's name, written in that language, for the language picker */
export const NOMI_LINGUE = { en: 'English', it: 'Italiano' };

/** Intl locale when the phone does not say a more precise one */
const LOCALE_PREDEFINITA = { en: 'en-GB', it: 'it-IT' };

/** Where the choice made in Profile is kept on this phone */
const CHIAVE_SCELTA = 'gymmaster_lingua';

// --- Texts ---

/**
 * { "<namespace>.<key>": text } from the JSON files of one language.
 * Nested objects in a file become dotted keys: { timer: { start } } →
 * "<namespace>.timer.start".
 */
export function appiattisci(moduli) {
  const testi = {};
  const aggiungi = (prefisso, valore) => {
    if (valore && typeof valore === 'object') {
      for (const [k, v] of Object.entries(valore)) aggiungi(`${prefisso}.${k}`, v);
    } else {
      testi[prefisso] = valore;
    }
  };
  for (const [percorso, contenuto] of Object.entries(moduli)) {
    const namespace = percorso.split('/').pop().replace(/\.json$/, '');
    aggiungi(namespace, contenuto);
  }
  return testi;
}

const TESTI = {
  en: appiattisci(import.meta.glob('./testi/en/*.json', { eager: true, import: 'default' })),
  it: appiattisci(import.meta.glob('./testi/it/*.json', { eager: true, import: 'default' }))
};

// --- Picking a language ---

/**
 * The first supported language among the preferences, in order: each one a
 * code ("it", "it-IT", "en_US") or a list of codes (navigator.languages).
 * A regional variant counts as its base language. Nothing supported: English.
 */
export function scegliLingua(...preferenze) {
  for (const preferenza of preferenze.flat()) {
    if (typeof preferenza !== 'string' || !preferenza) continue;
    const base = preferenza.toLowerCase().split(/[-_]/)[0];
    if (LINGUE.includes(base)) return base;
  }
  return LINGUA_BASE;
}

const lingueDelTelefono = () =>
  (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];

function leggiScelta() {
  try {
    const scelta = globalThis.localStorage?.getItem(CHIAVE_SCELTA);
    return LINGUE.includes(scelta) ? scelta : null;
  } catch {
    return null;
  }
}

// --- The current language ---

let linguaAttiva = scegliLingua(leggiScelta(), lingueDelTelefono());
const ascoltatori = new Set();

function applica(lingua) {
  if (typeof document !== 'undefined') document.documentElement.lang = lingua;
  if (lingua === linguaAttiva) return;
  linguaAttiva = lingua;
  for (const ascoltatore of ascoltatori) ascoltatore();
}
applica(linguaAttiva);

/** The language the app is showing now */
export function linguaCorrente() {
  return linguaAttiva;
}

/** For useSyncExternalStore: calls `ascoltatore` when the language changes */
export function iscriviLingua(ascoltatore) {
  ascoltatori.add(ascoltatore);
  return () => ascoltatori.delete(ascoltatore);
}

/** The language chosen in Profile, or null when the app follows the phone */
export function linguaScelta() {
  return leggiScelta();
}

/**
 * Applies a choice: "en", "it", or null to follow the phone. It is kept on
 * this phone too, so the app opens in that language before signing in.
 */
export function scegli(lingua) {
  const scelta = LINGUE.includes(lingua) ? lingua : null;
  try {
    if (scelta) globalThis.localStorage?.setItem(CHIAVE_SCELTA, scelta);
    else globalThis.localStorage?.removeItem(CHIAVE_SCELTA);
  } catch {
    // Not saved on the phone: it still applies until the app is closed
  }
  applica(scegliLingua(scelta, lingueDelTelefono()));
}

/**
 * The Intl locale for dates and numbers: the phone's own when it is in the
 * same language (en-US gets US dates), otherwise the language's default.
 */
export function localeCorrente(lingua = linguaAttiva) {
  const delTelefono = lingueDelTelefono().find(l => scegliLingua(l) === lingua && l.includes('-'));
  return delTelefono || LOCALE_PREDEFINITA[lingua] || LOCALE_PREDEFINITA[LINGUA_BASE];
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
 * The text of `chiave` in `lingua` from `testiPerLingua` ({ en: {...}, it: {...} }),
 * with the placeholders filled in. Falls back to English, then to the key itself.
 */
export function traduciDa(testiPerLingua, chiave, variabili = {}, lingua = LINGUA_BASE) {
  const testo = cerca(testiPerLingua[lingua], lingua, chiave, variabili)
    ?? cerca(testiPerLingua[LINGUA_BASE], LINGUA_BASE, chiave, variabili)
    ?? chiave;
  return String(testo).replace(/\{(\w+)\}/g, (segnaposto, nome) =>
    variabili[nome] != null ? String(variabili[nome]) : segnaposto);
}

/** The text of `chiave` in the current language (or in `lingua`) */
export function traduci(chiave, variabili = {}, lingua = linguaAttiva) {
  return traduciDa(TESTI, chiave, variabili, lingua);
}

/** Whether `chiave` has a text in English (for tests and checks) */
export function esisteChiave(chiave) {
  return chiave in TESTI[LINGUA_BASE] || `${chiave}_other` in TESTI[LINGUA_BASE];
}

/** All the texts of a language, flattened (for tests) */
export function testiDi(lingua) {
  return TESTI[lingua] || {};
}
