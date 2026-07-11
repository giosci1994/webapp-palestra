// ============================================
// GymMaster — Barra Navigazione Mobile
// Bottom navigation con 5 tab
// ============================================

import { NavLink } from 'react-router-dom';
import { Home, ClipboardList, Dumbbell, MessageCircle, User } from 'lucide-react';

const TABS = [
  { percorso: '/dashboard', Icona: Home, etichetta: 'Home' },
  { percorso: '/schede', Icona: ClipboardList, etichetta: 'Schede' },
  { percorso: '/allenamento', Icona: Dumbbell, etichetta: 'Allenamento', principale: true },
  { percorso: '/chat', Icona: MessageCircle, etichetta: 'Chat' },
  { percorso: '/profilo', Icona: User, etichetta: 'Profilo' }
];

export default function BarraNavigazione() {
  return (
    <nav className="md:hidden fixed z-50 w-[calc(100%-2rem)] left-4 border border-[var(--vetro-bordo)] rounded-[32px] shadow-[var(--ombra-modale)]"
         style={{
           bottom: 'calc(24px + var(--safe-bottom))',
           background: 'var(--vetro)',
           backdropFilter: 'blur(24px)',
           WebkitBackdropFilter: 'blur(24px)',
         }}>
      <div className="flex items-center justify-around h-[48px] px-2">
        {TABS.map((tab) => {
          const { Icona } = tab;
          return (
            <NavLink
              key={tab.percorso}
              to={tab.percorso}
              aria-label={tab.etichetta}
              className={({ isActive }) =>
                `flex items-center justify-center rounded-full transition-all duration-200 ${
                  tab.principale ? 'z-10' : 'p-2 min-w-[44px] min-h-[44px]'
                } ${
                  isActive && !tab.principale
                    ? 'text-[var(--accent)] bg-[var(--accent-dim)]'
                    : !tab.principale ? 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[rgba(255,255,255,0.05)]' : ''
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {tab.principale ? (
                    <div className={`w-[56px] h-[56px] rounded-full flex items-center justify-center shadow-xl transition-all ${
                      isActive
                        ? 'bg-[var(--accent)] shadow-[var(--ombra-accent)] text-white'
                        : 'bg-[var(--bg-terziario)] text-[var(--testo-primario)] border-[2px] border-[var(--bg-secondario)]'
                    }`}>
                      <Icona size={28} />
                    </div>
                  ) : (
                    <Icona size={24} className={isActive ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' : ''} />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
