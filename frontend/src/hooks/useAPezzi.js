// ============================================
// GymMaster — Long lists in chunks
// ============================================

import { useState, useCallback } from 'react';

/**
 * The first `passo` items of a list, and the function to show more of them.
 * When `chiave` changes (usually the list itself: another search, another
 * filter) it starts again from the first ones: the catalog has more than 3000
 * exercises, and drawing them all on every keystroke froze the phone.
 */
export function useAPezzi(elenco, passo = 50, chiave = elenco) {
  const [stato, setStato] = useState({ chiave, quanti: passo });
  const quanti = stato.chiave === chiave ? stato.quanti : passo;
  const mostraAltri = useCallback(
    () => setStato(prima => ({ chiave, quanti: (prima.chiave === chiave ? prima.quanti : passo) + passo })),
    [chiave, passo]
  );
  return {
    visibili: elenco.slice(0, quanti),
    restanti: Math.max(0, elenco.length - quanti),
    mostraAltri
  };
}
