// ============================================
// GymMaster — Layout Autenticato
// Wrapper con Sidebar (desktop) e BottomNav (mobile)
// ============================================

import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contesti/AuthContesto.jsx';
import { SpinnerPagina } from '../comuni/Spinner.jsx';
import Sidebar from './Sidebar.jsx';
import BarraNavigazione from './BarraNavigazione.jsx';
import NovitaStorie from '../specifici/NovitaStorie.jsx';
import RecuperoErrori from '../comuni/RecuperoErrori.jsx';

export default function LayoutAutenticato() {
  const { autenticato, caricamento, utente } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (caricamento) return <SpinnerPagina />;
  if (!autenticato) return <Navigate to="/login" replace />;
  if (utente && utente.profiloCompletato === false) return <Navigate to="/onboarding" replace />;

  // Modalità immersiva (schermo pieno, senza nav/padding): chat singola e allenamento live
  const isImmersivo = location.pathname.match(/^\/chat\/.+/) || location.pathname.match(/^\/allenamento\/.+/);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[var(--bg-primario)] flex flex-col md:flex-row">
      {/* Sidebar — solo desktop */}
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      {/* Spaziatore invisibile per mantenere il layout intatto. */}
      <div className={`hidden md:block ${isCollapsed ? 'w-24' : 'w-72'} shrink-0 pointer-events-none transition-all duration-300`}></div>

      {/* Contenuto principale */}
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
          {/* La chiave azzera l'errore quando si cambia pagina */}
          <RecuperoErrori key={location.pathname}>
            <Outlet />
          </RecuperoErrori>
        </div>
      </main>

      {/* Bottom Navigation — solo mobile (nascosta nella chat singola) */}
      {!isImmersivo && <BarraNavigazione />}

      {/* Novità in-app (bolla + storie) */}
      {!isImmersivo && <NovitaStorie />}
    </div>
  );
}
