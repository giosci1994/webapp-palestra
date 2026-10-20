// ============================================
// GymMaster — Authenticated layout
// Wrapper with Sidebar (desktop) and BottomNav (mobile)
// ============================================

import { useState, useEffect, Suspense } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contesti/AuthContesto.jsx';
import Spinner, { SpinnerPagina } from '../comuni/Spinner.jsx';
import Sidebar from './Sidebar.jsx';
import BarraNavigazione from './BarraNavigazione.jsx';
import NovitaStorie from '../specifici/NovitaStorie.jsx';
import PromemoriaAllenamento from '../specifici/PromemoriaAllenamento.jsx';
import RecuperoErrori from '../comuni/RecuperoErrori.jsx';
import { useInvioCoda } from '../../hooks/useCodaSerie.js';

export default function LayoutAutenticato() {
  const { autenticato, caricamento, utente } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  // Sets recorded offline are sent as soon as possible, from any page
  useInvioCoda(utente?.id);
  // Until the "what's new" stories have decided whether to open (or while they
  // are open), the workout reminder waits: two windows at once can't be read
  const [storieOccupate, setStorieOccupate] = useState(true);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (caricamento) return <SpinnerPagina />;
  if (!autenticato) return <Navigate to="/login" replace />;
  if (utente && utente.profiloCompletato === false) return <Navigate to="/onboarding" replace />;

  // Immersive mode (full screen, no nav/padding): single chat and live workout
  const isImmersivo = location.pathname.match(/^\/chat\/.+/) || location.pathname.match(/^\/allenamento\/.+/);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[var(--bg-primario)] flex flex-col md:flex-row">
      {/* Sidebar — desktop only */}
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      {/* Invisible spacer to keep the layout intact. */}
      <div className={`hidden md:block ${isCollapsed ? 'w-24' : 'w-72'} shrink-0 pointer-events-none transition-all duration-300`}></div>

      {/* Main content */}
      <main className="flex-1 min-w-0 transition-all flex justify-center w-full" style={{ paddingBottom: isImmersivo ? '0px' : 'calc(90px + var(--safe-bottom))' }}>
        <div 
          className="w-full max-w-5xl relative flex-1 flex flex-col"
          style={{ 
            paddingTop: isImmersivo ? '0px' : 'calc(24px + var(--safe-top))', 
            paddingBottom: isImmersivo ? '0px' : 'calc(24px + var(--safe-bottom))',
            paddingLeft: isImmersivo ? '0px' : 'calc(clamp(16px, 4vw, 32px) + var(--safe-left))',
            paddingRight: isImmersivo ? '0px' : 'calc(clamp(16px, 4vw, 32px) + var(--safe-right))',
            boxSizing: 'border-box'
          }}
        >
          {/* The key resets the error when the page changes */}
          <RecuperoErrori key={location.pathname}>
            {/* Pages are loaded when they are opened: meanwhile the sidebar stays */}
            <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
              <Outlet />
            </Suspense>
          </RecuperoErrori>
        </div>
      </main>

      {/* Bottom Navigation — mobile only (hidden on full-screen pages: a chat, the workout in progress) */}
      {!isImmersivo && <BarraNavigazione />}

      {/* In-app "what's new" (bubble + stories) */}
      {!isImmersivo && <NovitaStorie onOccupato={setStorieOccupate} />}

      {/* When the app opens: the workout scheduled for today */}
      <PromemoriaAllenamento inAttesa={isImmersivo || storieOccupate} />
    </div>
  );
}
