// ============================================
// GymMaster — Progressione dei carichi
// ============================================
//
// Il peso da usare oggi, ricavato da come sono andate le ultime volte, con la
// doppia progressione: si lavora in una forbice di ripetizioni ("8-12").
// - Tutte le serie in cima alla forbice: il peso sale di un gradino e si
//   riparte dal fondo.
// - Se no, stesso peso, cercando una ripetizione in piu'.
// - Tre volte di fila allo stesso peso senza arrivare nemmeno al fondo della
//   forbice: si scarica del 10% e si risale.
// Ogni proposta dice il perche'.

import { bilanciereDi } from './dischi.js';

/** Quante volte di fila sotto la forbice, allo stesso peso, prima di scaricare */
export const FALLIMENTI_PRIMA_DELLO_SCARICO = 3;
const SCARICO = 0.9;

const kg = n => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** "8-12" → { min: 8, max: 12 }; "10" o 10 → { min: 10, max: 10 }; altro → null */
export function leggiForbice(repTarget) {
  const testo = String(repTarget ?? '').trim();
  const forbice = testo.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (forbice) {
    const [min, max] = [Number(forbice[1]), Number(forbice[2])].sort((a, b) => a - b);
    return min > 0 ? { min, max } : null;
  }
  return /^\d+$/.test(testo) && Number(testo) > 0 ? { min: Number(testo), max: Number(testo) } : null;
}

/** Il gradino di peso dell'attrezzo: i dischi piu' piccoli, i manubri, il pacco pesi */
export function incrementoPer(esercizio) {
  const attrezzatura = esercizio?.attrezzatura;
  const nome = attrezzatura?.nome || '';
  if (bilanciereDi(esercizio)) return 2.5;        // due dischi da 1,25
  if (/manubri/i.test(nome)) return 2;
  if (/kettlebell/i.test(nome)) return 4;
  if (['MACCHINE', 'CAVI'].includes(attrezzatura?.categoria)) return 5;
  return 2.5;
}

/** Peso e ripetizioni delle serie di lavoro: quelle al peso piu' alto della seduta */
function serieDiLavoro(seduta) {
  const peso = Math.max(...seduta.serie.map(s => s.pesoEffettivo));
  return { peso, ripetizioni: seduta.serie.filter(s => s.pesoEffettivo === peso).map(s => s.repEffettive) };
}

/** Sotto la forbice: meno serie del previsto al peso di lavoro, o qualcuna sotto il minimo */
const sottoForbice = ({ ripetizioni }, serieTarget, { min }) =>
  ripetizioni.length < serieTarget || ripetizioni.slice(0, serieTarget).some(r => r < min);

/**
 * @param {object} p
 * @param {{ data: string, serie: { pesoEffettivo: number, repEffettive: number }[] }[]} p.storico
 *   le ultime sedute dell'esercizio, dalla piu' recente, con le serie completate
 * @param {number} p.serieTarget
 * @param {string|number} p.repTarget
 * @param {number} p.incremento - il gradino di peso (incrementoPer)
 * @returns {{ peso: number, ripetizioni: { min: number, max: number }, esito: 'sali'|'resta'|'scarico', motivo: string } | null}
 *   null se non c'e' niente da proporre: prima volta, corpo libero, ripetizioni senza forbice
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
    // Le volte di fila sotto la forbice, allo stesso peso
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
