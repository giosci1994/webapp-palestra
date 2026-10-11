// ============================================
// GymMaster — Login attempts per account
// ============================================
//
// The per-address limiter (20 requests every 15 minutes) does not stop someone
// who tries passwords on one account from many addresses. Here errors are
// counted per email: at the TENTATIVI_LIBERI-th, that email is locked for a
// minute, and each further error doubles the wait, up to BLOCCO_MASSIMO_MS. A
// successful login resets the count, and after DIMENTICA_DOPO_MS without errors
// the email is forgotten.
//
// It also applies to emails that do not exist: a lock only on real accounts
// would reveal who is a member.
//
// The state is in memory: a restart clears it, and that is an acceptable price
// for a lock that lasts minutes. `adesso` can be passed in for the tests.

export const TENTATIVI_LIBERI = 5;
export const BLOCCO_INIZIALE_MS = 60 * 1000;
export const BLOCCO_MASSIMO_MS = 15 * 60 * 1000;
export const DIMENTICA_DOPO_MS = 60 * 60 * 1000;
// Past this threshold, the emails idle for the longest are forgotten
const MAX_EMAIL = 10000;

/** email -> { errori, bloccatoFino, ultimoErrore } */
const registro = new Map();

const chiave = email => String(email || '').trim().toLowerCase();

function voce(email, adesso) {
  const v = registro.get(chiave(email));
  if (v && adesso - v.ultimoErrore > DIMENTICA_DOPO_MS) {
    registro.delete(chiave(email));
    return null;
  }
  return v || null;
}

/** Milliseconds to wait before the next attempt on this email; 0 if free */
export function attesaPer(email, adesso = Date.now()) {
  const v = voce(email, adesso);
  return v ? Math.max(0, v.bloccatoFino - adesso) : 0;
}

/** A wrong attempt: from the TENTATIVI_LIBERI-th on, the lock starts (or gets longer) */
export function registraErrore(email, adesso = Date.now()) {
  const v = voce(email, adesso) || { errori: 0, bloccatoFino: 0, ultimoErrore: adesso };
  v.errori += 1;
  v.ultimoErrore = adesso;
  if (v.errori >= TENTATIVI_LIBERI) {
    const raddoppi = v.errori - TENTATIVI_LIBERI;
    v.bloccatoFino = adesso + Math.min(BLOCCO_INIZIALE_MS * 2 ** raddoppi, BLOCCO_MASSIMO_MS);
  }
  // Insertion order = the first one is the one idle for the longest
  registro.delete(chiave(email));
  registro.set(chiave(email), v);
  if (registro.size > MAX_EMAIL) registro.delete(registro.keys().next().value);
}

/** Successful login: start again from zero */
export function azzeraTentativi(email) {
  registro.delete(chiave(email));
}
