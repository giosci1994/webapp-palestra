// ============================================
// GymMaster — The workout in progress
// ============================================
//
// An open workout is resumed, not started over: whoever left it (a tap on a
// notification, the back button) and started another one left workouts open
// in the background, and the statistics counted them twice.
// - inCorso: the open workout, for the bar "Allenamento in corso · Riprendi"
//   (GET /sessioni/in-corso), read again at every page and when the app comes back
// - avvia(schedaId): starts a workout; with another one open the server
//   answers 409 ALLENAMENTO_IN_CORSO and the user chooses: resume it, or
//   close it and start the new one

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../config/api.js';
import SceltaAllenamentoInCorso from '../componenti/specifici/SceltaAllenamentoInCorso.jsx';

const Contesto = createContext(null);

/** The live workout page: there the workout is already in front of the user */
const inAllenamento = percorso => /^\/allenamento\/.+/.test(percorso);

export function AllenamentoInCorsoProvider({ children }) {
  const naviga = useNavigate();
  const { pathname } = useLocation();
  const [inCorso, setInCorso] = useState(null);
  // The choice before starting: { sessione: the open one, schedaId: the new one }
  const [scelta, setScelta] = useState(null);
  const [avviando, setAvviando] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (inAllenamento(pathname)) return undefined;
    let attivo = true;
    // Without a network the bar stays as it was
    const leggi = () => api.get('/sessioni/in-corso')
      .then(risposta => { if (attivo) setInCorso(risposta.dati); })
      .catch(() => {});
    leggi();
    const alRitorno = () => { if (document.visibilityState === 'visible') leggi(); };
    document.addEventListener('visibilitychange', alRitorno);
    return () => {
      attivo = false;
      document.removeEventListener('visibilitychange', alRitorno);
    };
  }, [pathname]);

  const riprendi = useCallback((sessione) => {
    setScelta(null);
    naviga(`/allenamento/${sessione.id}`);
  }, [naviga]);

  /**
   * Starts a workout on the plan, or a free one with schedaId null. true if
   * it started; false if the user has to choose first (another workout is
   * open). Other errors are thrown.
   */
  const avvia = useCallback(async (schedaId, { chiudiAperte = false } = {}) => {
    try {
      const dove = schedaId == null ? { libero: true } : { schedaId: Number(schedaId) };
      const risposta = await api.post('/sessioni', { ...dove, ...(chiudiAperte && { chiudiAperte: true }) });
      setScelta(null);
      setInCorso(null);
      naviga(`/allenamento/${risposta.dati.id}`, { state: { sessione: risposta.dati } });
      return true;
    } catch (err) {
      if (err.codice !== 'ALLENAMENTO_IN_CORSO') throw err;
      setErrore('');
      setScelta({ sessione: err.dettagli.sessione, schedaId });
      setInCorso(err.dettagli.sessione);
      return false;
    }
  }, [naviga]);

  const chiudiEInizia = async () => {
    try {
      setAvviando(true);
      setErrore('');
      const vecchia = scelta.sessione.id;
      await avvia(scelta.schedaId, { chiudiAperte: true });
      // What the workout page kept of the closed workout is no longer needed
      try { localStorage.removeItem(`gymmaster_workout_${vecchia}`); } catch { /* storage unavailable */ }
    } catch (err) {
      setErrore(err.message);
    } finally {
      setAvviando(false);
    }
  };

  return (
    <Contesto.Provider value={{ inCorso: inAllenamento(pathname) ? null : inCorso, avvia, riprendi }}>
      {children}
      <SceltaAllenamentoInCorso
        sessione={scelta?.sessione}
        avviando={avviando}
        errore={errore}
        onRiprendi={() => riprendi(scelta.sessione)}
        onChiudiEInizia={chiudiEInizia}
        onAnnulla={() => setScelta(null)}
      />
    </Contesto.Provider>
  );
}

export function useAllenamentoInCorso() {
  return useContext(Contesto);
}
