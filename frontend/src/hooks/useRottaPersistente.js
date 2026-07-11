// ============================================
// GymMaster — Hook Persistenza Rotta
// Salva la rotta corrente in localStorage
// per ripristinarla dopo un reload/tab kill
// ============================================
// NOTA: usa localStorage (non sessionStorage) perché su mobile
// il browser scarica le tab dalla RAM, distruggendo sessionStorage.
// localStorage sopravvive a tab kill, chiusura browser e cambio app.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CHIAVE_ROTTA = 'gymmaster_ultima_rotta';

// Rotte che NON vanno salvate (pagine pubbliche)
const ROTTE_ESCLUSE = ['/login', '/registrazione'];

/**
 * Hook che traccia la rotta corrente e la salva in localStorage.
 * Usato in App.jsx per mantenere la posizione dell'utente
 * quando il browser ricarica la pagina o scarica la tab dopo inattività.
 */
export function useRottaPersistente() {
  const location = useLocation();

  useEffect(() => {
    if (!ROTTE_ESCLUSE.includes(location.pathname)) {
      localStorage.setItem(CHIAVE_ROTTA, location.pathname);
    }
  }, [location.pathname]);
}

/**
 * Recupera l'ultima rotta salvata da localStorage.
 * Restituisce null se nessuna rotta è stata salvata.
 */
export function ottieniUltimaRotta() {
  return localStorage.getItem(CHIAVE_ROTTA);
}
