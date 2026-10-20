// ============================================
// GymMaster — Texts for another user
// ============================================
//
// A notification, a push or a Telegram message goes in the language of the
// person who receives it, not of whoever made the request that caused it (a
// trainer scheduling a workout for a client). Dates and hours too: in the
// recipient's time zone.

import prisma from '../config/database.js';
import { linguaDiUtente, traduci } from './index.js';
import { fusoDi } from '../utils/date.js';

/** The language for messages to a user: Profile choice, then the app's last one, then English */
export async function linguaDiUtenteId(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId }, select: { lingua: true, linguaApp: true } });
  return linguaDiUtente(utente);
}

/** The time zone for dates and hours in messages to a user: the one their app last sent */
export async function fusoDiUtenteId(utenteId) {
  return fusoDi(await prisma.utente.findUnique({ where: { id: utenteId }, select: { fusoOrario: true } }));
}

/**
 * Translates `testo` in the user's language when it is a translation key;
 * any other text (a plan title, a chat message) comes back as it is.
 */
export function traduciPer(lingua, testo, variabili = {}) {
  if (typeof testo !== 'string' || !/^\w+\.[\w.]+$/.test(testo)) return testo;
  return traduci(testo, variabili, lingua);
}
