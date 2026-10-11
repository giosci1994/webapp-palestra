// ============================================
// GymMaster — Plates to load on the barbell
// ============================================
//
// Once the total weight of a barbell set is entered, which plates to put on
// each side: no mental math between one set and the next.

/** The catalog's bars, recognized by the equipment name, and their empty weight */
export const BILANCIERI = [
  { schema: /olimpic/i, nome: 'bilanciere olimpico', peso: 20 },
  { schema: /\bez\b/i, nome: 'bilanciere EZ', peso: 10 },
  { schema: /trap bar|hex bar/i, nome: 'trap bar', peso: 25 }
];

/** A gym's plates, heaviest first */
export const DISCHI = [25, 20, 15, 10, 5, 2.5, 1.25];

/** The barbell the exercise uses, or null */
export function bilanciereDi(esercizio) {
  const nome = esercizio?.attrezzatura?.nome || '';
  return BILANCIERI.find(b => b.schema.test(nome)) || null;
}

const arrotonda = n => Math.round(n * 1000) / 1000;

/**
 * The plates for each side, heaviest first, to reach `pesoTotale`.
 * If the available plates cannot reach it exactly, `mancano` says how
 * many kg are left uncovered in total. null if the weight is not a number or
 * does not exceed the bar.
 */
export function dischiPerLato(pesoTotale, pesoBilanciere = 20, dischi = DISCHI) {
  const totale = Number(pesoTotale);
  if (!Number.isFinite(totale) || totale <= pesoBilanciere) return null;
  let restante = arrotonda((totale - pesoBilanciere) / 2);
  const perLato = [];
  for (const disco of dischi) {
    while (restante >= disco) {
      perLato.push(disco);
      restante = arrotonda(restante - disco);
    }
  }
  return { perLato, mancano: arrotonda(restante * 2) };
}

/** "2 × 20 + 2,5": identical plates grouped */
export function descriviDischi(perLato) {
  const gruppi = [];
  for (const disco of perLato) {
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.disco === disco) ultimo.quanti++;
    else gruppi.push({ disco, quanti: 1 });
  }
  return gruppi
    .map(({ disco, quanti }) => `${quanti > 1 ? `${quanti} × ` : ''}${String(disco).replace('.', ',')}`)
    .join(' + ');
}
