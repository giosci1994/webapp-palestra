// ============================================
// GymMaster — Email service (Resend over HTTP)
// Sends transactional emails. Dormant if RESEND_API_KEY is not set.
// ============================================

import logger from '../utils/logger.js';
import { t } from '../i18n/index.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_MITTENTE = process.env.EMAIL_MITTENTE || 'GymMaster <onboarding@resend.dev>';
const APP_URL = (process.env.APP_URL || `https://gymmaster.${process.env.DOMINIO || 'casadm.uk'}`).replace(/\/$/, '');

/** True if email sending is configured (Resend key present). */
export function emailConfigurata() {
  return RESEND_API_KEY.trim().length > 0;
}

/** Sends an email through Resend. Returns { inviata: boolean }. */
async function inviaEmail({ a, oggetto, html }) {
  if (!emailConfigurata()) {
    logger.warn({ a, oggetto }, 'Email non inviata: RESEND_API_KEY non configurata');
    return { inviata: false };
  }
  const risposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: EMAIL_MITTENTE, to: a, subject: oggetto, html })
  });
  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => '');
    logger.error({ status: risposta.status, testo }, 'Errore invio email Resend');
    throw new Error('Invio email fallito');
  }
  logger.info({ a, oggetto }, 'Email inviata');
  return { inviata: true };
}

/** Builds and sends the address verification email. */
export async function inviaEmailVerifica(utente, token) {
  const link = `${APP_URL}/verifica-email?token=${token}`;
  const html = `
  <div style="background:#0A0A0F;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#E8E8F0">
    <div style="max-width:480px;margin:0 auto;background:#12121A;border:1px solid #26263A;border-radius:16px;overflow:hidden">
      <div style="padding:28px 28px 0;text-align:center">
        <div style="font-size:40px">🏋️</div>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#fff">${t('emailService.verifica.titolo')}</h1>
        <p style="margin:0;color:#A0A0B8;font-size:14px">${t('emailService.verifica.saluto', { nome: utente.nome || '' })}</p>
      </div>
      <div style="padding:28px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px">${t('emailService.verifica.pulsante')}</a>
        <p style="margin:20px 0 0;color:#71718A;font-size:12px;line-height:1.5">${t('emailService.linkAlternativo')}<br><span style="color:#A0A0B8;word-break:break-all">${link}</span></p>
        <p style="margin:16px 0 0;color:#71718A;font-size:12px">${t('emailService.verifica.scadenza')}</p>
      </div>
    </div>
  </div>`;
  return inviaEmail({ a: utente.email, oggetto: t('emailService.verifica.oggetto'), html });
}

/** Builds and sends the password reset email. */
export async function inviaEmailReset(utente, token) {
  const link = `${APP_URL}/reimposta-password?token=${token}`;
  const html = `
  <div style="background:#0A0A0F;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#E8E8F0">
    <div style="max-width:480px;margin:0 auto;background:#12121A;border:1px solid #26263A;border-radius:16px;overflow:hidden">
      <div style="padding:28px 28px 0;text-align:center">
        <div style="font-size:40px">🔑</div>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#fff">${t('emailService.reset.titolo')}</h1>
        <p style="margin:0;color:#A0A0B8;font-size:14px">${t('emailService.reset.saluto', { nome: utente.nome || '' })}</p>
      </div>
      <div style="padding:28px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px">${t('emailService.reset.pulsante')}</a>
        <p style="margin:20px 0 0;color:#71718A;font-size:12px;line-height:1.5">${t('emailService.linkAlternativo')}<br><span style="color:#A0A0B8;word-break:break-all">${link}</span></p>
        <p style="margin:16px 0 0;color:#71718A;font-size:12px">${t('emailService.reset.scadenza')}</p>
      </div>
    </div>
  </div>`;
  return inviaEmail({ a: utente.email, oggetto: t('emailService.reset.oggetto'), html });
}
