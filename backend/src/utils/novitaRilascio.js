// ============================================
// GymMaster — Storie delle novita' di un rilascio
// ============================================
//
// Le storie stanno in prisma/novita.json, ognuna con la versione che la porta.
// Al rilascio di quella versione si aggiungono alla tabella novita
// (services/novitaRilascio.service.js), una volta sola: le storie delle
// versioni passate non si toccano piu', anche se dal pannello admin vengono
// cambiate o cancellate.

const VERSIONE = /^\d+\.\d+\.\d+$/;
const COLORE = /^#[0-9a-fA-F]{6}$/;

const testo = (valore, massimo) => typeof valore === 'string' && valore.trim().length > 0 && valore.length <= massimo;
const facoltativo = (valore, massimo) => valore == null || testo(valore, massimo);

/**
 * I problemi del file delle storie, uno per riga; vuoto se e' tutto a posto.
 * @param {unknown} storie il contenuto di prisma/novita.json
 * @returns {string[]}
 */
export function problemiStorie(storie) {
  if (!Array.isArray(storie)) return ['Il file deve contenere un elenco di storie'];
  const problemi = [];
  const titoli = new Set();
  storie.forEach((storia, indice) => {
    const dove = `Storia ${indice + 1}${testo(storia?.titolo, 200) ? ` («${storia.titolo}»)` : ''}`;
    if (!storia || typeof storia !== 'object') { problemi.push(`${dove}: non e' un oggetto`); return; }
    if (!VERSIONE.test(storia.versione ?? '')) problemi.push(`${dove}: versione mancante o non nel formato 1.2.3`);
    if (!testo(storia.titolo, 200)) problemi.push(`${dove}: titolo mancante o troppo lungo`);
    else if (titoli.has(storia.titolo)) problemi.push(`${dove}: titolo ripetuto`);
    else titoli.add(storia.titolo);
    if (!facoltativo(storia.sottotitolo, 300)) problemi.push(`${dove}: sottotitolo troppo lungo`);
    if (!facoltativo(storia.icona, 20)) problemi.push(`${dove}: icona non valida`);
    if (!facoltativo(storia.ctaTesto, 60)) problemi.push(`${dove}: ctaTesto troppo lungo`);
    if (storia.ctaRotta != null && !(testo(storia.ctaRotta, 200) && storia.ctaRotta.startsWith('/'))) {
      problemi.push(`${dove}: ctaRotta deve essere un percorso dell'app, come /profilo`);
    }
    for (const chiave of ['coloreInizio', 'coloreFine']) {
      if (storia[chiave] != null && !COLORE.test(storia[chiave])) problemi.push(`${dove}: ${chiave} deve essere un colore come #9060fb`);
    }
    if (storia.punti != null) {
      const validi = Array.isArray(storia.punti) && storia.punti.every(p => p && facoltativo(p.icona, 20) && testo(p.testo, 300));
      if (!validi) problemi.push(`${dove}: punti deve essere un elenco di { icona, testo }`);
    }
    if (storia.ordine != null && !Number.isInteger(storia.ordine)) problemi.push(`${dove}: ordine deve essere un numero intero`);
  });
  return problemi;
}

/**
 * Le righe da aggiungere alla tabella novita per una versione, nell'ordine del
 * file: la prima storia del file e' la prima che si vede (a parita' di
 * `ordine` l'app mostra prima la piu' recente, quindi gli orari scalano).
 * @param {object[]} storie
 * @param {string} versione
 * @param {Date} adesso
 */
export function righeDellaVersione(storie, versione, adesso = new Date()) {
  return storie
    .filter(storia => storia.versione === versione)
    .map((storia, indice) => ({
      titolo: storia.titolo,
      sottotitolo: storia.sottotitolo ?? null,
      icona: storia.icona ?? null,
      punti: storia.punti ? JSON.stringify(storia.punti) : null,
      ctaTesto: storia.ctaTesto ?? null,
      ctaRotta: storia.ctaRotta ?? null,
      coloreInizio: storia.coloreInizio ?? null,
      coloreFine: storia.coloreFine ?? null,
      ordine: storia.ordine ?? 0,
      attiva: true,
      creatoIl: new Date(adesso.getTime() - indice * 1000)
    }));
}
