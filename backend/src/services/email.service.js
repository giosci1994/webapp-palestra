// ============================================
// GymMaster — Servizio Email (Resend via HTTP)
// Invio email transazionali. Dormiente se RESEND_API_KEY non è configurata.
// ============================================

import logger from '../utils/logger.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_MITTENTE = process.env.EMAIL_MITTENTE || 'GymMaster <onboarding@resend.dev>';
const APP_URL = (process.env.APP_URL || `https://gymmaster.${process.env.DOMINIO || 'casadm.uk'}`).replace(/\/$/, '');

/** True se l'invio email è configurato (chiave Resend presente). */
export function emailConfigurata() {
  return RESEND_API_KEY.trim().length > 0;
}

/** Invia un'email tramite Resend. Ritorna { inviata: boolean }. */
export async function inviaEmail({ a, oggetto, html }) {
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

/** Costruisce e invia l'email di verifica indirizzo. */
export async function inviaEmailVerifica(utente, token) {
  const link = `${APP_URL}/verifica-email?token=${token}`;
  const html = `
  <div style="background:#0A0A0F;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#E8E8F0">
    <div style="max-width:480px;margin:0 auto;background:#12121A;border:1px solid #26263A;border-radius:16px;overflow:hidden">
      <div style="padding:28px 28px 0;text-align:center">
        <div style="font-size:40px">🏋️</div>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#fff">Benvenuto su GymMaster</h1>
        <p style="margin:0;color:#A0A0B8;font-size:14px">Ciao ${utente.nome || ''}, conferma il tuo indirizzo email per attivare l'account.</p>
      </div>
      <div style="padding:28px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px">Verifica la mia email</a>
        <p style="margin:20px 0 0;color:#71718A;font-size:12px;line-height:1.5">Se il pulsante non funziona, copia questo link:<br><span style="color:#A0A0B8;word-break:break-all">${link}</span></p>
        <p style="margin:16px 0 0;color:#71718A;font-size:12px">Il link scade tra 24 ore. Se non hai creato tu l'account, ignora questa email.</p>
      </div>
    </div>
  </div>`;
  return inviaEmail({ a: utente.email, oggetto: 'Verifica il tuo indirizzo email — GymMaster', html });
}

/** Costruisce e invia l'email di reset password. */
export async function inviaEmailReset(utente, token) {
  const link = `${APP_URL}/reimposta-password?token=${token}`;
  const html = `
  <div style="background:#0A0A0F;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#E8E8F0">
    <div style="max-width:480px;margin:0 auto;background:#12121A;border:1px solid #26263A;border-radius:16px;overflow:hidden">
      <div style="padding:28px 28px 0;text-align:center">
        <div style="font-size:40px">🔑</div>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#fff">Reimposta la password</h1>
        <p style="margin:0;color:#A0A0B8;font-size:14px">Ciao ${utente.nome || ''}, hai richiesto di reimpostare la password del tuo account GymMaster.</p>
      </div>
      <div style="padding:28px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px">Reimposta la password</a>
        <p style="margin:20px 0 0;color:#71718A;font-size:12px;line-height:1.5">Se il pulsante non funziona, copia questo link:<br><span style="color:#A0A0B8;word-break:break-all">${link}</span></p>
        <p style="margin:16px 0 0;color:#71718A;font-size:12px">Il link scade tra 1 ora. Se non hai richiesto tu il reset, ignora questa email: la password resterà invariata.</p>
      </div>
    </div>
  </div>`;
  return inviaEmail({ a: utente.email, oggetto: 'Reimposta la tua password — GymMaster', html });
}
