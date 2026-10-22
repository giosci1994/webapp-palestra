// ============================================
// GymMaster — Desktop sidebar
// Fixed side navigation
// ============================================

import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contesti/AuthContesto.jsx';
import { useSocket } from '../../contesti/SocketContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';
import { RUOLI } from '../../utils/costanti.js';
import { api } from '../../config/api.js';
import CampanellaNotifiche from '../comuni/CampanellaNotifiche.jsx';
import { motion } from 'framer-motion';
import { 
  Home, ClipboardList, Dumbbell, History, BarChart2, MessageCircle,
  Bot, Trophy, Users, Building, BookOpen, LogOut, Menu, Library, UserCheck, Sparkles,
  CalendarClock, ClipboardCheck
} from 'lucide-react';

// Menu entries: `chiave` is a translation key, shown with t() when rendering
const MENU_PRINCIPALE = [
  { percorso: '/dashboard', Icona: Home, chiave: 'sidebar.menu.dashboard' },
  { percorso: '/schede', Icona: ClipboardList, chiave: 'sidebar.menu.schede' },
  { percorso: '/pianificazione', Icona: CalendarClock, chiave: 'sidebar.menu.pianificazione' },
  { percorso: '/catalogo', Icona: Library, chiave: 'sidebar.menu.catalogo' },
  { percorso: '/allenamento', Icona: Dumbbell, chiave: 'sidebar.menu.allenamento' },
  { percorso: '/storico', Icona: History, chiave: 'sidebar.menu.storico' },
  { percorso: '/statistiche', Icona: BarChart2, chiave: 'sidebar.menu.statistiche' },
  { percorso: '/chat', Icona: MessageCircle, chiave: 'sidebar.menu.chat' },
  { percorso: '/assistente', Icona: Bot, chiave: 'sidebar.menu.assistente' },
  { percorso: '/gamification', Icona: Trophy, chiave: 'sidebar.menu.classifiche' }
];

const MENU_ADMIN = [
  { percorso: '/admin/utenti', Icona: Users, chiave: 'sidebar.admin.utenti' },
  { percorso: '/admin/palestre', Icona: Building, chiave: 'sidebar.admin.palestre' },
  { percorso: '/admin/esercizi', Icona: BookOpen, chiave: 'sidebar.admin.esercizi', badgeKey: 'suggerimenti' },
  { percorso: '/admin/novita', Icona: Sparkles, chiave: 'sidebar.admin.novita' },
  { percorso: '/admin/allenamenti', Icona: ClipboardCheck, chiave: 'sidebar.admin.allenamenti' }
];

const MENU_PT = [
  { percorso: '/pt', Icona: UserCheck, chiave: 'sidebar.pt.dashboard' },
];

export default function Sidebar({ isCollapsed, setIsCollapsed }) {
  const { t } = useLingua();
  const { utente, logout, isAdmin, isPT } = useAuth();
  const { on } = useSocket();
  const [badgeSuggerimenti, setBadgeSuggerimenti] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/admin/suggerimenti/conteggio')
      .then(r => setBadgeSuggerimenti(r.dati?.pendenti || 0))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const cleanup = on('notifica:nuova', (notifica) => {
      if (notifica.tipo === 'suggerimento_esercizio') {
        setBadgeSuggerimenti(prev => prev + 1);
      }
    });
    return cleanup;
  }, [isAdmin, on]);

  // The role under the name: its label in the current language, in lower case
  const etichettaRuolo = RUOLI[utente?.ruolo] ? t(RUOLI[utente.ruolo].label).toLowerCase() : utente?.ruolo?.toLowerCase();

  const classeLink = ({ isActive }) =>
    `flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-5 px-6'} py-4 rounded-[var(--raggio-md)] transition-all duration-200 text-lg font-medium relative group ${
      isActive
        ? 'bg-[var(--accent-dim)] text-orange-400'
        : 'text-orange-500 hover:bg-[var(--bg-terziario)] hover:text-orange-400'
    }`;

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isCollapsed ? 96 : 288 }}
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen border-r border-[var(--vetro-bordo)] z-40"
      style={{ background: 'var(--vetro)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      {/* Header / Logo */}
      {/* No overflow-hidden: it clipped the notification bell panel, which
          opens below the header. The gradient background already fills that exact area. */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-6'} h-[88px] border-b border-[var(--vetro-bordo)] relative shrink-0`}>
        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" style={{ background: 'linear-gradient(135deg, var(--accent), transparent)' }}></div>
        
        {!isCollapsed && (
          <motion.span 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-3xl font-extrabold testo-gradient relative z-10" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.03em' }}
          >
            GymMaster
          </motion.span>
        )}

        <div className={`relative z-10 flex items-center ${isCollapsed ? 'flex-col gap-1' : 'gap-1 ml-2'}`}>
          <CampanellaNotifiche compatta={isCollapsed} />
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded hover:bg-[var(--bg-terziario)] transition-colors text-white"
          >
            <Menu size={28} />
          </button>
        </div>
      </div>

      {/* Main menu */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto no-scrollbar">
        {MENU_PRINCIPALE.map((item) => {
          const { Icona } = item;
          return (
            <NavLink key={item.percorso} to={item.percorso} className={classeLink} title={isCollapsed ? t(item.chiave) : undefined}>
              <Icona size={28} className="text-white shrink-0" />
              
              {!isCollapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
                  {t(item.chiave)}
                </motion.span>
              )}
            </NavLink>
          );
        })}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className={`mt-4 mb-2 ${isCollapsed ? 'px-0 text-center' : 'px-4'}`}>
              {isCollapsed ? (
                <div className="w-full h-px bg-[var(--bordo-light)] my-2"></div>
              ) : (
                <span className="text-xs font-semibold text-[var(--testo-terziario)] uppercase tracking-wider">
                  {t('sidebar.sezioneAdmin')}
                </span>
              )}
            </div>
            {MENU_ADMIN.map((item) => {
              const { Icona } = item;
              return (
                <NavLink key={item.percorso} to={item.percorso} className={classeLink} title={isCollapsed ? t(item.chiave) : undefined}>
                  <Icona size={28} className="text-white shrink-0" />
                  
                  {!isCollapsed && (
                    <>
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 whitespace-nowrap">
                        {t(item.chiave)}
                      </motion.span>
                      {item.badgeKey === 'suggerimenti' && badgeSuggerimenti > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold bg-[var(--pericolo)] text-white animate-pulse">
                          {badgeSuggerimenti}
                        </span>
                      )}
                    </>
                  )}

                  {isCollapsed && (
                    <>
                      {item.badgeKey === 'suggerimenti' && badgeSuggerimenti > 0 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[var(--pericolo)]"></span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </>
        )}

        {/* Personal trainer section */}
        {isPT && (
          <>
            <div className={`mt-4 mb-2 ${isCollapsed ? 'px-0 text-center' : 'px-4'}`}>
              {isCollapsed ? (
                <div className="w-full h-px bg-[var(--bordo-light)] my-2"></div>
              ) : (
                <span className="text-xs font-semibold text-[var(--testo-terziario)] uppercase tracking-wider">
                  {t('sidebar.sezionePT')}
                </span>
              )}
            </div>
            {MENU_PT.map((item) => {
              const { Icona } = item;
              return (
                <NavLink key={item.percorso} to={item.percorso} className={classeLink} title={isCollapsed ? t(item.chiave) : undefined}>
                  <Icona size={28} className="text-white shrink-0" />
                  {!isCollapsed && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
                      {t(item.chiave)}
                    </motion.span>
                  )}
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      {/* User profile at the bottom */}
      <div className={`p-6 border-t border-[var(--vetro-bordo)] bg-[rgba(0,0,0,0.2)] ${isCollapsed ? 'flex flex-col items-center gap-4' : ''}`}>
        <NavLink to="/profilo" className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-4'} hover:bg-[var(--bg-terziario)] p-3 -m-3 rounded-[var(--raggio-md)] transition-colors group`} title={isCollapsed ? t('sidebar.profilo') : undefined}>
          <div className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-xl font-bold shadow-[var(--ombra-accent)]"
               style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {utente?.nome?.charAt(0)?.toUpperCase() || '?'}
          </div>
          
          {!isCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 min-w-0">
              <p className="text-lg font-medium text-orange-500 group-hover:text-orange-400 truncate transition-colors">{utente?.nome}</p>
              <p className="text-sm text-[var(--testo-terziario)]">{etichettaRuolo}</p>
            </motion.div>
          )}
        </NavLink>
        
        <button onClick={logout}
                className={`w-full mt-6 flex items-center justify-center gap-3 py-3 rounded-[var(--raggio-md)] text-base text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] transition-all ${isCollapsed ? 'px-0' : 'px-4'}`}
                title={isCollapsed ? t('sidebar.esci') : undefined}>
          <LogOut size={22} className="shrink-0" /> 
          {!isCollapsed && <span>{t('sidebar.esci')}</span>}
        </button>
      </div>
    </motion.aside>
  );
}
