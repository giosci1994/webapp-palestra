// ============================================
// GymMaster — The list of notifications
// ============================================
//
// The rows of the bell panel (desktop) and of the Notifiche tab of the chat
// page: a tap marks the notification read and opens where it leads, inside
// the app only.

import { useNavigate } from 'react-router-dom';
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
  const { notifiche, apri } = useNotifiche();

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
    <button
      key={n.id}
      type="button"
      onClick={() => apriNotifica(n)}
      className={`w-full text-left px-4 py-3 border-b border-[var(--bordo-light)] last:border-b-0 transition-colors hover:bg-[var(--bg-terziario)] ${n.letta ? 'opacity-60' : ''}`}
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
  ));
}
