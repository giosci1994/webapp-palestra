// ============================================
// GymMaster — Swipe between pages (phone)
// ============================================
//
// The pages of the bottom navigation bar, in its order, can be swiped like
// a book: a swipe to the left opens the next one, to the right the previous
// one. A page with tabs (the Dashboard) swipes through its tabs first and
// past the last one (or before the first) goes on to the next page. The
// swipe is off on the Workout page and outside these pages. The pure logic
// is here; componenti/layout/PaginaSfogliabile.jsx applies it.

import { schedaDopoTrascinamento } from './trascinamento.js';

/** The pages of the bottom bar, in its order (BarraNavigazione.jsx). */
export const PAGINE_ISOLA = ['/dashboard', '/schede', '/allenamento', '/chat', '/profilo'];

/** The Workout page of the bar: the swipe is off there (one wrong move would start or leave a workout). */
export const PAGINA_ALLENAMENTO = '/allenamento';

/** The band near each screen edge left to the system gestures (back, app switch), px. */
export const BORDO_LIBERO = 24;

/** Movement before deciding between a horizontal swipe and a vertical scroll, px. */
export const SOGLIA_DIREZIONE = 10;

/**
 * Where the swipe does not start: fields, sliders, charts, the muscle map,
 * the calendar, media and anything marked data-senza-gesto (carousels, the
 * yearly grid). Elements that scroll sideways on their own are excluded too
 * (see escluso()).
 */
export const SELETTORE_ESCLUSI = [
  'input', 'textarea', 'select', '[contenteditable="true"]', '[contenteditable=""]',
  '[role="slider"]', '[role="dialog"]', '[aria-modal="true"]', '.recharts-wrapper', '.mappa-muscoli', 'canvas', 'video', 'iframe',
  '[data-senza-gesto]'
].join(', ');

/** Index of a page in the bottom bar, -1 if it is not one of them. */
export function indiceIsola(percorso) {
  return PAGINE_ISOLA.indexOf(percorso);
}

/** Whether the swipe between pages works on this page. */
export function gestoAttivo(percorso) {
  return indiceIsola(percorso) >= 0 && percorso !== PAGINA_ALLENAMENTO;
}

/** The page next to this one (verso +1 = next, -1 = previous), or null. */
export function paginaVicina(percorso, verso) {
  const i = indiceIsola(percorso);
  if (i < 0) return null;
  return PAGINE_ISOLA[i + verso] ?? null;
}

/**
 * What a horizontal swipe moves. `verso` +1 = the finger goes left (next),
 * -1 = it goes right (previous). `schede` is the page's tabs, if it has any:
 * { indice, conteggio }.
 * @returns {{tipo: 'scheda', indice: number} | {tipo: 'pagina', percorso: string} | {tipo: 'fermo'} | null}
 *   null: no swipe on this page; 'fermo': nothing past this side (the page resists).
 */
export function destinazioneGesto(percorso, verso, schede = null) {
  if (!gestoAttivo(percorso)) return null;
  if (schede && schede.conteggio > 1) {
    const indice = schede.indice + verso;
    if (indice >= 0 && indice < schede.conteggio) return { tipo: 'scheda', indice };
  }
  const vicina = paginaVicina(percorso, verso);
  return vicina ? { tipo: 'pagina', percorso: vicina } : { tipo: 'fermo' };
}

/**
 * Horizontal or vertical: the first SOGLIA_DIREZIONE px decide. Returns
 * 'orizzontale', 'verticale' or null (not yet). Horizontal only when it clearly
 * prevails, so a slightly slanted scroll stays a scroll.
 */
export function direzioneMovimento(dx, dy) {
  if (Math.abs(dx) < SOGLIA_DIREZIONE && Math.abs(dy) < SOGLIA_DIREZIONE) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'orizzontale' : 'verticale';
}

/** Whether a swipe released at this offset and speed changes page (same thresholds as the tabs). */
export function superaSoglia(spostamento, velocita, larghezza) {
  return schedaDopoTrascinamento(1, spostamento, velocita, larghezza, 3) !== 1;
}

/** Whether a touch starting at x is in the band left to the system gestures. */
export function nelBordo(x, larghezzaSchermo) {
  return x < BORDO_LIBERO || x > larghezzaSchermo - BORDO_LIBERO;
}

/**
 * Whether the swipe must not start on this element: it matches
 * SELETTORE_ESCLUSI, or it (or a parent up to `fino`) scrolls sideways or is
 * fixed on the screen (a window or a bottom sheet opened by the page).
 */
export function escluso(elemento, fino = null, stile = (e) => globalThis.getComputedStyle(e)) {
  if (!elemento?.closest) return false;
  if (elemento.closest(SELETTORE_ESCLUSI)) return true;
  for (let e = elemento; e && e !== fino; e = e.parentElement) {
    const { overflowX, position } = stile(e);
    if (position === 'fixed') return true;
    if ((overflowX === 'auto' || overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true;
  }
  return false;
}

/**
 * The direction of the page transition: 'avanti' (the new page comes in from
 * the right) or 'indietro' (the old one slides away to the right). Between two
 * pages of the bar their order decides; otherwise "back" is indietro.
 */
export function direzioneTransizione(da, a, tipoNavigazione) {
  const i = indiceIsola(da);
  const j = indiceIsola(a);
  if (i >= 0 && j >= 0 && i !== j) return j > i ? 'avanti' : 'indietro';
  return tipoNavigazione === 'POP' ? 'indietro' : 'avanti';
}

/** Full-screen pages (a chat, the workout in progress): no transition, no swipe. */
export function immersiva(percorso) {
  return /^\/chat\/.+/.test(percorso) || /^\/allenamento\/.+/.test(percorso);
}

/** Whether the bottom bar link to `percorso` replaces the current history entry (same rule as BarraNavigazione). */
export function sostituisceStoria(da, percorso) {
  return percorso === PAGINE_ISOLA[0] || da !== PAGINE_ISOLA[0];
}
