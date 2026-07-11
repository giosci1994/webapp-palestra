// ============================================
// GymMaster — Servizio Telegram (notifiche push dal backend)
// Invia messaggi Telegram agli utenti collegati, usando il bot token.
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export function telegramAttivo() {
  return TOKEN.trim().length > 0;
}

// Escape minimale per parse_mode HTML di Telegram
export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Invia una notifica Telegram a un utente, se collegato.
 * Silenzioso se Telegram non è configurato o l'utente non è collegato.
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
