// ============================================
// GymMaster — Tentativi di accesso per account
// ============================================
//
// Il limitatore per indirizzo (20 richieste ogni 15 minuti) non ferma chi
// prova password su un account da molti indirizzi. Qui si contano gli errori
// per email: al TENTATIVI_LIBERI-esimo quell'email si blocca per un minuto, e
// ogni errore successivo raddoppia l'attesa, fino a BLOCCO_MASSIMO. Un
// accesso riuscito azzera il conto, e dopo DIMENTICA_DOPO senza errori l'email
// viene dimenticata.
//
// Vale anche per email che non esistono: un blocco solo sugli account veri
// rivelerebbe chi e' iscritto.
//
// Lo stato e' in memoria: un riavvio lo azzera, ed e' un prezzo accettabile per
// un blocco che dura minuti. `adesso` si puo' passare per i test.

export const TENTATIVI_LIBERI = 5;
export const BLOCCO_INIZIALE_MS = 60 * 1000;
export const BLOCCO_MASSIMO_MS = 15 * 60 * 1000;
export const DIMENTICA_DOPO_MS = 60 * 60 * 1000;
// Oltre questa soglia si dimenticano le email ferme da piu' tempo
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

/** Millisecondi di attesa prima del prossimo tentativo su questa email; 0 se libera */
export function attesaPer(email, adesso = Date.now()) {
  const v = voce(email, adesso);
  return v ? Math.max(0, v.bloccatoFino - adesso) : 0;
}

/** Un tentativo sbagliato: dal TENTATIVI_LIBERI-esimo scatta (o si allunga) il blocco */
export function registraErrore(email, adesso = Date.now()) {
  const v = voce(email, adesso) || { errori: 0, bloccatoFino: 0, ultimoErrore: adesso };
  v.errori += 1;
  v.ultimoErrore = adesso;
  if (v.errori >= TENTATIVI_LIBERI) {
    const raddoppi = v.errori - TENTATIVI_LIBERI;
    v.bloccatoFino = adesso + Math.min(BLOCCO_INIZIALE_MS * 2 ** raddoppi, BLOCCO_MASSIMO_MS);
  }
  // Ordine d'inserimento = la prima e' quella ferma da piu' tempo
  registro.delete(chiave(email));
  registro.set(chiave(email), v);
  if (registro.size > MAX_EMAIL) registro.delete(registro.keys().next().value);
}

/** Accesso riuscito: si riparte da zero */
export function azzeraTentativi(email) {
  registro.delete(chiave(email));
}
