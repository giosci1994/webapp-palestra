// ============================================
// GymMaster — Liste lunghe a pezzi
// ============================================

import { useState, useCallback } from 'react';

/**
 * I primi `passo` elementi di un elenco, e la funzione per mostrarne altri.
 * Quando cambia `chiave` (di solito l'elenco stesso: un'altra ricerca, un
 * altro filtro) si riparte dai primi: il catalogo ha piu' di 3000 esercizi, e
 * disegnarli tutti a ogni tasto bloccava il telefono.
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
