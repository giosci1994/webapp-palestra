// ============================================
// GymMaster — Theme (light / dark)
// ============================================
//
// "auto" follows the system setting, "chiaro" (light) and "scuro" (dark)
// force it. The choice is kept on this phone (localStorage) and applied as
// <html data-tema="chiaro|scuro">, the attribute the colours in index.css
// read. The meta color-scheme and theme-color (the phone's status bar)
// follow it too. index.html repeats the first application in a small script,
// before the first paint, with the same key and colours (a test checks it).

export const TEMI = ['auto', 'chiaro', 'scuro'];
export const CHIAVE_TEMA = 'gymmaster_tema';
// The page background of each theme (--bg-primario in index.css)
export const COLORE_BARRA = { scuro: '#030308', chiaro: '#F7F6FB' };
const QUERY_CHIARO = '(prefers-color-scheme: light)';

/** The choice kept on this phone: "auto" when there is none or storage is not available. */
export function leggiTemaScelto(memoria = globalThis.localStorage) {
  try {
    const valore = memoria?.getItem(CHIAVE_TEMA);
    return TEMI.includes(valore) ? valore : 'auto';
  } catch {
    return 'auto';
  }
}

/** The theme shown: "chiaro" or "scuro". */
export function temaEffettivo(scelta, sistemaChiaro) {
  if (scelta === 'chiaro' || scelta === 'scuro') return scelta;
  return sistemaChiaro ? 'chiaro' : 'scuro';
}

/** Puts a theme ("chiaro" | "scuro") on the page. */
export function applicaTema(tema, doc = globalThis.document) {
  if (!doc?.documentElement) return;
  doc.documentElement.dataset.tema = tema;
  doc.querySelector?.('meta[name="color-scheme"]')?.setAttribute('content', tema === 'chiaro' ? 'light' : 'dark');
  doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', COLORE_BARRA[tema]);
}

const sistemaChiaro = () => !!globalThis.matchMedia?.(QUERY_CHIARO).matches;
const ascoltatori = new Set();
let sceltaAttiva = 'auto';

function aggiorna() {
  applicaTema(temaEffettivo(sceltaAttiva, sistemaChiaro()));
  for (const ascoltatore of ascoltatori) ascoltatore();
}

/** Applies the saved choice and, on "auto", follows the system when it changes. Call it once at startup. */
export function avviaTema() {
  sceltaAttiva = leggiTemaScelto();
  aggiorna();
  globalThis.matchMedia?.(QUERY_CHIARO).addEventListener?.('change', () => {
    if (sceltaAttiva === 'auto') aggiorna();
  });
}

/** The choice in use now ("auto" | "chiaro" | "scuro"). */
export function temaScelto() {
  return sceltaAttiva;
}

/** For useSyncExternalStore: calls `ascoltatore` when the choice changes. */
export function iscriviTema(ascoltatore) {
  ascoltatori.add(ascoltatore);
  return () => ascoltatori.delete(ascoltatore);
}

/** Applies and keeps a choice; "auto" removes it. */
export function scegliTema(scelta, memoria = globalThis.localStorage) {
  sceltaAttiva = TEMI.includes(scelta) ? scelta : 'auto';
  try {
    if (sceltaAttiva === 'auto') memoria?.removeItem(CHIAVE_TEMA);
    else memoria?.setItem(CHIAVE_TEMA, sceltaAttiva);
  } catch {
    // Not saved on the phone: it still applies until the app is closed
  }
  aggiorna();
}
