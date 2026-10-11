// ============================================
// GymMaster — Authentication context
// React provider for the global auth state
// ============================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, apiChiamata, impostaToken, cancellaToken, refreshSessione, impostaGestoreSessioneScaduta } from '../config/api.js';
import { disiscriviDispositivo } from '../utils/push.js';
import { startAuthentication } from '@simplewebauthn/browser';

const AuthContesto = createContext(null);

export function AuthProvider({ children }) {
  const [utente, setUtente] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(null);

  // The session dies in ONE place only: when a real protected call gets a
  // 401 and the refresh fails (api.js). So a transient blip or a race on the
  // refresh does NOT log the user out (e.g. during a workout).
  useEffect(() => {
    impostaGestoreSessioneScaduta(() => {
      cancellaToken();
      setUtente(null);
    });
    return () => impostaGestoreSessioneScaduta(null);
  }, []);

  // --- Proactive token refresh (every 10 minutes) ---
  // The access token has a 15-minute TTL. Renewing it every 10 keeps it
  // from expiring while the user is in the app. Best-effort: if it fails
  // I don't log out (the next protected call will take care of it).
  useEffect(() => {
    if (!utente) return;
    const intervallo = setInterval(() => { refreshSessione(); }, 10 * 60 * 1000);
    return () => clearInterval(intervallo);
  }, [utente]);

  // --- Immediate refresh when the user comes back to the app ---
  // On mobile the browser drops the page from memory after inactivity.
  // When the user comes back, the token in RAM is lost. This listener
  // forces an immediate refresh to restore authentication.
  // If the tab was discarded, the React state is lost but the HttpOnly
  // cookie survives: the refresh works without `utente`, which is only read
  // to reload the profile when it is missing.
  useEffect(() => {
    const gestisciVisibilita = async () => {
      if (document.visibilityState !== 'visible') return;
      // Best-effort: renews the token (dedup shared with api.js).
      const token = await refreshSessione();
      // If the tab had been discarded (state lost) but the refresh worked,
      // restore the profile. On failure I do NOT log out here: a real
      // protected call will handle any expiry (no premature logout that
      // would interrupt a workout in progress).
      if (token && !utente) {
        try {
          const profilo = await apiChiamata('/utenti/profilo');
          setUtente(profilo.dati);
        } catch {
          /* the next protected call will decide */
        }
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [utente]);

  // Session check at startup: the shared refresh gets a new access token
  // from the HttpOnly cookie, then the profile is read
  useEffect(() => {
    refreshSessione()
      .then(async token => {
        if (!token) return;
        const profilo = await apiChiamata('/utenti/profilo');
        setUtente(profilo.dati);
      })
      .catch(() => {
        // No active session — the user will have to log in
        cancellaToken();
      })
      .finally(() => setCaricamento(false));
  }, []);

  const login = useCallback(async (email, password, ricordaDispositivo = false) => {
    setErrore(null);
    try {
      const risposta = await apiChiamata('/auth/login', {
        metodo: 'POST',
        body: { email, password, ricordaDispositivo },
        skipAuth: true
      });

      impostaToken(risposta.dati.accessToken);
      setUtente(risposta.dati.utente);
      return risposta.dati.utente;
    } catch (err) {
      setErrore(err.message);
      throw err;
    }
  }, []);

  /**
   * Login with a passkey: the server sends a challenge, the device signs it
   * (fingerprint, face or PIN), the server checks the signature and opens the session.
   */
  const loginConPasskey = useCallback(async (ricordaDispositivo = false) => {
    setErrore(null);
    try {
      const { dati: sfida } = await apiChiamata('/auth/passkey/accesso/opzioni', { metodo: 'POST', skipAuth: true });
      const risposta = await startAuthentication({ optionsJSON: sfida.opzioni });
      const esito = await apiChiamata('/auth/passkey/accesso/verifica', {
        metodo: 'POST',
        body: { id: sfida.id, risposta, ricordaDispositivo },
        skipAuth: true
      });

      impostaToken(esito.dati.accessToken);
      setUtente(esito.dati.utente);
      return esito.dati.utente;
    } catch (err) {
      setErrore(err.message);
      throw err;
    }
  }, []);

  const registrazione = useCallback(async (dati) => {
    setErrore(null);
    try {
      const risposta = await apiChiamata('/auth/registrazione', {
        metodo: 'POST',
        body: dati,
        skipAuth: true
      });
      return risposta;
    } catch (err) {
      setErrore(err.message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // The device stops receiving the push notifications of whoever logs out
      await disiscriviDispositivo(api).catch(() => {});
      await apiChiamata('/auth/logout', { metodo: 'POST' });
    } catch {
      // Ignore logout errors
    } finally {
      cancellaToken();
      setUtente(null);
    }
  }, []);

  const aggiornaUtente = useCallback((nuoviDati) => {
    setUtente(prev => prev ? { ...prev, ...nuoviDati } : prev);
  }, []);

  const valore = {
    utente,
    caricamento,
    errore,
    autenticato: !!utente,
    isAdmin: utente?.ruolo === 'SUPERADMIN',
    isPT: utente?.ruolo === 'PERSONAL_TRAINER',
    login,
    loginConPasskey,
    registrazione,
    logout,
    aggiornaUtente,
    setErrore
  };

  return (
    <AuthContesto.Provider value={valore}>
      {children}
    </AuthContesto.Provider>
  );
}

export function useAuth() {
  const contesto = useContext(AuthContesto);
  if (!contesto) {
    throw new Error('useAuth deve essere usato dentro AuthProvider');
  }
  return contesto;
}

export default AuthContesto;
