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

/** An inline keyboard from rows of [text, callback data], as Telegram takes it */
export function tastiera(righe) {
  return { inline_keyboard: righe.map(riga => riga.map(([text, callback_data]) => ({ text, callback_data }))) };
}

/** One button per row */
const inColonna = (bottoni) => tastiera(bottoni.map(b => [b]));

/** /schede: the first 20 plans, with their number of exercises */
export const tastieraSchede = (schede) => inColonna(schede.slice(0, 20).map(s => [`${s.titolo} (${s.numEsercizi})`, `scheda:${s.id}`]));

/** /guidata: the most used, then the body regions */
export function tastieraCategorie(ctx, dati) {
  return inColonna([[t(ctx, 'guidataPiuUsati'), 'gcat:__usati__'], ...(dati.regioni || []).map(reg => [etichetta(dati, reg), `gcat:${reg}`])]);
}

export const tastieraGruppi = (dati) => inColonna((dati.gruppi || []).map(g => [etichetta(dati, g), `ggrp:${g}`]));

// A cardio exercise (the backend says so) asks for minutes, the others for sets x reps
const pulsanteEsercizio = (e) => (e.cardio ? `gcx:${e.id}` : `gex:${e.id}`);
export const tastieraEsercizi = (esercizi) => inColonna(esercizi.map(e => [e.nome, pulsanteEsercizio(e)]));

export const tastieraSerie = (id) => tastiera([
  [['3×8', `gadd:${id}:3:8`], ['3×10', `gadd:${id}:3:10`], ['3×12', `gadd:${id}:3:12`]],
  [['4×10', `gadd:${id}:4:10`], ['4×12', `gadd:${id}:4:12`], ['3×8-12', `gadd:${id}:3:8-12`]]
]);

export const tastieraMinuti = (id) => tastiera([[10, 15, 20, 30].map(minuti => [`${minuti} min`, `gcadd:${id}:${minuti}`])]);

export const tastieraDopoAggiunta = (ctx) => tastiera([[[t(ctx, 'aggiungiAltro'), 'gmenu'], [t(ctx, 'termina'), 'gfine']]]);

/** The answer after an exercise is added (HTML): the backend tells whether it became cardio */
export function testoAggiunto(ctx, d, serie, ripetizioni) {
  const nome = escapeHtml(d.aggiunto);
  return d.cardio
    ? t(ctx, 'aggiuntoCardio', { nome, minuti: escapeHtml(d.durataMinuti), count: d.totaleEsercizi })
    : t(ctx, 'aggiunto', { nome, serie: escapeHtml(serie), ripetizioni: escapeHtml(ripetizioni), count: d.totaleEsercizi });
}

/** The answer after the guided creation saved the plan (HTML) */
export const testoSchedaSalvata = (ctx, d) => t(ctx, 'schedaSalvata', { titolo: escapeHtml(d.titolo), count: d.numEsercizi });
