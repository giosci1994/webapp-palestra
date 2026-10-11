// ============================================
// GymMaster — Exercise catalogue entries
// ============================================
//
// One exercise of prisma/dati/esercizi.json as the data to create it with.
// Shared by the seed (new installations) and by prisma/import-esercizi.js
// (updates), so both write the same fields.
//
// The catalogue names are English. nomeIt gets the Italian name from the
// dictionary in traduzioneEsercizi.js: the app shows it to Italian users and
// searches both. Before, only the production database had it, filled once by
// hand, and a new installation had the catalogue in English only.

import { traduciNomeEsercizio } from './traduzioneEsercizi.js';

/**
 * @param {object} es - an entry of esercizi.json
 * @param {number|null} attrezzaturaId - the id of its equipment, if any
 * @returns {object} the data for prisma.esercizio.create
 */
export function datiEsercizioCatalogo(es, attrezzaturaId = null) {
  return {
    nome: es.nome,
    // null when the name is already Italian: there is nothing to add
    nomeIt: traduciNomeEsercizio(es.nome).nomeIt,
    gruppoMuscoloPrimario: es.gruppoMuscoloPrimario,
    gruppoMuscoloSecondario: es.gruppoMuscoloSecondario || null,
    attrezzaturaRichiestaId: attrezzaturaId,
    descrizione: es.descrizione || null,
    linkVideo: es.linkVideo || null,
    difficulty: es.difficulty || null,
    bodyRegion: es.bodyRegion || null,
    mechanics: es.mechanics || null,
    posture: es.posture || null,
    movementPattern: es.movementPattern || null,
    laterality: es.laterality || null,
    forceType: es.forceType || null,
    classification: es.classification || null
  };
}
