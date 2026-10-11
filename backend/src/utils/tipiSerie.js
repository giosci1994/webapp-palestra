// ============================================
// GymMaster — Set types
// ============================================
//
// A set is a working set (the plan's sets), a warm-up set or a drop set.
// - Warm-up: it is logged and shown, but stays out of everything else:
//   volume, set counts, records, maxes, progression. Before, it inflated
//   the volume and moved "last time" (set 1 was the one at
//   40 kg).
// - Drop: right after a working set, at a lower weight and with no rest. It
//   is work done and counts in the volume, but it is not a set of its own: it
//   stays out of counts, records, maxes and progression.

import { ErroreValidazione } from './errori.js';

export const TIPI_SERIE = ['LAVORO', 'RISCALDAMENTO', 'DROP'];

/** Prisma filter: the working sets (counts, records, maxes, progression) */
export const SOLO_LAVORO = { tipo: 'LAVORO' };

/** A working set? Without a type (test rows, old data) it is */
export const diLavoro = serie => (serie.tipo ?? 'LAVORO') === 'LAVORO';

/** The volume (kg × reps) of the completed sets, warm-up excluded */
export const volumeDi = serie => serie
  .filter(s => s.completato !== false && s.tipo !== 'RISCALDAMENTO')
  .reduce((somma, s) => somma + (s.pesoEffettivo || 0) * (s.repEffettive || 0), 0);

/** The type sent by the client; missing means LAVORO. `dove` starts the error message ("Serie 3: ") */
export function leggiTipo(valore, dove = '') {
  if (valore == null) return 'LAVORO';
  if (!TIPI_SERIE.includes(valore)) throw new ErroreValidazione(`${dove}tipo di serie non valido`);
  return valore;
}

const posto = s => (s.tipo === 'RISCALDAMENTO' ? [0, s.serieNumero, 0] : [1, s.serieNumero, s.tipo === 'DROP' ? 1 : 0]);

/**
 * Order in which to show the sets of an exercise: first the warm-up,
 * then each working set followed by its drop sets; on a tie, in the order
 * they arrived (id).
 */
export function ordineSerie(a, b) {
  const [pa, pb] = [posto(a), posto(b)];
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return (a.id ?? 0) - (b.id ?? 0);
}
