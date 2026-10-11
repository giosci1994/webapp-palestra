// ============================================
// GymMaster — Favorite exercises hook
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../config/api.js';

/**
 * The user's favorite exercises (a Set of ids) and the function to add or
 * remove the star. The star changes right away; if the server does not answer
 * it goes back to how it was.
 */
export function usePreferiti() {
  const [preferiti, setPreferiti] = useState(() => new Set());
  // The up-to-date value, even between two quick taps, before the render
  const attuali = useRef(preferiti);

  const imposta = useCallback(insieme => {
    attuali.current = insieme;
    setPreferiti(insieme);
  }, []);

  useEffect(() => {
    let attivo = true;
    api.get('/esercizi/preferiti')
      .then(r => { if (attivo) imposta(new Set(r.dati || [])); })
      .catch(() => { /* the pages work without favorites anyway */ });
    return () => { attivo = false; };
  }, [imposta]);

  const alternaPreferito = useCallback(async id => {
    const aggiungi = !attuali.current.has(id);
    const cambia = (insieme, metti) => {
      const nuovo = new Set(insieme);
      if (metti) nuovo.add(id); else nuovo.delete(id);
      return nuovo;
    };
    imposta(cambia(attuali.current, aggiungi));
    try {
      if (aggiungi) await api.put(`/esercizi/${id}/preferito`);
      else await api.delete(`/esercizi/${id}/preferito`);
    } catch (err) {
      console.error('Errore preferiti:', err);
      imposta(cambia(attuali.current, !aggiungi));
    }
  }, [imposta]);

  return { preferiti, alternaPreferito };
}
