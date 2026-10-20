// ============================================
// GymMaster — Exercises created by hand (admin and personal trainers)
// ============================================
//
// The admin panel and the personal trainers create exercises with the same
// form: one check of the fields for both, before the database.

import prisma from '../config/database.js';
import { ErroreValidazione } from '../utils/errori.js';
import { t } from '../i18n/index.js';
import { traduciNomeEsercizio } from '../utils/traduzioneEsercizi.js';

/** The catalogue fields with a fixed set of values (difficulty, mechanics…): short texts */
const CATEGORIE = ['difficulty', 'bodyRegion', 'mechanics', 'posture', 'movementPattern', 'laterality', 'forceType', 'classification'];

const INCLUDI = { attrezzatura: { select: { id: true, nome: true } } };

/** A text field: trimmed, null when empty; an error if required and missing, or too long */
function testo(corpo, campo, massimo, obbligatorio = false) {
  const valore = corpo[campo];
  if (valore == null || (typeof valore === 'string' && valore.trim() === '')) {
    if (obbligatorio) throw new ErroreValidazione(t('eserciziService.obbligatorio', { campo }));
    return null;
  }
  if (typeof valore !== 'string') throw new ErroreValidazione(t('eserciziService.nonTesto', { campo }));
  if (valore.trim().length > massimo) throw new ErroreValidazione(t('eserciziService.troppoLungo', { campo, massimo }));
  return valore.trim();
}

/**
 * The exercise fields from a request body, checked.
 * @returns {Promise<object>} the data for prisma.esercizio (without nomeIt)
 */
async function leggiEsercizio(corpo = {}) {
  const dati = {
    nome: testo(corpo, 'nome', 200, true),
    gruppoMuscoloPrimario: testo(corpo, 'gruppoMuscoloPrimario', 60, true),
    gruppoMuscoloSecondario: testo(corpo, 'gruppoMuscoloSecondario', 60),
    descrizione: testo(corpo, 'descrizione', 2000),
    linkVideo: testo(corpo, 'linkVideo', 500),
    attrezzaturaRichiestaId: null
  };
  for (const campo of CATEGORIE) dati[campo] = testo(corpo, campo, 60);

  if (dati.linkVideo) {
    let indirizzo = null;
    try { indirizzo = new URL(dati.linkVideo); } catch { /* not a URL */ }
    if (!['http:', 'https:'].includes(indirizzo?.protocol)) throw new ErroreValidazione(t('eserciziService.linkVideoNonValido'));
  }

  const attrezzatura = corpo.attrezzaturaRichiestaId;
  if (attrezzatura != null && attrezzatura !== '') {
    const id = Number(attrezzatura);
    const esiste = Number.isInteger(id) && id > 0 && await prisma.attrezzatura.findUnique({ where: { id }, select: { id: true } });
    if (!esiste) throw new ErroreValidazione(t('eserciziService.attrezzaturaNonTrovata'));
    dati.attrezzaturaRichiestaId = id;
  }
  return dati;
}

/** A new exercise; the Italian name too, as for the catalogue, so the Italian search finds it */
export async function creaEsercizio(corpo) {
  const dati = await leggiEsercizio(corpo);
  return prisma.esercizio.create({
    data: { ...dati, nomeIt: traduciNomeEsercizio(dati.nome).nomeIt },
    include: INCLUDI
  });
}

/** Updates an exercise with the whole form (the Italian name is not part of it and stays) */
export async function aggiornaEsercizio(id, corpo) {
  return prisma.esercizio.update({ where: { id }, data: await leggiEsercizio(corpo), include: INCLUDI });
}
