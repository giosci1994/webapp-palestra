// ============================================
// GymMaster — Where a tapped notification leads
// ============================================
//
// The service worker (public/sw-push.js) tells an app already open where a
// tapped notification leads (gymmaster:apri), and the app goes there by
// itself, without reloading: back in the middle of a workout nothing on screen
// is lost. When it starts, the app also asks once whether a tap opened it
// (gymmaster:destinazione): some phones open it at its start page instead of
// the notification's.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { percorsoInterno } from '../utils/notifiche.js';

/**
 * Where to go for `percorso`: a path inside the app other than the page
 * already shown, or null (nothing to do).
 * @param {string} percorso - from the notification
 * @param {{ pathname: string, search: string }} dove - the page shown now
 */
export function destinazioneDa(percorso, dove) {
  const interno = percorsoInterno(percorso);
  return interno && interno !== `${dove.pathname}${dove.search}` ? interno : null;
}

export function useAperturaDaNotifica() {
  const naviga = useNavigate();

  useEffect(() => {
    const serviceWorker = globalThis.navigator?.serviceWorker;
    if (!serviceWorker) return undefined;
    let attivo = true;
    const vai = (percorso) => {
      const destinazione = attivo && destinazioneDa(percorso, window.location);
      if (destinazione) naviga(destinazione);
    };

    const alMessaggio = (evento) => {
      if (evento.data?.tipo !== 'gymmaster:apri') return;
      // The service worker waits for this answer, otherwise it reloads the page there
      evento.ports?.[0]?.postMessage({ ok: true });
      vai(evento.data.percorso);
    };
    serviceWorker.addEventListener('message', alMessaggio);
    serviceWorker.startMessages?.();

    serviceWorker.ready
      .then((registrazione) => {
        const canale = new MessageChannel();
        canale.port1.onmessage = (evento) => vai(evento.data?.percorso);
        registrazione.active?.postMessage({ tipo: 'gymmaster:destinazione' }, [canale.port2]);
      })
      .catch(() => {});

    return () => {
      attivo = false;
      serviceWorker.removeEventListener('message', alMessaggio);
    };
  }, [naviga]);
}
