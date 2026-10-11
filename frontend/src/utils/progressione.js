// ============================================
// GymMaster — Load progression
// ============================================
//
// The weight to use today, worked out from how the last few times went, with
// double progression: you work within a rep range ("8-12").
// - All sets at the top of the range: the weight goes up one step and you
//   start again from the bottom.
// - Otherwise, same weight, going for one more rep.
// - Three times in a row at the same weight without even reaching the bottom
//   of the range: deload by 10% (rounded down to the equipment step, so a
//   little more on heavy steps) and build back up.
// Every suggestion says why.

import { bilanciereDi } from './dischi.js';

/** How many times in a row below the range, at the same weight, before deloading */
export const FALLIMENTI_PRIMA_DELLO_SCARICO = 3;
const SCARICO = 0.9;

const kg = n => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** "8-12" → { min: 8, max: 12 }; "10" or 10 → { min: 10, max: 10 }; anything else → null */
export function leggiForbice(repTarget) {
  const testo = String(repTarget ?? '').trim();
  const forbice = testo.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (forbice) {
    const [min, max] = [Number(forbice[1]), Number(forbice[2])].sort((a, b) => a - b);
    return min > 0 ? { min, max } : null;
  }
  return /^\d+$/.test(testo) && Number(testo) > 0 ? { min: Number(testo), max: Number(testo) } : null;
}

/** The equipment's weight step: the smallest plates, the dumbbells, the weight stack */
export function incrementoPer(esercizio) {
  const attrezzatura = esercizio?.attrezzatura;
  const nome = attrezzatura?.nome || '';
  if (bilanciereDi(esercizio)) return 2.5;        // two 1.25 plates
  if (/manubri/i.test(nome)) return 2;
  if (/kettlebell/i.test(nome)) return 4;
  if (['MACCHINE', 'CAVI'].includes(attrezzatura?.categoria)) return 5;
  return 2.5;
}

/** Weight and reps of the working sets: those at the session's highest weight */
function serieDiLavoro(seduta) {
  const peso = Math.max(...seduta.serie.map(s => s.pesoEffettivo));
  return { peso, ripetizioni: seduta.serie.filter(s => s.pesoEffettivo === peso).map(s => s.repEffettive) };
}

/** Below the range: fewer sets than planned at the working weight, or some below the minimum */
const sottoForbice = ({ ripetizioni }, serieTarget, { min }) =>
  ripetizioni.length < serieTarget || ripetizioni.slice(0, serieTarget).some(r => r < min);

/**
 * @param {object} p
 * @param {{ data: string, serie: { pesoEffettivo: number, repEffettive: number }[] }[]} p.storico
 *   the exercise's last sessions, most recent first, with the completed sets
 * @param {number} p.serieTarget
 * @param {string|number} p.repTarget
 * @param {number} p.incremento - the weight step (incrementoPer)
 * @returns {{ peso: number, ripetizioni: { min: number, max: number }, esito: 'sali'|'resta'|'scarico', motivo: string } | null}
 *   null if there is nothing to suggest: first time, bodyweight, reps without a range
 */
export function propostaCarico({ storico = [], serieTarget = 3, repTarget, incremento = 2.5 }) {
  const forbice = leggiForbice(repTarget);
  if (!forbice) return null;
  const sedute = storico.filter(s => s.serie?.length).map(serieDiLavoro);
  if (!sedute.length || sedute[0].peso <= 0) return null;

  const ultima = sedute[0];
  const fatte = ultima.ripetizioni.slice(0, serieTarget);
  const descrizione = `l'ultima volta ${fatte.join('-')} ripetizioni a ${kg(ultima.peso)} kg`;

  if (fatte.length >= serieTarget && fatte.every(r => r >= forbice.max)) {
    return {
      peso: ultima.peso + incremento,
      ripetizioni: forbice,
      esito: 'sali',
      motivo: `Tutte le serie in cima alla forbice (${descrizione}): si sale di ${kg(incremento)} kg`
    };
  }

  if (sottoForbice(ultima, serieTarget, forbice)) {
    // The times in a row below the range, at the same weight
    let difficili = 0;
    for (const seduta of sedute) {
      if (seduta.peso !== ultima.peso || !sottoForbice(seduta, serieTarget, forbice)) break;
      difficili++;
    }
    if (difficili >= FALLIMENTI_PRIMA_DELLO_SCARICO) {
      const scaricato = Math.max(incremento, Math.floor((ultima.peso * SCARICO) / incremento) * incremento);
      return {
        peso: scaricato,
        ripetizioni: forbice,
        esito: 'scarico',
        motivo: `${difficili} volte di fila sotto le ${forbice.min} ripetizioni a ${kg(ultima.peso)} kg: si scarica del 10% e si risale`
      };
    }
    return {
      peso: ultima.peso,
      ripetizioni: forbice,
      esito: 'resta',
      motivo: `Stesso peso (${descrizione}): punta ad almeno ${forbice.min} ripetizioni in ogni serie`
    };
  }

  return {
    peso: ultima.peso,
    ripetizioni: forbice,
    esito: 'resta',
    motivo: `Stesso peso, una ripetizione in piu' (${descrizione}): quando tutte arrivano a ${forbice.max} si sale`
  };
}
