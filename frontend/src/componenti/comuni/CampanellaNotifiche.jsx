// ============================================
// GymMaster — Notification bell
// Unread counter + panel with the list (desktop sidebar; on the phone the
// list is in the Notifiche tab of the chat page)
// ============================================

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useNotifiche } from '../../contesti/NotificheContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';
import { testoContatore } from '../../utils/notifiche.js';
import ListaNotifiche from './ListaNotifiche.jsx';
import AzioniNotifiche from './AzioniNotifiche.jsx';

export default function CampanellaNotifiche({ compatta = false }) {
  const { t } = useLingua();
  const [aperto, setAperto] = useState(false);
  const { nonLette } = useNotifiche();
  const contenitore = useRef(null);

  // Closes on a click outside and with Esc
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e) => { if (contenitore.current && !contenitore.current.contains(e.target)) setAperto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAperto(false); };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc); };
  }, [aperto]);

  return (
    <div ref={contenitore} className="relative">
      <button
        type="button"
        onClick={() => setAperto(v => !v)}
        aria-label={nonLette > 0 ? t('campanellaNotifiche.notificheNonLette', { numero: nonLette }) : t('campanellaNotifiche.notifiche')}
        aria-expanded={aperto}
        className="relative p-2 rounded hover:bg-[var(--bg-terziario)] transition-colors text-white"
      >
        <Bell size={compatta ? 22 : 26} />
        {nonLette > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: 'var(--pericolo, #ef4444)', color: '#fff' }}
          >
            {testoContatore(nonLette)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {aperto && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute z-50 mt-2 w-[340px] max-w-[85vw] rounded-[var(--raggio-md)] overflow-hidden left-0"
            style={{ background: 'var(--bg-secondario, #14141c)', border: '1px solid var(--bordo-light)', boxShadow: 'var(--ombra-card)' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--bordo-light)]">
              <span className="font-bold text-sm">{t('campanellaNotifiche.notifiche')}</span>
              <AzioniNotifiche />
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              <ListaNotifiche onApri={() => setAperto(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
