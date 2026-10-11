// ============================================
// GymMaster — Tipi di serie
// ============================================
//
// Una serie e' di lavoro (quelle della scheda), di riscaldamento o un drop.
// - Riscaldamento: si registra e si vede, ma resta fuori da tutto il resto:
//   volume, conteggi delle serie, record, massimali, progressione. Prima
//   gonfiava il volume e spostava "l'ultima volta" (la serie 1 era quella
//   da 40 kg).
// - Drop: subito dopo una serie di lavoro, a peso calato e senza recupero. E'
//   lavoro fatto e conta nel volume, ma non e' una serie a se': resta fuori da
//   conteggi, record, massimali e progressione.

import { ErroreValidazione } from './errori.js';

export const TIPI_SERIE = ['LAVORO', 'RISCALDAMENTO', 'DROP'];

/** Filtro Prisma: le serie di lavoro (conteggi, record, massimali, progressione) */
export const SOLO_LAVORO = { tipo: 'LAVORO' };

/** Una serie di lavoro? Senza tipo (righe di prova, dati vecchi) lo e' */
export const diLavoro = serie => (serie.tipo ?? 'LAVORO') === 'LAVORO';

/** Il volume (kg × ripetizioni) delle serie completate, riscaldamento escluso */
export const volumeDi = serie => serie
  .filter(s => s.completato !== false && s.tipo !== 'RISCALDAMENTO')
  .reduce((somma, s) => somma + (s.pesoEffettivo || 0) * (s.repEffettive || 0), 0);

/** Il tipo ricevuto dal client; assente vale LAVORO. `dove` apre il messaggio d'errore ("Serie 3: ") */
export function leggiTipo(valore, dove = '') {
  if (valore == null) return 'LAVORO';
  if (!TIPI_SERIE.includes(valore)) throw new ErroreValidazione(`${dove}tipo di serie non valido`);
  return valore;
}

const posto = s => (s.tipo === 'RISCALDAMENTO' ? [0, s.serieNumero, 0] : [1, s.serieNumero, s.tipo === 'DROP' ? 1 : 0]);

/**
 * Ordine in cui mostrare le serie di un esercizio: prima il riscaldamento,
 * poi ogni serie di lavoro seguita dai suoi drop; a parita', come sono
 * arrivate (id).
 */
export function ordineSerie(a, b) {
  const [pa, pb] = [posto(a), posto(b)];
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return (a.id ?? 0) - (b.id ?? 0);
}
