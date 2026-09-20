// ============================================
// GymMaster — Campanella Notifiche
// Contatore non lette + pannello con l'elenco
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { useSocket } from '../../contesti/SocketContesto.jsx';
import { api } from '../../config/api.js';
import { formattaDataRelativa } from '../../utils/formattatori.js';

export default function CampanellaNotifiche({ compatta = false }) {
  const [aperto, setAperto] = useState(false);
  const [notifiche, setNotifiche] = useState([]);
  const [nonLette, setNonLette] = useState(0);
  const contenitore = useRef(null);
  const { on } = useSocket();
  const naviga = useNavigate();

  const carica = useCallback(async () => {
    try {
      const res = await api.get('/notifiche?limite=20');
      setNotifiche(res.dati?.notifiche || []);
      setNonLette(res.dati?.nonLette || 0);
    } catch {
      // Silenzioso: la campanella non deve disturbare se l'API non risponde
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Arrivo in tempo reale: aggiorna elenco e contatore senza ricaricare
  useEffect(() => {
    const pulisci = on('notifica:nuova', (notifica) => {
      setNotifiche(prec => [notifica, ...prec].slice(0, 20));
      setNonLette(n => n + 1);
    });
    return pulisci;
  }, [on]);

  // Chiusura al clic fuori e con Esc
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e) => { if (contenitore.current && !contenitore.current.contains(e.target)) setAperto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAperto(false); };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc); };
  }, [aperto]);

  const apriNotifica = async (n) => {
    setAperto(false);
    if (!n.letta) {
      setNotifiche(prec => prec.map(x => (x.id === n.id ? { ...x, letta: true } : x)));
      setNonLette(v => Math.max(0, v - 1));
      api.patch(`/notifiche/${n.id}/letta`).catch(() => {});
    }
    // Solo percorsi interni: una notifica non deve poter portare fuori dall'app
    if (n.percorso && n.percorso.startsWith('/')) naviga(n.percorso);
  };

  const segnaTutte = async () => {
    setNotifiche(prec => prec.map(x => ({ ...x, letta: true })));
    setNonLette(0);
    api.post('/notifiche/segna-tutte-lette').catch(() => {});
  };

  return (
    <div ref={contenitore} className="relative">
      <button
        type="button"
        onClick={() => setAperto(v => !v)}
        aria-label={nonLette > 0 ? `Notifiche: ${nonLette} non lette` : 'Notifiche'}
        aria-expanded={aperto}
        className="relative p-2 rounded hover:bg-[var(--bg-terziario)] transition-colors text-white"
      >
        <Bell size={compatta ? 22 : 26} />
        {nonLette > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: 'var(--pericolo, #ef4444)', color: '#fff' }}
          >
            {nonLette > 9 ? '9+' : nonLette}
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
            className="absolute z-50 mt-2 w-[320px] max-w-[85vw] rounded-[var(--raggio-md)] overflow-hidden left-0"
            style={{ background: 'var(--bg-secondario, #14141c)', border: '1px solid var(--bordo-light)', boxShadow: 'var(--ombra-card)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--bordo-light)]">
              <span className="font-bold text-sm">Notifiche</span>
              {nonLette > 0 && (
                <button type="button" onClick={segnaTutte} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                  <CheckCheck size={14} /> Segna tutte lette
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {notifiche.length === 0 ? (
                <p className="text-sm text-[var(--testo-terziario)] px-4 py-6 text-center">Nessuna notifica.</p>
              ) : (
                notifiche.map(n => (
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
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
