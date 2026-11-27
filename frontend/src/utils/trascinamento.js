// Swiping between tabs (the Dashboard panel): which tab a swipe lands on.

// A swipe past a quarter of the panel (at most 120px) changes tab, and so
// does a quick flick in the same direction.
const VELOCITA_MINIMA = 500; // px/s

/**
 * @param {number} indice - the tab shown now
 * @param {number} spostamento - horizontal offset of the finger, px (negative = to the left)
 * @param {number} velocita - horizontal speed at release, px/s
 * @param {number} larghezza - width of the panel, px
 * @param {number} conteggio - number of tabs
 * @returns {number} the tab to show
 */
export function schedaDopoTrascinamento(indice, spostamento, velocita, larghezza, conteggio) {
  const soglia = Math.min(Math.max(larghezza, 1) * 0.25, 120);
  let passo = 0;
  if (Math.abs(spostamento) > soglia) passo = spostamento < 0 ? 1 : -1;
  else if (Math.abs(velocita) > VELOCITA_MINIMA && Math.sign(velocita) === Math.sign(spostamento)) passo = velocita < 0 ? 1 : -1;
  return Math.min(Math.max(indice + passo, 0), Math.max(conteggio - 1, 0));
}

/** The fractional tab position while the finger moves: the island's indicator follows it. */
export function posizioneDuranteTrascinamento(indice, spostamento, larghezza, conteggio) {
  const p = indice - spostamento / Math.max(larghezza, 1);
  return Math.min(Math.max(p, 0), Math.max(conteggio - 1, 0));
}
