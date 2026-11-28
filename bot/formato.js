// ============================================
// GymMaster — What the bot writes: texts, keyboards, escaping
// Pure functions (no grammY, no network), so the tests can import them
// (backend/test/unitari/bot-formato.test.js). bot.js only wires them to
// Telegram.
// ============================================

import { t } from './testi.js';

/**
 * Escaping for Telegram's HTML parse_mode: titles and names come from users
 * and from the catalog. HTML rather than Markdown: legacy Markdown cannot
 * escape inside a bold text ("*Upper_A *heavy**" is refused), MarkdownV2
 * would need every "." "!" "-" "(" of our own texts escaped.
 */
export function escapeHtml(testo = '') {
  return String(testo).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The formatting of every message with <b>/<i> (texts from the backend included) */
export const HTML = { parse_mode: 'HTML' };

/**
 * Telegram refuses a message longer than 4096 characters. The raw HTML is
 * measured, which is longer than what Telegram counts (an entity like &amp;
 * counts 1 there), and the limit keeps a margin for the tags closed at the
 * end of a piece and opened again at the start of the next one.
 */
export const CARATTERI_MESSAGGIO_MASSIMI = 4000;

const TAG = /<(\/?)([a-z]+)[^>]*>/gi;

/** The tags still open at the end of `testo`, given those open at its start: [{ nome, apertura }] */
function tagAperti(testo, aperti) {
  const pila = [...aperti];
  for (const [apertura, chiusura, nome] of testo.matchAll(TAG)) {
    if (!chiusura) { pila.push({ nome: nome.toLowerCase(), apertura }); continue; }
    const i = pila.map(t => t.nome).lastIndexOf(nome.toLowerCase());
    if (i >= 0) pila.splice(i, 1);
  }
  return pila;
}

/**
 * A line too long for one message, cut into pieces of at most `massimo`: its
 * formatting is dropped (tags out, so none is cut), and a cut never falls
 * inside an entity (&amp;) or between the two halves of an emoji
 */
function tagliaRiga(riga, massimo) {
  let resto = riga.replace(TAG, '');
  const pezzi = [];
  while (resto.length > massimo) {
    let taglio = massimo;
    // An escaped text has "&" only at the start of an entity: one that ends after the cut moves the cut before it
    const e = resto.lastIndexOf('&', taglio - 1);
    if (e > 0 && resto.indexOf(';', e) >= taglio) taglio = e;
    const codice = resto.charCodeAt(taglio - 1);
    if (codice >= 0xd800 && codice <= 0xdbff) taglio--;
    pezzi.push(resto.slice(0, taglio));
    resto = resto.slice(taglio);
  }
  pezzi.push(resto);
  return pezzi;
}

/**
 * Splits a ready HTML text into pieces Telegram takes (at most `massimo`
 * characters each, tags included). It cuts between lines; a tag open at a
 * cut is closed at the end of the piece and opened again in the next. A text
 * that fits is one piece, unchanged.
 */
export function dividiHtml(testo, massimo = CARATTERI_MESSAGGIO_MASSIMI) {
  testo = String(testo);
  if (testo.length <= massimo) return [testo];
  // Room for closing and opening the tags around a cut
  const spazio = massimo - 64;
  const righe = testo.split('\n').flatMap(riga => (riga.length > spazio ? tagliaRiga(riga, spazio) : [riga]));
  const gruppi = [];
  let corrente = null;
  for (const riga of righe) {
    if (corrente !== null && corrente.length + 1 + riga.length <= spazio) corrente += `\n${riga}`;
    else {
      if (corrente !== null) gruppi.push(corrente);
      corrente = riga;
    }
  }
  gruppi.push(corrente);
  let aperti = [];
  return gruppi.map(gruppo => {
    const prima = aperti.map(t => t.apertura).join('');
    aperti = tagAperti(gruppo, aperti);
    const dopo = [...aperti].reverse().map(t => `</${t.nome}>`).join('');
    return prima + gruppo + dopo;
  });
}

/**
 * The messages for a reply in HTML: the pieces of `testo`, each with the
 * formatting, and the keyboard (or any other option in `extra`) only on the
 * last one, so the buttons stay under the whole text. [[text, options], ...]
 */
export function messaggiHtml(testo, extra = {}) {
  const pezzi = dividiHtml(testo);
  return pezzi.map((pezzo, i) => [pezzo, i === pezzi.length - 1 ? { ...HTML, ...extra } : HTML]);
}

/** The key for @grammyjs/runner's sequentialize: one chat in order, the chats in parallel */
export const chiaveChat = (ctx) => ctx.chat?.id?.toString();

export function messaggioErrore(ctx, r) {
  if (r.status === 409 && r.corpo?.codice === 'NON_COLLEGATO') return t(ctx, 'nonCollegato');
  return `⚠️ ${r.corpo?.messaggio || t(ctx, 'erroreGenerico')}`;
}

/** The answer to a command the bot does not have: what it can do */
export const testoComandoSconosciuto = (ctx) => t(ctx, 'comandoSconosciuto');

/** The name to show for a region or muscle group: the backend sends it back as is to pick it, with the label in `etichette` */
const etichetta = (dati, nome) => dati.etichette?.[nome] || nome;

/** Telegram refuses a whole keyboard when one callback_data is longer than this */
export const BYTE_CALLBACK_MASSIMI = 64;
const entraNelCallback = dati => Buffer.byteLength(dati, 'utf8') <= BYTE_CALLBACK_MASSIMI;

/**
 * An inline keyboard from rows of [text, callback data], as Telegram takes it.
 * A button whose data would be too long (a name from the catalog) is left
 * out, so the others still reach the user.
 */
export function tastiera(righe) {
  return {
    inline_keyboard: righe
      .map(riga => riga.filter(([, dati]) => entraNelCallback(dati)).map(([text, callback_data]) => ({ text, callback_data })))
      .filter(riga => riga.length)
  };
}

/** One button per row */
const inColonna = (bottoni) => tastiera(bottoni.map(b => [b]));

/** /schede: the first 20 plans, with their number of exercises */
export const tastieraSchede = (schede) => inColonna(schede.slice(0, 20).map(s => [`${s.titolo} (${s.numEsercizi})`, `scheda:${s.id}`]));

/** A list's heading, with "…and N more in the app" when the backend sent only the newest */
const conAltre = (ctx, testo, altre) => (altre > 0 ? `${testo}\n${t(ctx, 'altreNellApp', { count: altre })}` : testo);

/**
 * /schede: the user's own plans, then the global ones, each list in its own
 * message with its buttons (plain text: the titles are on the buttons).
 * No own plan: how to make one, then the global ones. [[text, options], ...]
 */
export function messaggiSchede(ctx, dati = {}) {
  const { proprie = [], globali = [], altreProprie = 0, altreGlobali = 0 } = dati;
  if (!proprie.length && !globali.length) return [[t(ctx, 'nessunaScheda'), {}]];
  const messaggi = [proprie.length
    ? [conAltre(ctx, t(ctx, 'leTueSchede'), altreProprie), { reply_markup: tastieraSchede(proprie) }]
    : [t(ctx, 'nessunaSchedaTua'), {}]];
  if (globali.length) messaggi.push([conAltre(ctx, t(ctx, 'schedeGlobali'), altreGlobali), { reply_markup: tastieraSchede(globali) }]);
  return messaggi;
}

/** /guidata: the most used, cardio (when the catalog has it), then the body regions */
export function tastieraCategorie(ctx, dati) {
  const cardio = dati.cardio ? [[t(ctx, 'guidataCardio'), 'gcat:__cardio__']] : [];
  return inColonna([[t(ctx, 'guidataPiuUsati'), 'gcat:__usati__'], ...cardio, ...(dati.regioni || []).map(reg => [etichetta(dati, reg), `gcat:${reg}`])]);
}

/** /guidata with a draft that is not empty: go on with it, or start again (the draft is cleared, like /nuova) */
export const tastieraBozzaInCorso = (ctx, numero) => inColonna([
  [t(ctx, 'continuaBozza', { count: numero }), 'gcont'],
  [t(ctx, 'ricomincia'), 'griniz']
]);

/**
 * The callback data of the "More ▶" / "◀ Back" buttons: the offset of the
 * page first, so a group name is never read as a number. The group buttons
 * keep "ggrp:<group>" (the first page, in a new message).
 */
export const datiPaginaGruppo = (gruppo, offset) => `gpg:${offset}:${gruppo}`;
export const datiPaginaCardio = (offset) => `gcar:${offset}`;

export const tastieraGruppi = (dati) => inColonna((dati.gruppi || []).map(g => [etichetta(dati, g), `ggrp:${g}`]));

// A cardio exercise (the backend says so) asks for minutes, the others for sets x reps
const pulsanteEsercizio = (e) => (e.cardio ? `gcx:${e.id}` : `gex:${e.id}`);

/**
 * The exercises of a page, one per row, then "◀ Back" and "More ▶" when the
 * backend says there are other pages (`precedente`, `successivo`).
 * `versoPagina(offset)` gives the callback data of another page.
 */
export function tastieraEsercizi(esercizi, ctx, pagina = {}, versoPagina) {
  const righe = esercizi.map(e => [[e.nome, pulsanteEsercizio(e)]]);
  if (ctx && versoPagina) {
    const navigazione = [];
    if (pagina.precedente != null) navigazione.push([t(ctx, 'paginaPrecedente'), versoPagina(pagina.precedente)]);
    if (pagina.successivo != null) navigazione.push([t(ctx, 'paginaSuccessiva'), versoPagina(pagina.successivo)]);
    if (navigazione.length) righe.push(navigazione);
  }
  return tastiera(righe);
}

export const tastieraSerie = (id) => tastiera([
  [['3×8', `gadd:${id}:3:8`], ['3×10', `gadd:${id}:3:10`], ['3×12', `gadd:${id}:3:12`]],
  [['4×10', `gadd:${id}:4:10`], ['4×12', `gadd:${id}:4:12`], ['3×8-12', `gadd:${id}:3:8-12`]]
]);

export const tastieraMinuti = (id) => tastiera([[10, 15, 20, 30].map(minuti => [`${minuti} min`, `gcadd:${id}:${minuti}`])]);

/**
 * After a step of the guided creation: add another, finish, and, when the
 * backend says they fit the last entry, "Note" and "Join the previous one"
 */
export function tastieraDopoAggiunta(ctx, d = {}) {
  const extra = [];
  if (d.nota) extra.push([t(ctx, 'pulsanteNota'), 'gnota']);
  if (d.unibile) extra.push([t(ctx, 'pulsanteUnisci'), 'gunisci']);
  return tastiera([[[t(ctx, 'aggiungiAltro'), 'gmenu'], [t(ctx, 'termina'), 'gfine']], extra]);
}

/** "Note": the question for the note of the last entry (HTML), with a way back to the categories */
export const testoChiediNota = (ctx, d) => t(ctx, 'chiediNota', { nome: escapeHtml(d.nome) });
export const tastieraNota = (ctx) => tastiera([[[t(ctx, 'aggiungiAltro'), 'gmenu']]]);

/** The note saved, with the draft summary (HTML, escaped by the backend) */
export const testoNotaSalvata = (ctx, d) => t(ctx, 'notaSalvata', { nome: escapeHtml(d.nome), riepilogo: d.riepilogo });

/** The superset or circuit made by "Join the previous one", with the draft summary (HTML, escaped by the backend) */
export const testoUnito = (ctx, d) =>
  t(ctx, d.tipo === 'circuito' ? 'unitoCircuito' : 'unitoSuperset', { lettera: escapeHtml(d.gruppo), riepilogo: d.riepilogo });

/** The answer after an exercise is added (HTML): the backend tells whether it became cardio */
export function testoAggiunto(ctx, d, serie, ripetizioni) {
  const nome = escapeHtml(d.aggiunto);
  return d.cardio
    ? t(ctx, 'aggiuntoCardio', { nome, minuti: escapeHtml(d.durataMinuti), count: d.totaleEsercizi })
    : t(ctx, 'aggiunto', { nome, serie: escapeHtml(serie), ripetizioni: escapeHtml(ripetizioni), count: d.totaleEsercizi });
}

/** "Finish": the question for the title, with the proposed one (HTML) and its keyboard */
export const testoChiediTitolo = (ctx, d) => t(ctx, 'chiediTitolo', { titolo: escapeHtml(d.titoloProposto) });
export const tastieraTitolo = (ctx) => tastiera([[[t(ctx, 'usaTitoloProposto'), 'gtit']], [[t(ctx, 'aggiungiAltro'), 'gmenu']]]);

/**
 * The answer after the guided creation saved the plan (HTML): first the
 * exercises taken out because they are no longer in the catalog, if any
 */
export function testoSchedaSalvata(ctx, d) {
  const tolti = (d.tolti || []).map(nome => t(ctx, 'toltoDalCatalogo', { nome: escapeHtml(nome) }));
  return [...tolti, t(ctx, 'schedaSalvata', { titolo: escapeHtml(d.titolo), count: d.numEsercizi })].join('\n');
}
