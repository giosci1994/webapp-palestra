// ============================================
// GymMaster — Formattatori
// Date, numeri, durate
// ============================================

/**
 * Formatta una data ISO in formato italiano.
 * @param {string} data - Data ISO string
 * @param {boolean} conOra - Mostra anche l'ora
 */
export function formattaData(data, conOra = false) {
  if (!data) return '—';
  const opzioni = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(conOra && { hour: '2-digit', minute: '2-digit' })
  };
  return new Date(data).toLocaleDateString('it-IT', opzioni);
}

/**
 * Formatta una data in formato relativo (es. "2 ore fa").
 */
export function formattaDataRelativa(data) {
  if (!data) return '—';
  const ora = new Date();
  const diff = ora - new Date(data);
  const minuti = Math.floor(diff / 60000);
  const ore = Math.floor(diff / 3600000);
  const giorni = Math.floor(diff / 86400000);

  if (minuti < 1) return 'ora';
  if (minuti < 60) return `${minuti} min fa`;
  if (ore < 24) return `${ore}h fa`;
  if (giorni < 7) return `${giorni}g fa`;
  return formattaData(data);
}

/**
 * Formatta un numero con separatore delle migliaia.
 */
export function formattaNumero(n) {
  if (n == null) return '0';
  return n.toLocaleString('it-IT');
}

/**
 * Formatta il peso (con decimali solo se necessario).
 */
export function formattaPeso(kg) {
  if (kg == null) return '0';
  return kg % 1 === 0 ? `${kg}` : `${kg.toFixed(1)}`;
}

/**
 * Formatta la durata in minuti in formato leggibile.
 */
export function formattaDurata(minuti) {
  if (!minuti) return '—';
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Nome dell'esercizio da mostrare.
 *
 * Il catalogo importato ha i nomi in inglese e `nomeIt` con la traduzione;
 * quello curato a mano ha già il nome italiano in `nome` e `nomeIt` vuoto.
 * Qui si sceglie sempre l'italiano quando c'è.
 */
export function nomeEsercizio(esercizio) {
  if (!esercizio) return '';
  return esercizio.nomeIt || esercizio.nome || '';
}

/**
 * Nome originale in inglese, da mostrare come riga secondaria.
 * Restituisce null quando coincide col nome principale, per non ripeterlo.
 */
export function nomeEsercizioOriginale(esercizio) {
  if (!esercizio?.nomeIt) return null;
  return esercizio.nome || null;
}
