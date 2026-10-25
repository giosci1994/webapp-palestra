// ============================================
// GymMaster — Notifications and messages to read
// ============================================
//
// One source for the bell (desktop sidebar), the Notifiche tab of the chat
// page and the badge on the messages tab of the bottom bar (phone, where the
// sidebar is hidden): a notification read in one place is read everywhere.
// - notifiche: the latest ones (NOTIFICHE_MAX), live through the socket
//   (notifica:nuova), read again when the app comes back
// - nonLette: unread notifications
// - messaggiNonLetti: unread chat messages, read again at every page and
//   when the app comes back (a message reaches the socket only while its
//   conversation is open)
// - apri(n): marks it read; segnaTutteLette()

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../config/api.js';
import { useSocket } from './SocketContesto.jsx';
import { conNuova, conLetta, tutteLette, NOTIFICHE_MAX } from '../utils/notifiche.js';

const Contesto = createContext(null);

/** Calls `leggi` now and every time the app comes back to the foreground */
function leggiOraEAlRitorno(leggi) {
  leggi();
  const alRitorno = () => { if (document.visibilityState === 'visible') leggi(); };
  document.addEventListener('visibilitychange', alRitorno);
  return () => document.removeEventListener('visibilitychange', alRitorno);
}

export function NotificheProvider({ children }) {
  const { on } = useSocket();
  const { pathname } = useLocation();
  const [notifiche, setNotifiche] = useState([]);
  const [nonLette, setNonLette] = useState(0);
  const [caricate, setCaricate] = useState(false);
  const [messaggiNonLetti, setMessaggiNonLetti] = useState(0);

  // Silent on errors: notifications must not get in the way if the API does not answer
  useEffect(() => {
    let attivo = true;
    const smetti = leggiOraEAlRitorno(() => api.get(`/notifiche?limite=${NOTIFICHE_MAX}`)
      .then(risposta => {
        if (!attivo) return;
        setNotifiche(risposta.dati?.notifiche || []);
        setNonLette(risposta.dati?.nonLette || 0);
      })
      .catch(() => {})
      .finally(() => { if (attivo) setCaricate(true); }));
    return () => { attivo = false; smetti(); };
  }, []);

  useEffect(() => {
    let attivo = true;
    const smetti = leggiOraEAlRitorno(() => api.get('/chat/non-letti')
      .then(risposta => { if (attivo) setMessaggiNonLetti(risposta.dati?.totale || 0); })
      .catch(() => {}));
    return () => { attivo = false; smetti(); };
  }, [pathname]);

  useEffect(() => on('notifica:nuova', (notifica) => {
    setNotifiche(prec => conNuova(prec, notifica));
    setNonLette(n => n + 1);
  }), [on]);

  const apri = useCallback((notifica) => {
    if (notifica.letta) return;
    setNotifiche(prec => conLetta(prec, notifica.id));
    setNonLette(n => Math.max(0, n - 1));
    api.patch(`/notifiche/${notifica.id}/letta`).catch(() => {});
  }, []);

  const segnaTutteLette = useCallback(() => {
    setNotifiche(tutteLette);
    setNonLette(0);
    api.post('/notifiche/segna-tutte-lette').catch(() => {});
  }, []);

  return (
    <Contesto.Provider value={{ notifiche, nonLette, caricate, messaggiNonLetti, apri, segnaTutteLette }}>
      {children}
    </Contesto.Provider>
  );
}

export function useNotifiche() {
  return useContext(Contesto);
}
