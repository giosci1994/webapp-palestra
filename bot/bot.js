// ============================================
// GymMaster — Bot Telegram (grammY)
// Container sottile: inoltra i messaggi al backend (/api/v1/bot/*)
// con header X-Bot-Secret. Tutta la logica (AI, matching, DB) è nel backend.
// ============================================

import { Bot, InlineKeyboard } from 'grammy';
import { createServer } from 'node:http';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';
const BOT_SECRET = process.env.BOT_SECRET;

if (!TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN mancante'); process.exit(1); }
if (!BOT_SECRET) { console.error('❌ BOT_SECRET mancante'); process.exit(1); }

const bot = new Bot(TOKEN);

// --- Helper: chiama il backend ---
async function api(percorso, body) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/v1/bot/${percorso}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': BOT_SECRET },
      body: JSON.stringify(body)
    });
    const corpo = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, corpo };
  } catch (errore) {
    console.error('Errore chiamata backend:', errore.message);
    return { ok: false, status: 0, corpo: { messaggio: 'Backend non raggiungibile, riprova tra poco.' } };
  }
}

function messaggioErrore(r) {
  if (r.status === 409 && r.corpo?.codice === 'NON_COLLEGATO') {
    return '🔗 Non sei ancora collegato. Apri GymMaster → Profilo → "Collega Telegram" e inviami il codice.';
  }
  return `⚠️ ${r.corpo?.messaggio || 'Si è verificato un errore, riprova.'}`;
}

const chatId = (ctx) => String(ctx.chat.id);

// --- /start [codice] ---
bot.command('start', async (ctx) => {
  const codice = (ctx.match || '').trim();
  if (codice) {
    const r = await api('collega', { chatId: chatId(ctx), codice });
    if (r.ok) {
      await ctx.reply(
        `✅ Account collegato, ciao ${r.corpo.dati.nome}! 💪\n\n` +
        'Cosa puoi fare:\n' +
        '• /nuova — crearmi una scheda scrivendomi gli esercizi\n' +
        '• /guidata — creare una scheda scegliendo a pulsanti\n' +
        '• /schede — vedere le tue schede\n' +
        '• /statistiche — il tuo riepilogo allenamenti\n' +
        '• /annulla — annullare la bozza in corso'
      );
    } else {
      await ctx.reply(`❌ ${r.corpo?.messaggio || 'Codice non valido o scaduto.'}`);
    }
    return;
  }
  await ctx.reply(
    '👋 Ciao! Sono GymBot, l\'assistente di GymMaster.\n\n' +
    'Per collegarti: apri l\'app → Profilo → "Collega Telegram" e inviami il codice (o usa il link).\n\n' +
    'Comandi:\n' +
    '/nuova — crea una scheda scrivendomi gli esercizi\n' +
    '/guidata — crea una scheda a pulsanti\n' +
    '/schede — le tue schede\n' +
    '/statistiche — riepilogo allenamenti\n' +
    '/annulla — annulla la bozza'
  );
});

// --- /nuova: avvia la creazione guidata (azzera la bozza) ---
bot.command('nuova', async (ctx) => {
  const r = await api('annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(r)); return; }
  await ctx.reply(
    '🆕 Creiamo una scheda! Scrivimi gli esercizi uno alla volta.\n' +
    'Es: "3 serie di alzate laterali con i manubri da 8 ripetizioni".\n\n' +
    'Preferisci scegliere a pulsanti? Usa /guidata. 🧩\n' +
    'Quando hai finito scrivi "ho finito". ✍️'
  );
});

// --- /annulla ---
bot.command('annulla', async (ctx) => {
  const r = await api('annulla', { chatId: chatId(ctx) });
  if (!r.ok && r.status === 409) { await ctx.reply(messaggioErrore(r)); return; }
  await ctx.reply('🗑️ Bozza annullata.');
});

// --- /schede ---
bot.command('schede', async (ctx) => {
  const r = await api('schede', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const schede = r.corpo.dati || [];
  if (!schede.length) { await ctx.reply('Non hai ancora schede. Creane una con /nuova! 💪'); return; }
  const tastiera = new InlineKeyboard();
  schede.slice(0, 20).forEach((s) => {
    tastiera.text(`${s.titolo} (${s.numEsercizi})`, `scheda:${s.id}`).row();
  });
  await ctx.reply('📚 Le tue schede:', { reply_markup: tastiera });
});

// --- /statistiche ---
bot.command('statistiche', async (ctx) => {
  const r = await api('statistiche', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  await ctx.reply(r.corpo.dati.testo, { parse_mode: 'Markdown' });
});

// --- /guidata: creazione a pulsanti per categorie italiane ---
async function mostraCategorie(ctx) {
  const r = await api('guida/categorie', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const tastiera = new InlineKeyboard().text('⭐ I tuoi più usati', 'gcat:__usati__').row();
  (r.corpo.dati.regioni || []).forEach(reg => tastiera.text(reg, `gcat:${reg}`).row());
  await ctx.reply('🧩 Creazione guidata — scegli da dove partire:', { reply_markup: tastiera });
}
bot.command('guidata', (ctx) => mostraCategorie(ctx));

bot.callbackQuery('gmenu', async (ctx) => { await ctx.answerCallbackQuery(); await mostraCategorie(ctx); });

bot.callbackQuery(/^gcat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const reg = ctx.match[1];
  if (reg === '__usati__') {
    const r = await api('guida/esercizi', { chatId: chatId(ctx), soloPiuUsati: true });
    if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
    const es = r.corpo.dati.esercizi || [];
    if (!es.length) { await ctx.reply('Non hai ancora esercizi ricorrenti — scegli una categoria.'); await mostraCategorie(ctx); return; }
    const t = new InlineKeyboard();
    es.forEach(e => t.text(e.nome, `gex:${e.id}`).row());
    await ctx.reply('⭐ I tuoi esercizi più usati:', { reply_markup: t });
    return;
  }
  const r = await api('guida/gruppi', { chatId: chatId(ctx), bodyRegion: reg });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const gruppi = r.corpo.dati.gruppi || [];
  if (!gruppi.length) { await ctx.reply('Nessun gruppo trovato.'); return; }
  const t = new InlineKeyboard();
  gruppi.forEach(g => t.text(g, `ggrp:${g}`).row());
  await ctx.reply(`💪 ${reg} — scegli il gruppo muscolare:`, { reply_markup: t });
});

bot.callbackQuery(/^ggrp:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const gruppo = ctx.match[1];
  const r = await api('guida/esercizi', { chatId: chatId(ctx), gruppo });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const es = r.corpo.dati.esercizi || [];
  if (!es.length) { await ctx.reply('Nessun esercizio per questo gruppo.'); return; }
  const t = new InlineKeyboard();
  es.forEach(e => t.text(e.nome, `gex:${e.id}`).row());
  await ctx.reply(`🏋️ ${gruppo} — scegli un esercizio (i tuoi più usati in alto):`, { reply_markup: t });
});

bot.callbackQuery(/^gex:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const t = new InlineKeyboard()
    .text('3×8', `gadd:${id}:3:8`).text('3×10', `gadd:${id}:3:10`).text('3×12', `gadd:${id}:3:12`).row()
    .text('4×10', `gadd:${id}:4:10`).text('4×12', `gadd:${id}:4:12`).text('3×8-12', `gadd:${id}:3:8-12`).row();
  await ctx.reply('Serie × ripetizioni?', { reply_markup: t });
});

bot.callbackQuery(/^gadd:(\d+):(\d+):(\S+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1], serie = ctx.match[2], rip = ctx.match[3];
  const r = await api('guida/aggiungi', { chatId: chatId(ctx), esercizioId: id, serie, ripetizioni: rip });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const d = r.corpo.dati;
  const t = new InlineKeyboard().text('➕ Aggiungi altro', 'gmenu').text('✅ Termina', 'gfine').row();
  await ctx.reply(`✅ Aggiunto *${d.aggiunto}* (${serie}×${rip}). Bozza: ${d.totaleEsercizi} esercizi.`, { parse_mode: 'Markdown', reply_markup: t });
});

bot.callbackQuery('gfine', async (ctx) => {
  await ctx.answerCallbackQuery();
  const r = await api('guida/termina', { chatId: chatId(ctx) });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  const d = r.corpo.dati;
  await ctx.reply(`🎉 Scheda *${d.titolo}* salvata con ${d.numEsercizi} esercizi!\nVedila con /schede`, { parse_mode: 'Markdown' });
});

// --- Callback: dettaglio scheda ---
bot.callbackQuery(/^scheda:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const schedaId = ctx.match[1];
  const r = await api('scheda', { chatId: chatId(ctx), schedaId });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  await ctx.reply(r.corpo.dati.testo, { parse_mode: 'Markdown' });
});

// --- Messaggi liberi -> motore conversazionale ---
bot.on('message:text', async (ctx) => {
  const testo = ctx.message.text || '';
  if (testo.startsWith('/')) return; // i comandi sono gestiti sopra
  await ctx.replyWithChatAction('typing').catch(() => {});
  const r = await api('messaggio', { chatId: chatId(ctx), testo });
  if (!r.ok) { await ctx.reply(messaggioErrore(r)); return; }
  await ctx.reply(r.corpo.dati.risposta);
});

// --- Gestione errori globale ---
bot.catch((err) => {
  console.error('Errore bot:', err.error?.message || err.message || err);
});

// Segnale di stato per il healthcheck del container.
// Il bot lavora in long-polling e non espone nulla: senza questo, l'unico
// controllo possibile sarebbe "il processo esiste", che resterebbe verde anche
// con il bot scollegato da Telegram. Qui la risposta diventa positiva solo
// dopo che Telegram ha confermato l'avvio.
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
      await bot.api.setMyCommands([
        { command: 'nuova', description: 'Crea una scheda scrivendo gli esercizi' },
        { command: 'guidata', description: 'Crea una scheda scegliendo a pulsanti' },
        { command: 'schede', description: 'Le tue schede' },
        { command: 'statistiche', description: 'Riepilogo dei tuoi allenamenti' },
        { command: 'annulla', description: 'Annulla la bozza in corso' },
        { command: 'start', description: 'Avvia o collega il tuo account' }
      ]);
    } catch (e) {
      console.error('setMyCommands fallito:', e.message);
    }
  }
});
