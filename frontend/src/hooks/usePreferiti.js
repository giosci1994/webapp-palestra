// ============================================
// GymMaster — Hook esercizi preferiti
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../config/api.js';

/**
 * Gli esercizi preferiti dell'utente (un Set di id) e la funzione per mettere
 * o togliere la stella. La stella cambia subito; se il server non risponde
 * torna com'era.
 */
export function usePreferiti() {
  const [preferiti, setPreferiti] = useState(() => new Set());
  // Il valore aggiornato anche fra due tocchi ravvicinati, prima del render
  const attuali = useRef(preferiti);

  const imposta = useCallback(insieme => {
    attuali.current = insieme;
    setPreferiti(insieme);
  }, []);

  useEffect(() => {
    let attivo = true;
    api.get('/esercizi/preferiti')
      .then(r => { if (attivo) imposta(new Set(r.dati || [])); })
      .catch(() => { /* senza preferiti le pagine funzionano lo stesso */ });
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
