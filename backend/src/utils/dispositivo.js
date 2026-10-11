// ============================================
// GymMaster — Readable name of a device
// ============================================
//
// From the login User-Agent, a name to show in the list of linked devices:
// "Chrome · Android", "Safari · iPhone". It is enough to recognise your own
// devices; it is needed for nothing else, so no libraries.

const BROWSER = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari']
];

const SISTEMA = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux/, 'Linux']
];

const primo = (elenco, testo) => elenco.find(([schema]) => schema.test(testo))?.[1];

/** @returns {string|null} null when the User-Agent says nothing useful */
export function descriviDispositivo(userAgent) {
  if (!userAgent) return null;
  const browser = primo(BROWSER, userAgent);
  const sistema = primo(SISTEMA, userAgent);
  if (!browser && !sistema) return null;
  return [browser, sistema].filter(Boolean).join(' · ');
}
