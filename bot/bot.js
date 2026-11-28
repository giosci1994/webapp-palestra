// ============================================
// GymMaster — Telegram Bot (grammY)
// Thin container: forwards messages to the backend (/api/v1/bot/*)
// with the X-Bot-Secret header. All the logic (AI, matching, DB) is in the backend.
// ============================================

import { Bot } from 'grammy';
import { run, sequentialize } from '@grammyjs/runner';
import { createServer } from 'node:http';
import { t, ricordaLingua } from './testi.js';
import { nomiComando, menuComandi } from './comandi.js';
import {
  chiaveChat, messaggiHtml, messaggioErrore, messaggiSchede, testoComandoSconosciuto, testoAggiunto, testoSchedaSalvata, testoChiediTitolo,
  tastieraCategorie, tastieraBozzaInCorso, tastieraGruppi, tastieraEsercizi, tastieraSerie, tastieraMinuti,
  tastieraDopoAggiunta, tastieraTitolo, datiPaginaGruppo, datiPaginaCardio,
  testoChiediNota, tastieraNota, testoNotaSalvata, testoUnito
} from './formato.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';
const BOT_SECRET = process.env.BOT_SECRET;

if (!TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN mancante'); process.exit(1); }
if (!BOT_SECRET) { console.error('❌ BOT_SECRET mancante'); process.exit(1); }

const bot = new Bot(TOKEN);

// The runner handles updates in parallel: one user waiting for the AI does not
// make the others wait. Within one chat they stay in order (the draft is
// changed one step at a time; the backend also locks per user).
bot.use(sequentialize(chiaveChat));

// --- Helper: calls the backend ---
const TIMEOUT_BACKEND = 30000;

// The Telegram user's language goes in Accept-Language: the backend answers in
// it (for a linked user, the language of their account wins there).
async function api(ctx, percorso, body) {
  const intestazioni = { 'Content-Type': 'application/json', 'X-Bot-Secret': BOT_SECRET };
  const lingua = ctx.from?.language_code;
  if (lingua && /^[\w-]{2,16}$/.test(lingua)) intestazioni['Accept-Language'] = lingua;
  try {
    const resp = await fetch(`${BACKEND_URL}/api/v1/bot/${percorso}`, {
      method: 'POST',
      headers: intestazioni,
      body: JSON.stringify(body),
      // A backend that does not answer must not leave the user waiting
      // forever: 30s covers an answer of the AI assistant
      signal: AbortSignal.timeout(TIMEOUT_BACKEND)
    });
    ricordaLingua(ctx, resp.headers.get('content-language'));
    const corpo = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, corpo };
  } catch (errore) {
    console.error('Errore chiamata backend:', errore.message);
    return { ok: false, status: 0, corpo: { messaggio: t(ctx, 'backendNonRaggiungibile') } };
  }
}

const chatId = (ctx) => String(ctx.chat.id);

// An HTML reply in as many messages as Telegram needs (4096 characters each),
// the keyboard under the last one
async function rispondiHtml(ctx, testo, extra = {}) {
  for (const [pezzo, opzioni] of messaggiHtml(testo, extra)) await ctx.reply(pezzo, opzioni);
}

// --- /start [code] ---
bot.command(nomiComando('start'), async (ctx) => {
  const codice = (ctx.match || '').trim();
  if (codice) {
    const r = await api(ctx, 'collega', { chatId: chatId(ctx), codice });
    if (r.ok) {
      await ctx.reply(t(ctx, 'collegato', { nome: r.corpo.dati.nome }));
    } else {
      await ctx.reply(`❌ ${r.corpo?.messaggio || t(ctx, 'codiceNonValido')}`);
    }
    return;
  }
  await ctx.reply(t(ctx, 'benvenuto'));
});

// Every command answers to its Italian and its English name (comandi.js)

// --- /nuova, /new: starts the creation by text (clears the draft) ---
bot.command(nomiComando('nuova'), async (ctx) => {
  const r = await api(ctx, 'annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(t(ctx, 'nuova'));
});

// --- /annulla, /cancel ---
bot.command(nomiComando('annulla'), async (ctx) => {
  const r = await api(ctx, 'annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(t(ctx, 'bozzaAnnullata'));
});

// --- /schede, /plans: the own plans, then the global ones ---
bot.command(nomiComando('schede'), async (ctx) => {
  const r = await api(ctx, 'schede', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  for (const [testo, extra] of messaggiSchede(ctx, r.corpo.dati)) await ctx.reply(testo, extra);
});

// --- /statistiche, /stats ---
bot.command(nomiComando('statistiche'), async (ctx) => {
  const r = await api(ctx, 'statistiche', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  // HTML, escaped by the backend
  await rispondiHtml(ctx, r.corpo.dati.testo);
});

// --- /guidata, /guided: button-based creation by categories ---
// With a draft that is not empty, /guidata first asks whether to go on with it
// (the exercises dictated to the AI in the last hours would end up in the plan)
async function mostraCategorie(ctx, chiediDellaBozza = false) {
  const r = await api(ctx, 'guida/categorie', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const numero = r.corpo.dati.bozza?.numEsercizi || 0;
  if (chiediDellaBozza && numero > 0) {
    await ctx.reply(t(ctx, 'bozzaInCorso', { count: numero }), { reply_markup: tastieraBozzaInCorso(ctx, numero) });
    return;
  }
  await ctx.reply(t(ctx, 'guidataInizio'), { reply_markup: tastieraCategorie(ctx, r.corpo.dati) });
}
bot.command(nomiComando('guidata'), (ctx) => mostraCategorie(ctx, true));

bot.callbackQuery(['gmenu', 'gcont'], async (ctx) => { await ctx.answerCallbackQuery(); await mostraCategorie(ctx); });

// "Start again": the draft is cleared, like /nuova
bot.callbackQuery('griniz', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'annulla', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await mostraCategorie(ctx);
});

/**
 * A page of exercises. A "More ▶" / "◀ Back" button changes the message it is
 * on instead of sending a new one (a new message if Telegram refuses, for
 * example on a very old message).
 */
async function mostraPaginaEsercizi(ctx, corpo, testo, versoPagina, cambiaMessaggio) {
  const r = await api(ctx, 'guida/esercizi', { chatId: chatId(ctx), ...corpo });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return null; }
  const dati = r.corpo.dati;
  if (!dati.esercizi?.length) return dati;
  const extra = { reply_markup: tastieraEsercizi(dati.esercizi, ctx, dati, versoPagina) };
  const scritto = typeof testo === 'function' ? testo(dati) : testo;
  if (cambiaMessaggio) {
    try { await ctx.editMessageText(scritto, extra); return dati; } catch { /* a new message below */ }
  }
  await ctx.reply(scritto, extra);
  return dati;
}

const testoGruppo = (ctx, gruppo) => (dati) => t(ctx, 'scegliEsercizio', { gruppo: dati.etichettaGruppo || gruppo });

async function mostraCardio(ctx, offset, cambiaMessaggio) {
  const dati = await mostraPaginaEsercizi(ctx, { soloCardio: true, offset }, t(ctx, 'scegliCardio'), datiPaginaCardio, cambiaMessaggio);
  if (dati && !dati.esercizi?.length) await ctx.reply(t(ctx, 'nessunCardio'));
}

bot.callbackQuery(/^gcar:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await mostraCardio(ctx, Number(ctx.match[1]), true);
});

bot.callbackQuery(/^gcat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const reg = ctx.match[1];
  if (reg === '__usati__') {
    const r = await api(ctx, 'guida/esercizi', { chatId: chatId(ctx), soloPiuUsati: true });
    if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
    const es = r.corpo.dati.esercizi || [];
    if (!es.length) { await ctx.reply(t(ctx, 'nessunPiuUsato')); await mostraCategorie(ctx); return; }
    await ctx.reply(t(ctx, 'eserciziPiuUsati'), { reply_markup: tastieraEsercizi(es) });
    return;
  }
  if (reg === '__cardio__') { await mostraCardio(ctx, 0, false); return; }
  const r = await api(ctx, 'guida/gruppi', { chatId: chatId(ctx), bodyRegion: reg });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const gruppi = r.corpo.dati.gruppi || [];
  if (!gruppi.length) { await ctx.reply(t(ctx, 'nessunGruppo')); return; }
  await ctx.reply(t(ctx, 'scegliGruppo', { regione: r.corpo.dati.etichettaRegione || reg }), { reply_markup: tastieraGruppi(r.corpo.dati) });
});

// A muscle group: its first page in a new message, the other pages from
// "More ▶" / "◀ Back" in the same message
async function mostraGruppo(ctx, gruppo, offset, cambiaMessaggio) {
  const versoPagina = (altro) => datiPaginaGruppo(gruppo, altro);
  const dati = await mostraPaginaEsercizi(ctx, { gruppo, offset }, testoGruppo(ctx, gruppo), versoPagina, cambiaMessaggio);
  if (dati && !dati.esercizi?.length) await ctx.reply(t(ctx, 'nessunEsercizio'));
}

bot.callbackQuery(/^ggrp:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await mostraGruppo(ctx, ctx.match[1], 0, false);
});

bot.callbackQuery(/^gpg:(\d+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await mostraGruppo(ctx, ctx.match[2], Number(ctx.match[1]), true);
});

bot.callbackQuery(/^gex:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(t(ctx, 'serieRipetizioni'), { reply_markup: tastieraSerie(ctx.match[1]) });
});

bot.callbackQuery(/^gcx:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(t(ctx, 'minutiCardio'), { reply_markup: tastieraMinuti(ctx.match[1]) });
});

/** The answer after an exercise is added: the backend tells whether it became cardio */
async function rispondiAggiunto(ctx, r, serie, rip) {
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await rispondiHtml(ctx, testoAggiunto(ctx, r.corpo.dati, serie, rip), { reply_markup: tastieraDopoAggiunta(ctx, r.corpo.dati) });
}

bot.callbackQuery(/^gcadd:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1], minuti = ctx.match[2];
  const r = await api(ctx, 'guida/aggiungi', { chatId: chatId(ctx), esercizioId: id, durataMinuti: minuti });
  await rispondiAggiunto(ctx, r);
});

bot.callbackQuery(/^gadd:(\d+):(\d+):(\S+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1], serie = ctx.match[2], rip = ctx.match[3];
  const r = await api(ctx, 'guida/aggiungi', { chatId: chatId(ctx), esercizioId: id, serie, ripetizioni: rip });
  await rispondiAggiunto(ctx, r, serie, rip);
});

// "Note": the next text is the note of the last entry (the backend knows it is waiting)
bot.callbackQuery('gnota', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'guida/nota', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await rispondiHtml(ctx, testoChiediNota(ctx, r.corpo.dati), { reply_markup: tastieraNota(ctx) });
});

// "Join the previous one": a superset (or a circuit, if the previous one was in a group)
bot.callbackQuery('gunisci', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'guida/unisci', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await rispondiHtml(ctx, testoUnito(ctx, r.corpo.dati), { reply_markup: tastieraDopoAggiunta(ctx, r.corpo.dati) });
});

// "Finish" asks for the title: the next text is the title (the backend
// knows it is waiting), or the button takes the proposed one
bot.callbackQuery('gfine', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'guida/titolo', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await rispondiHtml(ctx, testoChiediTitolo(ctx, r.corpo.dati), { reply_markup: tastieraTitolo(ctx) });
});

bot.callbackQuery('gtit', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'guida/termina', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await rispondiHtml(ctx, testoSchedaSalvata(ctx, r.corpo.dati));
});

// --- Callback: plan details ---
bot.callbackQuery(/^scheda:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const schedaId = ctx.match[1];
  const r = await api(ctx, 'scheda', { chatId: chatId(ctx), schedaId });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  // HTML, escaped by the backend
  await rispondiHtml(ctx, r.corpo.dati.testo);
});

// --- Free-text messages -> conversational engine ---
bot.on('message:text', async (ctx) => {
  const testo = ctx.message.text || '';
  // The known commands, in both languages, are handled above: any other gets what the bot can do
  if (testo.startsWith('/')) { await ctx.reply(testoComandoSconosciuto(ctx)); return; }
  await ctx.replyWithChatAction('typing').catch(() => {});
  const r = await api(ctx, 'messaggio', { chatId: chatId(ctx), testo });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  // The text was the title the guided creation asked for: the plan is saved
  if (r.corpo.dati.scheda) { await rispondiHtml(ctx, testoSchedaSalvata(ctx, r.corpo.dati.scheda)); return; }
  // The text was the note "Note" asked for
  if (r.corpo.dati.nota) {
    await rispondiHtml(ctx, testoNotaSalvata(ctx, r.corpo.dati.nota), { reply_markup: tastieraDopoAggiunta(ctx, r.corpo.dati.nota) });
    return;
  }
  await ctx.reply(r.corpo.dati.risposta);
});

// --- Global error handling ---
// A failed reply (Telegram refusing a message, the network) must not leave
// the user without an answer: the generic error, if Telegram takes even that
bot.catch(async (err) => {
  console.error('Errore bot:', err.error?.message || err.message || err);
  try {
    if (err.ctx?.chat) await err.ctx.reply(`⚠️ ${t(err.ctx, 'erroreGenerico')}`);
  } catch (e) {
    console.error('Risposta di errore non inviata:', e.message);
  }
});

// Status signal for the container healthcheck.
// The bot works in long-polling and exposes nothing: without this, the only
// possible check would be "the process exists", which would stay green even
// with the bot disconnected from Telegram. Here the response turns positive
// only after Telegram has confirmed the start.
let avviato = false;
let runner = null;
const attivo = () => avviato && !!runner?.isRunning();
const PORTA_STATO = Number(process.env.PORTA_STATO) || 3001;
const serverStato = createServer((req, res) => {
  if (req.url === '/stato') {
    res.writeHead(attivo() ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ avviato: attivo() }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORTA_STATO, '127.0.0.1');

async function impostaComandi() {
  try {
    // The English commands for everybody, the Italian ones for Telegram users
    // whose language is Italian (both names work for everybody)
    await bot.api.setMyCommands(menuComandi('en'));
    await bot.api.setMyCommands(menuComandi('it'), { language_code: 'it' });
  } catch (e) {
    console.error('setMyCommands fallito:', e.message);
  }
}

// Stops taking updates, lets the ones in progress finish, then exits
// (docker stop sends SIGTERM)
async function arresta(segnale) {
  console.log(`${segnale}: arresto del bot`);
  avviato = false;
  try {
    if (runner?.isRunning()) await runner.stop();
  } finally {
    serverStato.close();
    process.exit(0);
  }
}
process.once('SIGINT', () => arresta('SIGINT'));
process.once('SIGTERM', () => arresta('SIGTERM'));

// Like bot.start(): Telegram confirms the token (getMe), long polling needs no
// webhook, then the runner starts fetching updates
async function avvia() {
  await bot.init();
  await bot.api.deleteWebhook();
  runner = run(bot);
  avviato = true;
  console.log(`🤖 GymBot avviato come @${bot.botInfo.username}`);
  await impostaComandi();
}

avvia().catch((e) => {
  console.error('Avvio del bot fallito:', e.message);
  process.exit(1);
});
