// ============================================
// GymMaster — Telegram service (push notifications from the backend)
// Sends Telegram messages to linked users, using the bot token.
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function telegramAttivo() {
  return TOKEN.trim().length > 0;
}

// Minimal escaping for Telegram's HTML parse_mode
export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sends a Telegram notification to a user, if linked.
 * Silent if Telegram is not configured or the user is not linked.
 */
export async function inviaNotificaTelegram(utenteId, testo) {
  if (!telegramAttivo()) return;
  try {
    const coll = await prisma.collegamentoTelegram.findUnique({
      where: { utenteId },
      select: { telegramChatId: true }
    });
    if (!coll?.telegramChatId) return;

    const risposta = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(coll.telegramChatId),
        text: testo,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!risposta.ok) {
      const t = await risposta.text().catch(() => '');
      logger.warn({ utenteId, status: risposta.status, t }, 'Notifica Telegram non inviata');
    }
  } catch (errore) {
    logger.error({ utenteId, err: errore.message }, 'Errore invio notifica Telegram');
  }
}
