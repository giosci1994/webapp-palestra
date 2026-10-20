// ============================================
// GymMaster — Warm-up and drop sets
// ============================================
//
// The same rules as the server (backend/src/utils/tipiSerie.js):
// - warm-up: before the working sets; it is shown, but stays out of
//   volume, counts, records and progression;
// - drop: right after a working set, at a lower weight and with no rest;
//   it counts in the volume but not as a set of its own.

/** A working set? Without a tipo (saved before it existed) it is */
export const diLavoro = s => (s?.tipo ?? 'LAVORO') === 'LAVORO';

/** The volume (kg × reps) of the sets, warm-up excluded */
export const volumeDi = serie => serie
  .filter(s => s.tipo !== 'RISCALDAMENTO')
  .reduce((somma, s) => somma + (s.pesoEffettivo || 0) * (s.repEffettive || 0), 0);

const posto = s => (s.tipo === 'RISCALDAMENTO' ? [0, s.serieNumero ?? 0, 0] : [1, s.serieNumero ?? 0, s.tipo === 'DROP' ? 1 : 0]);

/**
 * The sets of an exercise in the order to show them: first the
 * warm-up, then each working set followed by its drops. On a tie
 * the arrival order stays.
 */
export function ordinaSerie(serie) {
  return serie
    .map((s, i) => ({ s, i, p: posto(s) }))
    .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.p[2] - b.p[2] || a.i - b.i)
    .map(x => x.s);
}

/** Working-weight percentages and reps of the warm-up ramp */
const RAMPA = [
  { quota: 0.4, rep: 10 },
  { quota: 0.6, rep: 5 },
  { quota: 0.8, rep: 3 }
];

const arrotondaA = (peso, gradino) => Math.round(Math.round(peso / gradino) * gradino * 100) / 100;

/**
 * The warm-up ramp towards the working weight: 40%×10, 60%×5, 80%×3,
 * rounded to the equipment's step and never below the minimum (the empty
 * bar). It drops duplicate steps and those that reach the working weight.
 * @param {number} pesoLavoro
 * @param {{ incremento?: number, minimo?: number }} [opzioni]
 * @returns {{ peso: number, rep: number }[]} empty if the weight is too light to warm up for
 */
export function rampaRiscaldamento(pesoLavoro, { incremento = 2.5, minimo = 0 } = {}) {
  const lavoro = Number(pesoLavoro);
  if (!(lavoro > 0) || !(incremento > 0)) return [];
  const rampa = [];
  for (const { quota, rep } of RAMPA) {
    const peso = Math.max(minimo, arrotondaA(lavoro * quota, incremento));
    if (peso <= 0 || peso >= lavoro || rampa.some(p => p.peso === peso)) continue;
    rampa.push({ peso, rep });
  }
  return rampa;
}

/**
 * The suggested weight for a drop: one fifth less, at the equipment's step
 * (at least one step lower); null if it cannot go lower.
 */
export function pesoDrop(peso, incremento = 2.5) {
  const prima = Number(peso);
  if (!(prima > 0) || !(incremento > 0)) return null;
  let calato = arrotondaA(prima * 0.8, incremento);
  if (calato >= prima) calato = arrotondaA(prima - incremento, incremento);
  return calato > 0 ? calato : null;
}
