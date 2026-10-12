// ============================================
// GymMaster — "What's new" stories of a release
// ============================================
//
// The stories live in prisma/novita.json, each with the version that brings it.
// The base fields are Italian; "en" holds the English version of the texts
// (titolo, sottotitolo, punti, ctaTesto), shown to users in English.
// When that version is released they are added to the novita table
// (services/novitaRilascio.service.js), only once: the stories of past
// versions are never touched again, even if they are changed or deleted
// from the admin panel.

const VERSIONE = /^\d+\.\d+\.\d+$/;
const COLORE = /^#[0-9a-fA-F]{6}$/;

const testo = (valore, massimo) => typeof valore === 'string' && valore.trim().length > 0 && valore.length <= massimo;
const facoltativo = (valore, massimo) => valore == null || testo(valore, massimo);

/**
 * The problems of the stories file, one per line; empty if everything is fine.
 * @param {unknown} storie the content of prisma/novita.json
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
    if (storia.en != null) {
      const en = storia.en;
      const valida = typeof en === 'object' && testo(en.titolo, 200) && facoltativo(en.sottotitolo, 300) && facoltativo(en.ctaTesto, 60) &&
        (en.punti == null || (Array.isArray(en.punti) && en.punti.length === (storia.punti?.length ?? 0) &&
          en.punti.every(p => p && facoltativo(p.icona, 20) && testo(p.testo, 300))));
      if (!valida) problemi.push(`${dove}: en deve avere titolo, e gli stessi punti della storia`);
    }
  });
  return problemi;
}

/** The translatable texts of a story */
const CAMPI_TRADOTTI = ['titolo', 'sottotitolo', 'punti', 'ctaTesto'];

/**
 * A row of the novita table as the app shows it in `lingua`: the texts of
 * that language when the story has them (traduzioni), otherwise the base ones.
 * `punti` comes back as the JSON string the table stores.
 */
export function storiaInLingua(riga, lingua) {
  let traduzioni = null;
  try { traduzioni = riga.traduzioni ? JSON.parse(riga.traduzioni) : null; } catch { /* unreadable: the base texts */ }
  const versione = traduzioni?.[lingua];
  const { traduzioni: _, ...base } = riga;
  if (!versione) return base;
  const tradotta = { ...base };
  for (const campo of CAMPI_TRADOTTI) {
    if (versione[campo] == null) continue;
    tradotta[campo] = campo === 'punti' ? JSON.stringify(versione.punti) : versione[campo];
  }
  return tradotta;
}

/**
 * The rows to add to the novita table for a version, in the order of the
 * file: the first story in the file is the first one shown (with the same
 * `ordine` the app shows the most recent first, so the timestamps step back).
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
      traduzioni: storia.en ? JSON.stringify({ en: storia.en }) : null,
      ordine: storia.ordine ?? 0,
      attiva: true,
      creatoIl: new Date(adesso.getTime() - indice * 1000)
    }));
}
