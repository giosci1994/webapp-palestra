// ============================================
// GymMaster — App Router
// ============================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contesti/AuthContesto.jsx';
import { SocketProvider } from './contesti/SocketContesto.jsx';
import LayoutAutenticato from './componenti/layout/LayoutAutenticato.jsx';
import { useRottaPersistente, ottieniUltimaRotta } from './hooks/useRottaPersistente.js';
import CookieBanner from './componenti/comuni/CookieBanner.jsx';
import { useAutoAggiornamento } from './hooks/useAutoAggiornamento.js';
import { RefreshCw } from 'lucide-react';

// Pagine pubbliche
import Login from './pagine/Login.jsx';
import Registrazione from './pagine/Registrazione.jsx';
import VerificaEmail from './pagine/VerificaEmail.jsx';
import PasswordDimenticata from './pagine/PasswordDimenticata.jsx';
import ReimpostaPassword from './pagine/ReimpostaPassword.jsx';
import Onboarding from './pagine/Onboarding.jsx';

// Pagine legali
import PrivacyPolicy from './pagine/legale/PrivacyPolicy.jsx';
import CookiePolicy from './pagine/legale/CookiePolicy.jsx';
import TerminiServizio from './pagine/legale/TerminiServizio.jsx';

// Pagine protette
import Dashboard from './pagine/Dashboard.jsx';
import Profilo from './pagine/Profilo.jsx';
import SchedeAllenamento from './pagine/SchedeAllenamento.jsx';
import DettaglioScheda from './pagine/DettaglioScheda.jsx';
import WorkoutLive from './pagine/WorkoutLive.jsx';
import Chat from './pagine/Chat.jsx';
import Conversazione from './pagine/Conversazione.jsx';
import Assistente from './pagine/Assistente.jsx';
import Statistiche from './pagine/Statistiche.jsx';
import AdminUtenti from './pagine/AdminUtenti.jsx';
import AdminPalestre from './pagine/AdminPalestre.jsx';
import AdminEsercizi from './pagine/AdminEsercizi.jsx';
import AdminNovita from './pagine/AdminNovita.jsx';
import Gamification from './pagine/Gamification.jsx';
import Allenamento from './pagine/Allenamento.jsx';
import StoricoAllenamenti from './pagine/StoricoAllenamenti.jsx';
import CatalogoEsercizi from './pagine/CatalogoEsercizi.jsx';
import DashboardPT from './pagine/DashboardPT.jsx';
import TrainerProfilo from './pagine/TrainerProfilo.jsx';
import TrovaPT from './pagine/TrovaPT.jsx';
import Composizione from './pagine/Composizione.jsx';
import Pianificazione from './pagine/Pianificazione.jsx';

// --- Redirect intelligente: torna all'ultima rotta visitata ---
function RedirectIniziale() {
  const ultimaRotta = ottieniUltimaRotta();
  return <Navigate to={ultimaRotta || '/dashboard'} replace />;
}

// --- Tracker: salva la rotta corrente in sessionStorage ---
function TrackerRotta() {
  useRottaPersistente();
  return null;
}

// --- Banner aggiornamento disponibile ---
function BannerAggiornamento() {
  const { aggiornamentoDisponibile, nuovaVersione, versioneCorrente, forzaAggiornamento } = useAutoAggiornamento();

  if (!aggiornamentoDisponibile) return null;

  return (
    <div className="aggiornamento-banner">
      <div className="aggiornamento-banner-contenuto">
        <RefreshCw className="aggiornamento-banner-icona" size={18} />
        <span className="aggiornamento-banner-testo">
          Nuova versione <strong>{nuovaVersione}</strong> disponibile
        </span>
        <button onClick={forzaAggiornamento} className="aggiornamento-banner-btn">
          Aggiorna ora
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TrackerRotta />
      <AuthProvider>
        <SocketProvider>
          <Routes>
            {/* Pagine pubbliche */}
            <Route path="/login" element={<Login />} />
            <Route path="/registrazione" element={<Registrazione />} />
            <Route path="/verifica-email" element={<VerificaEmail />} />
            <Route path="/password-dimenticata" element={<PasswordDimenticata />} />
            <Route path="/reimposta-password" element={<ReimpostaPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Pagine legali (pubbliche) */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/termini" element={<TerminiServizio />} />

            {/* Pagine protette */}
            <Route element={<LayoutAutenticato />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/schede" element={<SchedeAllenamento />} />
              <Route path="/schede/:id" element={<DettaglioScheda />} />
              <Route path="/statistiche" element={<Statistiche />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:id" element={<Conversazione />} />
              <Route path="/assistente" element={<Assistente />} />
              <Route path="/profilo" element={<Profilo />} />
              <Route path="/gamification" element={<Gamification />} />
              <Route path="/admin/utenti" element={<AdminUtenti />} />
              <Route path="/admin/palestre" element={<AdminPalestre />} />
              <Route path="/admin/esercizi" element={<AdminEsercizi />} />
              <Route path="/admin/novita" element={<AdminNovita />} />
              <Route path="/allenamento" element={<Allenamento />} />
              <Route path="/storico" element={<StoricoAllenamenti />} />
              <Route path="/catalogo" element={<CatalogoEsercizi />} />
              <Route path="/pt" element={<DashboardPT />} />
              <Route path="/trainer/:id" element={<TrainerProfilo />} />
              <Route path="/trova-pt" element={<TrovaPT />} />
              <Route path="/composizione" element={<Composizione />} />
              <Route path="/pianificazione" element={<Pianificazione />} />
              {/* Allenamento live: dentro il layout (gating auth) ma reso immersivo dal layout */}
              <Route path="/allenamento/:id" element={<WorkoutLive />} />
            </Route>

            <Route path="/" element={<RedirectIniziale />} />
            <Route path="*" element={<RedirectIniziale />} />
          </Routes>

          {/* Cookie Banner globale */}
          <CookieBanner />

          {/* Banner aggiornamento automatico */}
          <BannerAggiornamento />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
