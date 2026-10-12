// ============================================
// GymMaster — Telegram Bot (grammY)
// Thin container: forwards messages to the backend (/api/v1/bot/*)
// with the X-Bot-Secret header. All the logic (AI, matching, DB) is in the backend.
// ============================================

import { Bot, InlineKeyboard } from 'grammy';
import { createServer } from 'node:http';
import { t, tLingua, ricordaLingua } from './testi.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';
const BOT_SECRET = process.env.BOT_SECRET;

if (!TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN mancante'); process.exit(1); }
if (!BOT_SECRET) { console.error('❌ BOT_SECRET mancante'); process.exit(1); }

const bot = new Bot(TOKEN);

// --- Helper: calls the backend ---
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
      body: JSON.stringify(body)
    });
    ricordaLingua(ctx, resp.headers.get('content-language'));
    const corpo = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, corpo };
  } catch (errore) {
    console.error('Errore chiamata backend:', errore.message);
    return { ok: false, status: 0, corpo: { messaggio: t(ctx, 'backendNonRaggiungibile') } };
  }
}

function messaggioErrore(ctx, r) {
  if (r.status === 409 && r.corpo?.codice === 'NON_COLLEGATO') return t(ctx, 'nonCollegato');
  return `⚠️ ${r.corpo?.messaggio || t(ctx, 'erroreGenerico')}`;
}

/** The name to show for a region or muscle group: the backend sends it back as is to pick it, with the label in `etichette` */
const etichetta = (dati, nome) => dati.etichette?.[nome] || nome;

const chatId = (ctx) => String(ctx.chat.id);

// --- /start [code] ---
bot.command('start', async (ctx) => {
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

// --- /nuova: starts the guided creation (clears the draft) ---
bot.command('nuova', async (ctx) => {
  const r = await api(ctx, 'annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(t(ctx, 'nuova'));
});

// --- /annulla ---
bot.command('annulla', async (ctx) => {
  const r = await api(ctx, 'annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(t(ctx, 'bozzaAnnullata'));
});

// --- /schede ---
bot.command('schede', async (ctx) => {
  const r = await api(ctx, 'schede', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const schede = r.corpo.dati || [];
  if (!schede.length) { await ctx.reply(t(ctx, 'nessunaScheda')); return; }
  const tastiera = new InlineKeyboard();
  schede.slice(0, 20).forEach((s) => {
    tastiera.text(`${s.titolo} (${s.numEsercizi})`, `scheda:${s.id}`).row();
  });
  await ctx.reply(t(ctx, 'leTueSchede'), { reply_markup: tastiera });
});

// --- /statistiche ---
bot.command('statistiche', async (ctx) => {
  const r = await api(ctx, 'statistiche', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(r.corpo.dati.testo, { parse_mode: 'Markdown' });
});

// --- /guidata: button-based creation by categories ---
async function mostraCategorie(ctx) {
  const r = await api(ctx, 'guida/categorie', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const tastiera = new InlineKeyboard().text(t(ctx, 'guidataPiuUsati'), 'gcat:__usati__').row();
  (r.corpo.dati.regioni || []).forEach(reg => tastiera.text(etichetta(r.corpo.dati, reg), `gcat:${reg}`).row());
  await ctx.reply(t(ctx, 'guidataInizio'), { reply_markup: tastiera });
}
bot.command('guidata', (ctx) => mostraCategorie(ctx));

bot.callbackQuery('gmenu', async (ctx) => { await ctx.answerCallbackQuery(); await mostraCategorie(ctx); });

bot.callbackQuery(/^gcat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const reg = ctx.match[1];
  if (reg === '__usati__') {
    const r = await api(ctx, 'guida/esercizi', { chatId: chatId(ctx), soloPiuUsati: true });
    if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
    const es = r.corpo.dati.esercizi || [];
    if (!es.length) { await ctx.reply(t(ctx, 'nessunPiuUsato')); await mostraCategorie(ctx); return; }
    const tastiera = new InlineKeyboard();
    es.forEach(e => tastiera.text(e.nome, `gex:${e.id}`).row());
    await ctx.reply(t(ctx, 'eserciziPiuUsati'), { reply_markup: tastiera });
    return;
  }
  const r = await api(ctx, 'guida/gruppi', { chatId: chatId(ctx), bodyRegion: reg });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const gruppi = r.corpo.dati.gruppi || [];
  if (!gruppi.length) { await ctx.reply(t(ctx, 'nessunGruppo')); return; }
  const tastiera = new InlineKeyboard();
  gruppi.forEach(g => tastiera.text(etichetta(r.corpo.dati, g), `ggrp:${g}`).row());
  await ctx.reply(t(ctx, 'scegliGruppo', { regione: r.corpo.dati.etichettaRegione || reg }), { reply_markup: tastiera });
});

bot.callbackQuery(/^ggrp:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const gruppo = ctx.match[1];
  const r = await api(ctx, 'guida/esercizi', { chatId: chatId(ctx), gruppo });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const es = r.corpo.dati.esercizi || [];
  if (!es.length) { await ctx.reply(t(ctx, 'nessunEsercizio')); return; }
  const tastiera = new InlineKeyboard();
  es.forEach(e => tastiera.text(e.nome, `gex:${e.id}`).row());
  await ctx.reply(t(ctx, 'scegliEsercizio', { gruppo: r.corpo.dati.etichettaGruppo || gruppo }), { reply_markup: tastiera });
});

bot.callbackQuery(/^gex:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const tastiera = new InlineKeyboard()
    .text('3×8', `gadd:${id}:3:8`).text('3×10', `gadd:${id}:3:10`).text('3×12', `gadd:${id}:3:12`).row()
    .text('4×10', `gadd:${id}:4:10`).text('4×12', `gadd:${id}:4:12`).text('3×8-12', `gadd:${id}:3:8-12`).row();
  await ctx.reply(t(ctx, 'serieRipetizioni'), { reply_markup: tastiera });
});

bot.callbackQuery(/^gadd:(\d+):(\d+):(\S+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1], serie = ctx.match[2], rip = ctx.match[3];
  const r = await api(ctx, 'guida/aggiungi', { chatId: chatId(ctx), esercizioId: id, serie, ripetizioni: rip });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const d = r.corpo.dati;
  const tastiera = new InlineKeyboard().text(t(ctx, 'aggiungiAltro'), 'gmenu').text(t(ctx, 'termina'), 'gfine').row();
  await ctx.reply(
    t(ctx, 'aggiunto', { nome: d.aggiunto, serie, ripetizioni: rip, count: d.totaleEsercizi }),
    { parse_mode: 'Markdown', reply_markup: tastiera }
  );
});

bot.callbackQuery('gfine', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api(ctx, 'guida/termina', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  const d = r.corpo.dati;
  await ctx.reply(t(ctx, 'schedaSalvata', { titolo: d.titolo, count: d.numEsercizi }), { parse_mode: 'Markdown' });
});

// --- Callback: plan details ---
bot.callbackQuery(/^scheda:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const schedaId = ctx.match[1];
  const r = await api(ctx, 'scheda', { chatId: chatId(ctx), schedaId });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(r.corpo.dati.testo, { parse_mode: 'Markdown' });
});

// --- Free-text messages -> conversational engine ---
bot.on('message:text', async (ctx) => {
  const testo = ctx.message.text || '';
  if (testo.startsWith('/')) return; // commands are handled above
  await ctx.replyWithChatAction('typing').catch(() => {});
  const r = await api(ctx, 'messaggio', { chatId: chatId(ctx), testo });
  if (!r.ok) { await ctx.reply(messaggioErrore(ctx, r)); return; }
  await ctx.reply(r.corpo.dati.risposta);
});

// --- Global error handling ---
bot.catch((err) => {
  console.error('Errore bot:', err.error?.message || err.message || err);
});

// Status signal for the container healthcheck.
// The bot works in long-polling and exposes nothing: without this, the only
// possible check would be "the process exists", which would stay green even
// with the bot disconnected from Telegram. Here the response turns positive
// only after Telegram has confirmed the start.
let avviato = false;
const PORTA_STATO = Number(process.env.PORTA_STATO) || 3001;
createServer((req, res) => {
  if (req.url === '/stato') {
    res.writeHead(avviato ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ avviato }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORTA_STATO, '127.0.0.1');

bot.start({
  onStart: async (info) => {
    avviato = true;
    console.log(`🤖 GymBot avviato come @${info.username}`);
    try {
      // English for everybody, Italian for Telegram users whose language is Italian
      const comandi = (lingua) => [
        { command: 'nuova', description: tLingua(lingua, 'comandoNuova') },
        { command: 'guidata', description: tLingua(lingua, 'comandoGuidata') },
        { command: 'schede', description: tLingua(lingua, 'comandoSchede') },
        { command: 'statistiche', description: tLingua(lingua, 'comandoStatistiche') },
        { command: 'annulla', description: tLingua(lingua, 'comandoAnnulla') },
        { command: 'start', description: tLingua(lingua, 'comandoStart') }
      ];
      await bot.api.setMyCommands(comandi('en'));
      await bot.api.setMyCommands(comandi('it'), { language_code: 'it' });
    } catch (e) {
      console.error('setMyCommands fallito:', e.message);
    }
  }
});
