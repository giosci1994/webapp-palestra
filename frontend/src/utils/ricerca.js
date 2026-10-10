// ============================================
// GymMaster — Ricerca tollerante
// ============================================
//
// Il catalogo ha piu' di 3000 esercizi con nomi lunghi, in italiano e in
// inglese ("Stacco Rumeno con Due Manubri" / "Double Dumbbell Romanian
// Deadlift"). Cercare la frase esatta non funzionava: "stacco manubri" non
// trovava niente. Qui:
// - le parole si cercano in qualsiasi ordine, e devono esserci tutte;
// - maiuscole, accenti e punteggiatura non contano;
// - una parola a meta' vale ("manub"), e singolare e plurale coincidono
//   ("affondi" trova "affondo", "lunges" trova "lunge");
// - un errore di battitura e' tollerato, due nelle parole lunghe;
// - le abbreviazioni da palestra diventano le loro parole (rdl, ohp, db, kb…).
// I risultati migliori vengono prima: parole esatte, poi inizi di parola,
// poi errori; a parita', i nomi piu' corti.

/** Minuscole, senza accenti, solo lettere e cifre separate da spazi */
export function normalizza(testo) {
  return String(testo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const paroleDi = testo => (normalizza(testo) || '').split(' ').filter(Boolean);

/**
 * La parola senza desinenza, cosi' singolare e plurale coincidono:
 * manubrio/manubri, stacco/stacchi, panca/panche, lunge/lunges, press/presses.
 */
export function radice(parola) {
  if (parola.length <= 3) return parola;
  return parola
    .replace(/(?<!s)(es|s)$/, '')  // plurale inglese, ma "press" resta "press"
    .replace(/[aeiou]+$/, '')      // vocali finali italiane
    .replace(/h$/, '');            // stacchi → stacch → stacc, come stacco
}

/**
 * Distanza fra due parole: inserimenti, cancellazioni, sostituzioni e scambi
 * di lettere vicine. Oltre `massimo` smette di contare e restituisce massimo + 1.
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

/** Abbreviazioni da palestra: ciascuna vale come una qualsiasi delle sue espansioni */
export const ABBREVIAZIONI = {
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

/** Quanto bene una parola cercata corrisponde a una parola del catalogo (0 = per niente) */
function confrontaParole(cercata, { parola, radice: radiceParola }) {
  if (parola === cercata) return ESATTA;
  if (parola.startsWith(cercata)) return INIZIO;
  if (cercata.length >= 3 && radiceParola === radice(cercata)) return RADICE;
  const tolleranza = cercata.length >= 8 ? 2 : cercata.length >= 4 ? 1 : 0;
  if (tolleranza && (
    distanza(cercata, parola, tolleranza) <= tolleranza ||
    // Errore in una parola ancora a meta': "manbri" per "manubri…"
    distanza(cercata, parola.slice(0, cercata.length), tolleranza) <= tolleranza
  )) return ERRORE;
  return 0;
}

/**
 * Il punteggio di una parola cercata contro ogni parola del vocabolario,
 * calcolato una volta sola: le stesse parole ("con", "manubri") tornano in
 * migliaia di nomi, e confrontarle nome per nome era lento.
 */
function punteggiNelVocabolario(cercata, vocabolario) {
  const punteggi = new Map();
  for (const voce of vocabolario.values()) {
    const punteggio = confrontaParole(cercata, voce);
    if (punteggio) punteggi.set(voce, punteggio);
  }
  return punteggi;
}

/** Le parole cercate, ciascuna con i suoi punteggi (abbreviazioni comprese) */
function preparaCercate(cercate, vocabolario) {
  return cercate.map(cercata => ({
    diretta: punteggiNelVocabolario(cercata, vocabolario),
    espansioni: (ABBREVIAZIONI[cercata] || []).map(espansione =>
      paroleDi(espansione).map(p => punteggiNelVocabolario(p, vocabolario)))
  }));
}

const migliorePunteggio = (punteggi, parole) =>
  parole.reduce((migliore, parola) => Math.max(migliore, punteggi.get(parola) || 0), 0);

/** Punteggio di una parola cercata nelle parole di un nome */
function punteggioCercata({ diretta, espansioni }, parole) {
  let migliore = migliorePunteggio(diretta, parole);
  for (const espansione of espansioni) {
    if (espansione.every(punteggi => migliorePunteggio(punteggi, parole) > 0)) migliore = Math.max(migliore, INIZIO);
  }
  return migliore;
}

/**
 * Prepara un elenco per la ricerca: si fa una volta, non a ogni tasto.
 * @param {Array} elementi
 * @param {{ principali: (e) => string[], secondari?: (e) => string[] }} campi
 *   principali: i nomi; secondari: altro testo che conta meno (gruppo muscolare, attrezzatura)
 */
export function indicizza(elementi, { principali, secondari = () => [] }) {
  // Ogni parola compare una volta sola nel vocabolario, e gli elementi la
  // condividono: i punteggi si calcolano per parola, non per elemento
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
 * Gli elementi che corrispondono al testo cercato, dal migliore.
 * Senza testo, tutti nell'ordine originale.
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
      // Fuori dal nome (gruppo muscolare, attrezzatura) vale meno
      const punteggio = nelNome || punteggioCercata(cercata, voce.secondari) / 2;
      if (!punteggio) { totale = 0; break; }
      totale += punteggio;
    }
    if (totale > 0) {
      // Bonus se il nome comincia con la prima parola cercata
      if (voce.principali[0]?.parola.startsWith(parole[0])) totale += 1;
      trovati.push({ voce, totale });
    }
  }
  trovati.sort((a, b) => b.totale - a.totale || a.voce.lunghezza - b.voce.lunghezza || a.voce.posizione - b.voce.posizione);
  return trovati.map(t => t.voce.elemento);
}

/** I preferiti in cima, senza cambiare l'ordine dentro ciascun gruppo */
export function preferitiPrima(elenco, preferiti) {
  if (!preferiti?.size) return elenco;
  return [...elenco.filter(e => preferiti.has(e.id)), ...elenco.filter(e => !preferiti.has(e.id))];
}

/** Indice di esercizi: nome italiano e inglese; con i dettagli anche muscoli e attrezzatura */
export function indicizzaEsercizi(esercizi, { conDettagli = false } = {}) {
  return indicizza(esercizi, {
    principali: e => [e.nomeIt, e.nome],
    secondari: conDettagli ? e => [e.gruppoMuscoloPrimario, e.gruppoMuscoloSecondario, e.attrezzatura?.nome] : undefined
  });
}
