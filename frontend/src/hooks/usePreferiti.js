// ============================================
// GymMaster — Favorite exercises and plans hook
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../config/api.js';

// Where each kind of favorite lives on the server: the list of ids, and the
// star of one of them
const PERCORSI = {
  esercizi: { elenco: '/esercizi/preferiti', stella: id => `/esercizi/${id}/preferito` },
  schede: { elenco: '/schede/preferite', stella: id => `/schede/${id}/preferita` }
};

/**
 * The user's favorite exercises, or plans (a Set of ids), and the function to
 * add or remove the star. The star changes right away; if the server does not
 * answer it goes back to how it was.
 * @param {'esercizi' | 'schede'} tipo
 */
export function usePreferiti(tipo = 'esercizi') {
  const { elenco, stella } = PERCORSI[tipo];
  const [preferiti, setPreferiti] = useState(() => new Set());
  // The up-to-date value, even between two quick taps, before the render
  const attuali = useRef(preferiti);

  const imposta = useCallback(insieme => {
    attuali.current = insieme;
    setPreferiti(insieme);
  }, []);

  useEffect(() => {
    let attivo = true;
    api.get(elenco)
      .then(r => { if (attivo) imposta(new Set(r.dati || [])); })
      .catch(() => { /* the pages work without favorites anyway */ });
    return () => { attivo = false; };
  }, [elenco, imposta]);

  const alternaPreferito = useCallback(async id => {
    const aggiungi = !attuali.current.has(id);
    const cambia = (insieme, metti) => {
      const nuovo = new Set(insieme);
      if (metti) nuovo.add(id); else nuovo.delete(id);
      return nuovo;
    };
    imposta(cambia(attuali.current, aggiungi));
    try {
      if (aggiungi) await api.put(stella(id));
      else await api.delete(stella(id));
    } catch (err) {
      console.error('Errore preferiti:', err);
      imposta(cambia(attuali.current, !aggiungi));
    }
  }, [stella, imposta]);

  return { preferiti, alternaPreferito };
}
