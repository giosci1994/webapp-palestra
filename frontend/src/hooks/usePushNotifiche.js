// ============================================
// GymMaster — Push notifications hook
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { chiaveInByte, supportoPush, iscrizioneAttuale, disiscriviDispositivo, entro } from '../utils/push.js';

const permessoAttuale = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

/**
 * Push notifications on this device: whether they can be turned on, whether
 * they are on, and the functions to turn them on, off and test them
 * (services/push.service.js in the backend, public/sw-push.js in the service worker).
 */
export function usePushNotifiche() {
  const [supporto] = useState(supportoPush);
  const [stato, setStato] = useState({ caricato: false, serverAttivo: false, chiave: null, iscritto: false, permesso: permessoAttuale() });

  useEffect(() => {
    if (!supporto.supportate) return;
    let annullato = false;
    Promise.all([api.get('/notifiche/push'), iscrizioneAttuale()])
      .then(([risposta, attuale]) => {
        if (annullato) return;
        const { attive, chiave } = risposta.dati;
        const iscrizione = attuale?.iscrizione ?? null;
        // The browser is subscribed: re-sync the server, which may have lost it
        if (attive && iscrizione) api.post('/notifiche/push/iscrizione', iscrizione.toJSON()).catch(() => {});
        setStato(s => ({ ...s, caricato: true, serverAttivo: attive, chiave, iscritto: Boolean(iscrizione) }));
      })
      .catch(() => { if (!annullato) setStato(s => ({ ...s, caricato: true })); });
    return () => { annullato = true; };
  }, [supporto.supportate]);

  /** Asks for permission and subscribes the device. false if permission is denied */
  const attiva = useCallback(async () => {
    const permesso = await Notification.requestPermission();
    setStato(s => ({ ...s, permesso }));
    if (permesso !== 'granted') return false;
    const attuale = await iscrizioneAttuale();
    if (!attuale) throw new Error('Il service worker non è attivo: ricarica la pagina e riprova');
    // The subscription goes through the browser's push service (Google, Mozilla,
    // Apple): if it does not answer we say so, instead of hanging
    let iscrizione = attuale.iscrizione;
    if (!iscrizione) {
      try {
        iscrizione = await entro(attuale.registrazione.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chiaveInByte(stato.chiave)
        }), 20000, 'il servizio di notifiche del browser non risponde');
      } catch (err) {
        throw new Error(`Il browser non è riuscito ad attivare le notifiche (${err.message}). Riprova fra poco.`, { cause: err });
      }
    }
    await api.post('/notifiche/push/iscrizione', iscrizione.toJSON());
    setStato(s => ({ ...s, iscritto: true }));
    return true;
  }, [stato.chiave]);

  const disattiva = useCallback(async () => {
    await disiscriviDispositivo(api);
    setStato(s => ({ ...s, iscritto: false }));
  }, []);

  /** A test notification to all the user's devices: how many it reaches */
  const prova = useCallback(() => api.post('/notifiche/push/prova').then(r => r.dati?.raggiunti ?? 0), []);

  return {
    ...stato,
    caricato: stato.caricato || !supporto.supportate,
    supportate: supporto.supportate,
    motivo: supporto.motivo,
    attiva, disattiva, prova
  };
}
