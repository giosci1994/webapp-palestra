// ============================================
// GymMaster — Swipe a set (live workout)
// ============================================
//
// In the list of the sets done, a row swiped to the left deletes the set
// (with an "Undo" notice: nothing reaches the server until it expires), a row
// swiped to the right logs the same set again as the exercise's next one. The
// pure logic is here; componenti/specifici/RigaSerieScorrevole.jsx draws the
// row and pagine/WorkoutLive.jsx applies the actions.
//
// The numbering follows the server's (DELETE /sessioni/:id/serie/:idClient,
// serieDaRinumerare in sessioni.controller.js): warm-up sets are numbered on
// their own; working sets and the drop sets that carry their number share the
// other numbering. Deleting a working set takes its drop sets with it and the
// following sets move down one number, so the next set is not a second "set 3".

import { direzioneMovimento, superaSoglia, nelBordo } from './gestoPagine.js';
import { SERIE_MAX_OGGI } from './ripresa.js';

/** How long the "Undo" notice stays, ms: the deletion is sent when it expires */
export const ATTESA_ANNULLA_MS = 5000;

/** Remembers that the first-time hint was seen (per phone) */
export const CHIAVE_SUGGERIMENTO = 'gymmaster_scorri_serie_visto';

const tipoDi = s => s.tipo ?? 'LAVORO';

/**
 * What a swipe released on a row does.
 * @param {{ inizioX: number, larghezzaSchermo: number, dx: number, dy: number, velocita: number, larghezza: number }} gesto
 *   inizioX: where the finger touched the screen; dx/dy: offset at release;
 *   velocita: horizontal speed at release (px/s); larghezza: the row's width
 * @returns {'elimina'|'copia'|null} null: the row goes back (near an edge, a
 *   vertical scroll, not far or fast enough)
 */
export function azioneDelGesto({ inizioX, larghezzaSchermo, dx, dy, velocita, larghezza }) {
  // The bands at the screen edges belong to the system gestures (Android's "back")
  if (nelBordo(inizioX, larghezzaSchermo)) return null;
  if (direzioneMovimento(dx, dy) !== 'orizzontale') return null;
  if (!superaSoglia(dx, velocita, larghezza)) return null;
  return dx < 0 ? 'elimina' : 'copia';
}

/**
 * The sets after deleting the one with key `idClient`: with its drop sets if
 * it is a working set, and the following ones of the same exercise in the
 * same numbering one number lower.
 * @param {object[]} serie - the sets done (with idClient, esercizioId, serieNumero, tipo)
 * @returns {{ serie: object[], via: object[] }} via: the rows taken out (empty if the key is not there)
 */
export function rinumera(serie, idClient) {
  const eliminata = serie.find(s => s.idClient === idClient);
  if (!eliminata) return { serie, via: [] };
  const tipo = tipoDi(eliminata);
  const numero = eliminata.serieNumero;
  const stesso = s => s.esercizioId === eliminata.esercizioId;
  const stessaNumerazione = s => stesso(s) && (tipoDi(s) === 'RISCALDAMENTO') === (tipo === 'RISCALDAMENTO');

  const va = s => s === eliminata || (tipo === 'LAVORO' && stesso(s) && tipoDi(s) === 'DROP' && s.serieNumero === numero);
  const via = serie.filter(va);
  const restano = serie.filter(s => !va(s)).map(s => (
    tipo !== 'DROP' && stessaNumerazione(s) && s.serieNumero > numero ? { ...s, serieNumero: s.serieNumero - 1 } : s
  ));
  return { serie: restano, via };
}

/**
 * The set that a swipe to the right logs: the same weight, reps, RPE and
 * type (minutes and level for cardio) as the next set of the exercise. A
 * drop set is not copied (null); a warm-up becomes one more warm-up.
 * @param {object} serie - the set swiped
 * @param {{ prossimoNumero: number, riscaldamenti: number }} contesto - the
 *   number of the exercise's next working set (serieCorrente) and how many
 *   warm-up sets it already has
 */
export function copiaDi(serie, { prossimoNumero, riscaldamenti }) {
  const tipo = tipoDi(serie);
  if (tipo === 'DROP') return null;
  const base = {
    esercizioId: serie.esercizioId,
    tipo,
    pesoEffettivo: serie.pesoEffettivo ?? 0,
    repEffettive: serie.repEffettive ?? 0,
    completato: true
  };
  if (tipo === 'RISCALDAMENTO') return { ...base, serieNumero: riscaldamenti + 1 };
  return {
    ...base,
    serieNumero: prossimoNumero,
    ...(serie.rpe != null && { rpe: serie.rpe }),
    ...(serie.durataMinuti != null && { durataMinuti: serie.durataMinuti }),
    ...(serie.livelloResistenza != null && { livelloResistenza: serie.livelloResistenza })
  };
}

/**
 * Today's sets after a copy of a working set: one more when the copy goes past
 * them, unchanged otherwise; null when the exercise is already at the most
 * sets of a workout (SERIE_MAX_OGGI) and the copy cannot be logged.
 * @param {number} serieOggi - today's sets of the exercise (serieDiOggi)
 * @param {number} fatte - working sets done (or skipped, in a group) before the copy
 */
export function serieOggiDopoCopia(serieOggi, fatte) {
  if (fatte + 1 <= serieOggi) return serieOggi;
  if (serieOggi >= SERIE_MAX_OGGI) return null;
  return serieOggi + 1;
}

/** Whether the first-time hint is still to show; storage that cannot be read: not shown */
export function suggerimentoDaMostrare(archivio = globalThis.localStorage) {
  try {
    return !archivio.getItem(CHIAVE_SUGGERIMENTO);
  } catch {
    return false;
  }
}

/** Remembers that the hint was seen; a storage that cannot write is ignored */
export function segnaSuggerimentoVisto(archivio = globalThis.localStorage) {
  try {
    archivio.setItem(CHIAVE_SUGGERIMENTO, '1');
  } catch {
    // Private browsing or full storage: the hint shows again next time
  }
}
