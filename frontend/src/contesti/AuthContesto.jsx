// ============================================
// GymMaster — Contesto Autenticazione
// Provider React per stato auth globale
// ============================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiChiamata, impostaToken, cancellaToken, refreshSessione, impostaGestoreSessioneScaduta } from '../config/api.js';
import { startAuthentication } from '@simplewebauthn/browser';

const AuthContesto = createContext(null);

export function AuthProvider({ children }) {
  const [utente, setUtente] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(null);

  // La sessione muore in UN solo punto: quando una vera chiamata protetta
  // riceve 401 e il refresh fallisce (api.js). Così un blip transitorio o
  // una race sul refresh NON sloggano l'utente (es. durante un allenamento).
  useEffect(() => {
    impostaGestoreSessioneScaduta(() => {
      cancellaToken();
      setUtente(null);
    });
    return () => impostaGestoreSessioneScaduta(null);
  }, []);

  // --- Refresh proattivo del token (ogni 10 minuti) ---
  // L'access token ha TTL di 15 minuti. Rinnovandolo ogni 10,
  // evitiamo che scada mentre l'utente è nell'app. Best-effort: se fallisce
  // non sloggo (ci penserà la prossima chiamata protetta).
  useEffect(() => {
    if (!utente) return;
    const intervallo = setInterval(() => { refreshSessione(); }, 10 * 60 * 1000);
    return () => clearInterval(intervallo);
  }, [utente]);

  // --- Refresh immediato quando l'utente torna nell'app ---
  // Su mobile il browser scarica la pagina dalla memoria dopo inattività.
  // Quando l'utente torna, il token in RAM è perso. Questo listener
  // forza un refresh immediato per ripristinare l'autenticazione.
  // NOTA: non dipende più da `utente` — se la tab viene scaricata,
  // lo state React è perso ma il cookie HttpOnly sopravvive.
  useEffect(() => {
    const gestisciVisibilita = async () => {
      if (document.visibilityState !== 'visible') return;
      // Best-effort: rinnova il token (dedup condiviso con api.js).
      const token = await refreshSessione();
      // Se la tab era stata scaricata (state perso) ma il refresh è andato,
      // ripristina il profilo. In caso di fallimento NON sloggo qui: una
      // vera chiamata protetta gestirà l'eventuale scadenza (niente logout
      // prematuro che interromperebbe un allenamento in corso).
      if (token && !utente) {
        try {
          const profilo = await apiChiamata('/utenti/profilo');
          setUtente(profilo.dati);
        } catch {
          /* la prossima chiamata protetta deciderà */
        }
      }
    };

    document.addEventListener('visibilitychange', gestisciVisibilita);
    return () => document.removeEventListener('visibilitychange', gestisciVisibilita);
  }, [utente]);

  // Verifica sessione all'avvio: il refresh condiviso ottiene un nuovo access
  // token dal cookie HttpOnly, poi si legge il profilo
  useEffect(() => {
    refreshSessione()
      .then(async token => {
        if (!token) return;
        const profilo = await apiChiamata('/utenti/profilo');
        setUtente(profilo.dati);
      })
      .catch(() => {
        // Nessuna sessione attiva — l'utente dovrà fare login
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
   * Accesso con una passkey: il server manda una sfida, il dispositivo la firma
   * (impronta, volto o PIN), il server verifica la firma e apre la sessione.
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
      await apiChiamata('/auth/logout', { metodo: 'POST' });
    } catch {
      // Ignora errori di logout
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
