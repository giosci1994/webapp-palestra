// ============================================
// GymMaster — Nome leggibile di un dispositivo
// ============================================
//
// Dallo User-Agent del login un nome da mostrare nell'elenco dei dispositivi
// collegati: "Chrome · Android", "Safari · iPhone". Basta per riconoscere i
// propri dispositivi; non serve a nient'altro, quindi niente librerie.

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

/** @returns {string|null} null se lo User-Agent non dice niente di utile */
export function descriviDispositivo(userAgent) {
  if (!userAgent) return null;
  const browser = primo(BROWSER, userAgent);
  const sistema = primo(SISTEMA, userAgent);
  if (!browser && !sistema) return null;
  return [browser, sistema].filter(Boolean).join(' · ');
}
