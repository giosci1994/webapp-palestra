// ============================================
// GymMaster — The list of notifications
// ============================================
//
// The rows of the bell panel (desktop) and of the Notifiche tab of the chat
// page: a tap marks the notification read and opens where it leads, inside
// the app only; the ✕ deletes it.

import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useNotifiche } from '../../contesti/NotificheContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';
import { formattaDataRelativa } from '../../utils/formattatori.js';
import { percorsoInterno } from '../../utils/notifiche.js';

/**
 * @param {{ onApri?: () => void }} props - onApri: after a tap (the bell closes its panel)
 */
export default function ListaNotifiche({ onApri }) {
  const { t } = useLingua();
  const naviga = useNavigate();
  const { notifiche, apri, elimina } = useNotifiche();

  if (notifiche.length === 0) {
    return <p className="text-sm text-[var(--testo-terziario)] px-4 py-6 text-center">{t('campanellaNotifiche.nessunaNotifica')}</p>;
  }

  const apriNotifica = (n) => {
    onApri?.();
    apri(n);
    const percorso = percorsoInterno(n.percorso);
    if (percorso) naviga(percorso);
  };

  return notifiche.map(n => (
    <div key={n.id} className={`flex items-start border-b border-[var(--bordo-light)] last:border-b-0 ${n.letta ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={() => apriNotifica(n)}
        className="flex-1 min-w-0 text-left pl-4 pr-1 py-3 transition-colors hover:bg-[var(--bg-terziario)]"
      >
        <div className="flex items-start gap-2">
          {!n.letta && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--accent)' }} />}
          <div className={`min-w-0 ${n.letta ? 'pl-4' : ''}`}>
            <p className="text-sm font-semibold text-[var(--testo-primario)]">{n.titolo}</p>
            <p className="text-xs text-[var(--testo-secondario)] line-clamp-2">{n.messaggio}</p>
            <p className="text-[10px] text-[var(--testo-terziario)] mt-1">{formattaDataRelativa(n.creatoIl)}</p>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => elimina(n)}
        aria-label={t('campanellaNotifiche.elimina')}
        title={t('campanellaNotifiche.elimina')}
        className="shrink-0 w-11 h-11 mt-1 mr-1 flex items-center justify-center rounded-full text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--bg-terziario)] transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  ));
}
