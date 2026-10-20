// ============================================
// GymMaster — Forgiving search
// ============================================
//
// The catalog has more than 3000 exercises with long names, in Italian and in
// English ("Stacco Rumeno con Due Manubri" / "Double Dumbbell Romanian
// Deadlift"). Searching for the exact phrase did not work: "stacco manubri"
// found nothing. Here:
// - words are searched in any order, and they must all be there;
// - case, accents and punctuation do not matter;
// - half a word counts ("manub"), and singular and plural are the same
//   ("affondi" finds "affondo", "lunges" finds "lunge");
// - one typo is tolerated, two in long words;
// - gym abbreviations become their words (rdl, ohp, db, kb…).
// The best results come first: exact words, then word beginnings,
// then typos; on a tie, the shorter names.

import { traduci } from '../i18n/index.js';

/** Lowercase, no accents, only letters and digits separated by spaces */
export function normalizza(testo) {
  return String(testo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const paroleDi = testo => (normalizza(testo) || '').split(' ').filter(Boolean);

/**
 * The word without its ending, so singular and plural are the same:
 * manubrio/manubri, stacco/stacchi, panca/panche, lunge/lunges, press/presses.
 */
export function radice(parola) {
  if (parola.length <= 3) return parola;
  return parola
    .replace(/(?<!s)(es|s)$/, '')  // English plural, but "press" stays "press"
    .replace(/[aeiou]+$/, '')      // Italian final vowels
    .replace(/h$/, '');            // stacchi → stacch → stacc, like stacco
}

/**
 * Distance between two words: insertions, deletions, substitutions and swaps
 * of adjacent letters. Beyond `massimo` it stops counting and returns massimo + 1.
 */
export function distanza(a, b, massimo = Infinity) {
  if (Math.abs(a.length - b.length) > massimo) return massimo + 1;
  let precedente2 = null;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const corrente = [i];
    let minimoRiga = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valore = Math.min(precedente[j] + 1, corrente[j - 1] + 1, precedente[j - 1] + costo);
      if (precedente2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valore = Math.min(valore, precedente2[j - 2] + 1);
      }
      corrente.push(valore);
      minimoRiga = Math.min(minimoRiga, valore);
    }
    if (minimoRiga > massimo) return massimo + 1;
    precedente2 = precedente;
    precedente = corrente;
  }
  return precedente[b.length];
}

/** Gym abbreviations: each one counts as any one of its expansions */
const ABBREVIAZIONI = {
  rdl: ['stacco rumeno', 'romanian deadlift'],
  sldl: ['stacco gambe tese', 'stiff leg deadlift'],
  ohp: ['military press', 'overhead press', 'lento avanti'],
  db: ['manubri', 'dumbbell'],
  bb: ['bilanciere', 'barbell'],
  kb: ['kettlebell'],
  ez: ['ez'],
  bw: ['corpo libero', 'bodyweight']
};

const ESATTA = 4;
const INIZIO = 3;
const RADICE = 3;
const ERRORE = 1;

/** How well a searched word matches a catalog word (0 = not at all) */
function confrontaParole(cercata, { parola, radice: radiceParola }) {
  if (parola === cercata) return ESATTA;
  if (parola.startsWith(cercata)) return INIZIO;
  if (cercata.length >= 3 && radiceParola === radice(cercata)) return RADICE;
  const tolleranza = cercata.length >= 8 ? 2 : cercata.length >= 4 ? 1 : 0;
  if (tolleranza && (
    distanza(cercata, parola, tolleranza) <= tolleranza ||
    // Typo in a word still half typed: "manbri" for "manubri…"
    distanza(cercata, parola.slice(0, cercata.length), tolleranza) <= tolleranza
  )) return ERRORE;
  return 0;
}

/**
 * The score of a searched word against every word in the vocabulary,
 * computed only once: the same words ("con", "manubri") come back in
 * thousands of names, and comparing them name by name was slow.
 */
function punteggiNelVocabolario(cercata, vocabolario) {
  const punteggi = new Map();
  for (const voce of vocabolario.values()) {
    const punteggio = confrontaParole(cercata, voce);
    if (punteggio) punteggi.set(voce, punteggio);
  }
  return punteggi;
}

/** The searched words, each with its scores (abbreviations included) */
function preparaCercate(cercate, vocabolario) {
  return cercate.map(cercata => ({
    diretta: punteggiNelVocabolario(cercata, vocabolario),
    espansioni: (ABBREVIAZIONI[cercata] || []).map(espansione =>
      paroleDi(espansione).map(p => punteggiNelVocabolario(p, vocabolario)))
  }));
}

const migliorePunteggio = (punteggi, parole) =>
  parole.reduce((migliore, parola) => Math.max(migliore, punteggi.get(parola) || 0), 0);

/** Score of a searched word within the words of a name */
function punteggioCercata({ diretta, espansioni }, parole) {
  let migliore = migliorePunteggio(diretta, parole);
  for (const espansione of espansioni) {
    if (espansione.every(punteggi => migliorePunteggio(punteggi, parole) > 0)) migliore = Math.max(migliore, INIZIO);
  }
  return migliore;
}

/**
 * Prepares a list for searching: done once, not on every keystroke.
 * @param {Array} elementi
 * @param {{ principali: (e) => string[], secondari?: (e) => string[] }} campi
 *   principali: the names; secondari: other text that counts less (muscle group, equipment)
 */
function indicizza(elementi, { principali, secondari = () => [] }) {
  // Every word appears only once in the vocabulary, and the items share
  // it: scores are computed per word, not per item
  const vocabolario = new Map();
  const preparaParole = testi => testi.filter(Boolean).flatMap(paroleDi).map(parola => {
    if (!vocabolario.has(parola)) vocabolario.set(parola, { parola, radice: radice(parola) });
    return vocabolario.get(parola);
  });
  const voci = elementi.map((elemento, posizione) => {
    const nomi = principali(elemento).filter(Boolean);
    return {
      elemento,
      posizione,
      principali: preparaParole(nomi),
      secondari: preparaParole(secondari(elemento)),
      lunghezza: (nomi[0] || '').length
    };
  });
  return { voci, vocabolario };
}

/**
 * The items that match the searched text, best first.
 * With no text, all of them in the original order.
 */
export function cerca({ voci, vocabolario }, testo) {
  const parole = paroleDi(testo);
  if (parole.length === 0) return voci.map(voce => voce.elemento);
  const cercate = preparaCercate(parole, vocabolario);

  const trovati = [];
  for (const voce of voci) {
    let totale = 0;
    for (const cercata of cercate) {
      const nelNome = punteggioCercata(cercata, voce.principali);
      // Outside the name (muscle group, equipment) it counts less
      const punteggio = nelNome || punteggioCercata(cercata, voce.secondari) / 2;
      if (!punteggio) { totale = 0; break; }
      totale += punteggio;
    }
    if (totale > 0) {
      // Bonus if the name starts with the first searched word
      if (voce.principali[0]?.parola.startsWith(parole[0])) totale += 1;
      trovati.push({ voce, totale });
    }
  }
  trovati.sort((a, b) => b.totale - a.totale || a.voce.lunghezza - b.voce.lunghezza || a.voce.posizione - b.voce.posizione);
  return trovati.map(t => t.voce.elemento);
}

/** Favorites on top, without changing the order within each group */
export function preferitiPrima(elenco, preferiti) {
  if (!preferiti?.size) return elenco;
  return [...elenco.filter(e => preferiti.has(e.id)), ...elenco.filter(e => !preferiti.has(e.id))];
}

/** English name of a value stored in Italian (muscle group, equipment), if there is one */
function inInglese(namespace, valore) {
  if (!valore) return null;
  const chiave = `${namespace}.${valore}`;
  const testo = traduci(chiave, {}, 'en');
  return testo === chiave ? null : testo;
}

/**
 * Exercise index: Italian and English name; with details also muscles and
 * equipment, in Italian as stored and in English, so "chest" finds "Petto"
 */
export function indicizzaEsercizi(esercizi, { conDettagli = false } = {}) {
  const dettagli = e => {
    const secondari = String(e.gruppoMuscoloSecondario || '').split(',').map(g => g.trim()).filter(Boolean);
    return [
      e.gruppoMuscoloPrimario, e.gruppoMuscoloSecondario, e.attrezzatura?.nome,
      inInglese('gruppi', e.gruppoMuscoloPrimario), ...secondari.map(g => inInglese('gruppi', g)),
      inInglese('attrezzi', e.attrezzatura?.nome)
    ];
  };
  return indicizza(esercizi, {
    principali: e => [e.nomeIt, e.nome],
    secondari: conDettagli ? dettagli : undefined
  });
}
