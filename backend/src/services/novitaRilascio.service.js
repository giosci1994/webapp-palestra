// ============================================
// GymMaster — Storie delle novita' al rilascio
// ============================================

import prisma from '../config/database.js';
import { problemiStorie, righeDellaVersione } from '../utils/novitaRilascio.js';

/**
 * Aggiunge le storie della versione che non ci sono ancora (stesso titolo =
 * gia' presente): ripetere il rilascio non le duplica.
 * @param {string} versione la versione appena installata
 * @param {object[]} storie il contenuto di prisma/novita.json
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
