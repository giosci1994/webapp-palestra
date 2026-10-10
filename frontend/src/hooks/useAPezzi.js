// ============================================
// GymMaster — Liste lunghe a pezzi
// ============================================

import { useState } from 'react';

/**
 * I primi `passo` elementi di un elenco, e la funzione per mostrarne altri.
 * Con un elenco nuovo (un'altra ricerca, un altro filtro) si riparte dai
 * primi: il catalogo ha piu' di 3000 esercizi, e disegnarli tutti a ogni
 * tasto bloccava il telefono.
 */
export function useAPezzi(elenco, passo = 50) {
  const [stato, setStato] = useState({ elenco, quanti: passo });
  const quanti = stato.elenco === elenco ? stato.quanti : passo;
  return {
    visibili: elenco.slice(0, quanti),
    restanti: Math.max(0, elenco.length - quanti),
    mostraAltri: () => setStato({ elenco, quanti: quanti + passo })
  };
}
