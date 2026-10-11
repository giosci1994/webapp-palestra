// ============================================
// GymMaster — Hook notifiche push
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { chiaveInByte, supportoPush, iscrizioneAttuale, disiscriviDispositivo, entro } from '../utils/push.js';

const permessoAttuale = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

/**
 * Le notifiche push su questo dispositivo: se si possono attivare, se lo sono,
 * e le funzioni per attivarle, toglierle e provarle (services/push.service.js
 * nel backend, public/sw-push.js nel service worker).
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
        // Il browser e' iscritto: si riallinea il server, che potrebbe averla persa
        if (attive && iscrizione) api.post('/notifiche/push/iscrizione', iscrizione.toJSON()).catch(() => {});
        setStato(s => ({ ...s, caricato: true, serverAttivo: attive, chiave, iscritto: Boolean(iscrizione) }));
      })
      .catch(() => { if (!annullato) setStato(s => ({ ...s, caricato: true })); });
    return () => { annullato = true; };
  }, [supporto.supportate]);

  /** Chiede il permesso e iscrive il dispositivo. false se il permesso e' negato */
  const attiva = useCallback(async () => {
    const permesso = await Notification.requestPermission();
    setStato(s => ({ ...s, permesso }));
    if (permesso !== 'granted') return false;
    const attuale = await iscrizioneAttuale();
    if (!attuale) throw new Error('Il service worker non è attivo: ricarica la pagina e riprova');
    // L'iscrizione passa dal servizio push del browser (Google, Mozilla,
    // Apple): se non risponde si dice, invece di restare appesi
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

  /** Una notifica di prova a tutti i dispositivi dell'utente: quanti ne raggiunge */
  const prova = useCallback(() => api.post('/notifiche/push/prova').then(r => r.dati?.raggiunti ?? 0), []);

  return {
    ...stato,
    caricato: stato.caricato || !supporto.supportate,
    supportate: supporto.supportate,
    motivo: supporto.motivo,
    attiva, disattiva, prova
  };
}
