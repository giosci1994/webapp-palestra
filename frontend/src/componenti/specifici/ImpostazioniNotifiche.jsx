// ============================================
// GymMaster — Phone notifications (Profile)
// ============================================

import { useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { usePushNotifiche } from '../../hooks/usePushNotifiche.js';
import { useLingua } from '../../hooks/useLingua.js';

// Icon and translation key of each thing the notifications bring
const COSA_ARRIVA = [
  ['⏱️', 'impostazioniNotifiche.cosaArriva.recupero'],
  ['💬', 'impostazioniNotifiche.cosaArriva.chat'],
  ['📅', 'impostazioniNotifiche.cosaArriva.promemoria'],
  ['🔔', 'impostazioniNotifiche.cosaArriva.campanella']
];

export default function ImpostazioniNotifiche() {
  const { t } = useLingua();
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
      setMessaggio({ testo: err.message || t('impostazioniNotifiche.esito.erroreGenerico'), tipo: 'err' });
    } finally {
      setInCorso(false);
    }
  };

  const attiva = () => esegui(push.attiva, ok => ok ? t('impostazioniNotifiche.esito.attivate') : '');
  const disattiva = () => esegui(push.disattiva, () => t('impostazioniNotifiche.esito.disattivate'));
  const prova = () => esegui(push.prova, n => n
    ? t('impostazioniNotifiche.esito.provaInviata')
    : t('impostazioniNotifiche.esito.provaNessunDispositivo'));

  let avviso = null;
  if (!push.supportate && push.motivo === 'iphone-da-installare') {
    avviso = t('impostazioniNotifiche.avvisoIphone');
  } else if (!push.supportate) {
    avviso = t('impostazioniNotifiche.avvisoBrowser');
  } else if (push.caricato && !push.serverAttivo) {
    avviso = t('impostazioniNotifiche.avvisoServer');
  } else if (push.permesso === 'denied') {
    avviso = t('impostazioniNotifiche.avvisoBloccate');
  }

  return (
    <div className="glass-card overflow-hidden mb-6">
      <div className="p-card-inner border-b border-[var(--bordo-light)]">
        <h3 className="font-bold text-lg flex items-center gap-2"><Bell size={20} className="text-[var(--accent)]" /> {t('impostazioniNotifiche.titolo')}</h3>
        <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('impostazioniNotifiche.descrizione')}</p>
      </div>
      <div className="p-card-inner flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {COSA_ARRIVA.map(([icona, chiave]) => (
            <li key={chiave} className="flex items-center gap-3 text-sm text-[var(--testo-secondario)]">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--bg-terziario)]">{icona}</span>
              {t(chiave)}
            </li>
          ))}
        </ul>

        {avviso ? (
          <p className="text-sm text-[var(--avviso)] bg-[var(--bg-terziario)] rounded-[var(--raggio-md)] p-3">{avviso}</p>
        ) : !push.caricato ? (
          <p className="text-sm text-[var(--testo-terziario)]">{t('impostazioniNotifiche.controllo')}</p>
        ) : push.iscritto ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-[var(--successo)]">{t('impostazioniNotifiche.attive')}</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={prova} disabled={inCorso} className="btn-secondario text-sm !py-2 flex items-center gap-1.5">
                <Send size={14} /> {t('impostazioniNotifiche.prova')}
              </button>
              <button onClick={disattiva} disabled={inCorso} className="btn-secondario text-sm !py-2 flex items-center gap-1.5">
                <BellOff size={14} /> {t('impostazioniNotifiche.disattiva')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={attiva} disabled={inCorso} className="btn-primario text-sm !py-2.5 self-start flex items-center gap-2">
            <Bell size={16} /> {inCorso ? t('impostazioniNotifiche.attendi') : t('impostazioniNotifiche.attiva')}
          </button>
        )}

        {messaggio.testo && (
          <p className={`text-xs ${messaggio.tipo === 'err' ? 'text-[var(--pericolo)]' : 'text-[var(--testo-secondario)]'}`}>{messaggio.testo}</p>
        )}
      </div>
    </div>
  );
}
