// ============================================
// GymMaster — "Mark all as read" and "Delete all"
// ============================================
//
// Above the list of notifications, in the bell panel (desktop) and in the
// Notifiche tab of the chat page.

import { CheckCheck, Trash2 } from 'lucide-react';
import { useNotifiche } from '../../contesti/NotificheContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';

export default function AzioniNotifiche() {
  const { t } = useLingua();
  const { notifiche, nonLette, segnaTutteLette, eliminaTutte } = useNotifiche();

  if (notifiche.length === 0) return null;

  const svuota = () => {
    if (confirm(t('campanellaNotifiche.confermaEliminaTutte'))) eliminaTutte();
  };

  return (
    <div className="flex items-center gap-3">
      {nonLette > 0 && (
        <button type="button" onClick={segnaTutteLette} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
          <CheckCheck size={14} /> {t('campanellaNotifiche.segnaTutteLette')}
        </button>
      )}
      <button type="button" onClick={svuota} className="text-xs text-[var(--testo-terziario)] hover:text-[var(--pericolo)] flex items-center gap-1 transition-colors">
        <Trash2 size={14} /> {t('campanellaNotifiche.eliminaTutte')}
      </button>
    </div>
  );
}
