// ============================================
// GymMaster — "What's new" stories at release
// ============================================

import prisma from '../config/database.js';
import { problemiStorie, righeDellaVersione } from '../utils/novitaRilascio.js';

/**
 * Adds the version's stories that are not there yet (same title = already
 * present): repeating the release does not duplicate them.
 * @param {string} versione the version just installed
 * @param {object[]} storie the content of prisma/novita.json
 * @returns {Promise<{ aggiunte: string[], presenti: string[] }>}
 */
export async function applicaNovita(versione, storie) {
  const problemi = problemiStorie(storie);
  if (problemi.length) throw new Error(`prisma/novita.json non valido:\n${problemi.join('\n')}`);

  const aggiunte = [];
  const presenti = [];
  for (const riga of righeDellaVersione(storie, versione)) {
    const esiste = await prisma.novita.findFirst({ where: { titolo: riga.titolo }, select: { id: true } });
    if (esiste) { presenti.push(riga.titolo); continue; }
    await prisma.novita.create({ data: riga });
    aggiunte.push(riga.titolo);
  }
  return { aggiunte, presenti };
}
