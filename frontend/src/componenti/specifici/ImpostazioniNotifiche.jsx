// ============================================
// GymMaster — Phone notifications (Profile)
// ============================================

import { useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { usePushNotifiche } from '../../hooks/usePushNotifiche.js';

const COSA_ARRIVA = [
  ['⏱️', 'La fine del recupero, anche a schermo bloccato'],
  ['💬', 'I messaggi in chat'],
  ['📅', 'I promemoria degli allenamenti in programma'],
  ['🔔', 'Tutto quello che arriva nella campanella']
];

export default function ImpostazioniNotifiche() {
  const push = usePushNotifiche();
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState({ testo: '', tipo: '' });

  const esegui = async (azione, riuscito) => {
    setMessaggio({ testo: '', tipo: '' });
    setInCorso(true);
    try {
      const esito = await azione();
      const testo = riuscito(esito);
      if (testo) setMessaggio({ testo, tipo: 'ok' });
    } catch (err) {
      setMessaggio({ testo: err.message || 'Operazione non riuscita', tipo: 'err' });
    } finally {
      setInCorso(false);
    }
  };

  const attiva = () => esegui(push.attiva, ok => ok ? 'Notifiche attive su questo dispositivo.' : '');
  const disattiva = () => esegui(push.disattiva, () => 'Questo dispositivo non riceve più notifiche.');
  const prova = () => esegui(push.prova, n => n
    ? 'Notifica di prova inviata: dovrebbe arrivare fra un attimo.'
    : 'Nessun dispositivo raggiunto: prova a disattivare e riattivare.');

  let avviso = null;
  if (!push.supportate && push.motivo === 'iphone-da-installare') {
    avviso = 'Su iPhone le notifiche arrivano solo con GymMaster nella schermata Home: in Safari tocca Condividi → «Aggiungi alla schermata Home», poi apri l\'app da lì.';
  } else if (!push.supportate) {
    avviso = 'Questo browser non supporta le notifiche push.';
  } else if (push.caricato && !push.serverAttivo) {
    avviso = 'Le notifiche push non sono ancora attive sul server.';
  } else if (push.permesso === 'denied') {
    avviso = 'Hai bloccato le notifiche per GymMaster: riattivale dalle impostazioni del browser (il lucchetto accanto all\'indirizzo → Notifiche), poi torna qui.';
  }

  return (
    <div className="glass-card overflow-hidden mb-6">
      <div className="p-card-inner border-b border-[var(--bordo-light)]">
        <h3 className="font-bold text-lg flex items-center gap-2"><Bell size={20} className="text-[var(--accent)]" /> Notifiche sul telefono</h3>
        <p className="text-xs text-[var(--testo-terziario)] mt-1">Ti avvisano anche ad app chiusa. Con l'app aperta restano nella campanella, senza doppioni.</p>
      </div>
      <div className="p-card-inner flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {COSA_ARRIVA.map(([icona, testo]) => (
            <li key={testo} className="flex items-center gap-3 text-sm text-[var(--testo-secondario)]">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--bg-terziario)]">{icona}</span>
              {testo}
            </li>
          ))}
        </ul>

        {avviso ? (
          <p className="text-sm text-[var(--avviso)] bg-[var(--bg-terziario)] rounded-[var(--raggio-md)] p-3">{avviso}</p>
        ) : !push.caricato ? (
          <p className="text-sm text-[var(--testo-terziario)]">Controllo le notifiche su questo dispositivo…</p>
        ) : push.iscritto ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-[var(--successo)]">✅ Attive su questo dispositivo</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={prova} disabled={inCorso} className="btn-secondario text-sm !py-2 flex items-center gap-1.5">
                <Send size={14} /> Prova
              </button>
              <button onClick={disattiva} disabled={inCorso} className="btn-secondario text-sm !py-2 flex items-center gap-1.5">
                <BellOff size={14} /> Disattiva
              </button>
            </div>
          </div>
        ) : (
          <button onClick={attiva} disabled={inCorso} className="btn-primario text-sm !py-2.5 self-start flex items-center gap-2">
            <Bell size={16} /> {inCorso ? 'Un attimo…' : 'Attiva le notifiche'}
          </button>
        )}

        {messaggio.testo && (
          <p className={`text-xs ${messaggio.tipo === 'err' ? 'text-[var(--pericolo)]' : 'text-[var(--testo-secondario)]'}`}>{messaggio.testo}</p>
        )}
      </div>
    </div>
  );
}
