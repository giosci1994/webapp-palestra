// ============================================
// GymMaster — App Router
// ============================================

import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contesti/AuthContesto.jsx';
import { SocketProvider } from './contesti/SocketContesto.jsx';
import LayoutAutenticato from './componenti/layout/LayoutAutenticato.jsx';
import { useRottaPersistente, ottieniUltimaRotta } from './hooks/useRottaPersistente.js';
import CookieBanner from './componenti/comuni/CookieBanner.jsx';
import { useAutoAggiornamento } from './hooks/useAutoAggiornamento.js';
import { RefreshCw } from 'lucide-react';
import { useLingua } from './hooks/useLingua.js';
import Testo from './i18n/Testo.jsx';
import { SpinnerPagina } from './componenti/comuni/Spinner.jsx';
import { caricaPagina } from './utils/caricaPagina.js';
import Login from './pagine/Login.jsx';
import Dashboard from './pagine/Dashboard.jsx';

// Login and Dashboard, the pages the app opens on, are in the main file; every
// other page is loaded when it is opened (utils/caricaPagina.js)

// Public pages
const Registrazione = caricaPagina(() => import('./pagine/Registrazione.jsx'));
const VerificaEmail = caricaPagina(() => import('./pagine/VerificaEmail.jsx'));
const PasswordDimenticata = caricaPagina(() => import('./pagine/PasswordDimenticata.jsx'));
const ReimpostaPassword = caricaPagina(() => import('./pagine/ReimpostaPassword.jsx'));
const Onboarding = caricaPagina(() => import('./pagine/Onboarding.jsx'));

// Legal pages
const PrivacyPolicy = caricaPagina(() => import('./pagine/legale/PrivacyPolicy.jsx'));
const CookiePolicy = caricaPagina(() => import('./pagine/legale/CookiePolicy.jsx'));
const TerminiServizio = caricaPagina(() => import('./pagine/legale/TerminiServizio.jsx'));

// Protected pages
const Profilo = caricaPagina(() => import('./pagine/Profilo.jsx'));
const SchedeAllenamento = caricaPagina(() => import('./pagine/SchedeAllenamento.jsx'));
const DettaglioScheda = caricaPagina(() => import('./pagine/DettaglioScheda.jsx'));
const WorkoutLive = caricaPagina(() => import('./pagine/WorkoutLive.jsx'));
const Chat = caricaPagina(() => import('./pagine/Chat.jsx'));
const Conversazione = caricaPagina(() => import('./pagine/Conversazione.jsx'));
const Assistente = caricaPagina(() => import('./pagine/Assistente.jsx'));
const Statistiche = caricaPagina(() => import('./pagine/Statistiche.jsx'));
const AdminUtenti = caricaPagina(() => import('./pagine/AdminUtenti.jsx'));
const AdminPalestre = caricaPagina(() => import('./pagine/AdminPalestre.jsx'));
const AdminEsercizi = caricaPagina(() => import('./pagine/AdminEsercizi.jsx'));
const AdminNovita = caricaPagina(() => import('./pagine/AdminNovita.jsx'));
const Gamification = caricaPagina(() => import('./pagine/Gamification.jsx'));
const Allenamento = caricaPagina(() => import('./pagine/Allenamento.jsx'));
const StoricoAllenamenti = caricaPagina(() => import('./pagine/StoricoAllenamenti.jsx'));
const CatalogoEsercizi = caricaPagina(() => import('./pagine/CatalogoEsercizi.jsx'));
const DashboardPT = caricaPagina(() => import('./pagine/DashboardPT.jsx'));
const TrainerProfilo = caricaPagina(() => import('./pagine/TrainerProfilo.jsx'));
const TrovaPT = caricaPagina(() => import('./pagine/TrovaPT.jsx'));
const Composizione = caricaPagina(() => import('./pagine/Composizione.jsx'));
const Pianificazione = caricaPagina(() => import('./pagine/Pianificazione.jsx'));

// --- Smart redirect: back to the last visited route ---
function RedirectIniziale() {
  const ultimaRotta = ottieniUltimaRotta();
  return <Navigate to={ultimaRotta || '/dashboard'} replace />;
}

// --- Tracker: saves the current route in sessionStorage ---
function TrackerRotta() {
  useRottaPersistente();
  return null;
}

// --- Update available banner ---
function BannerAggiornamento() {
  const { aggiornamentoDisponibile, nuovaVersione, forzaAggiornamento } = useAutoAggiornamento();
  const { t } = useLingua();

  if (!aggiornamentoDisponibile) return null;

  return (
    <div className="aggiornamento-banner">
      <div className="aggiornamento-banner-contenuto">
        <RefreshCw className="aggiornamento-banner-icona" size={18} />
        <span className="aggiornamento-banner-testo">
          <Testo t="app.nuovaVersione" valori={{ versione: nuovaVersione }} componenti={{ b: <strong /> }} />
        </span>
        <button onClick={forzaAggiornamento} className="aggiornamento-banner-btn">
          {t('app.aggiornaOra')}
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
          {/* The pages inside the layout wait under the sidebar (LayoutAutenticato); here the public ones */}
          <Suspense fallback={<SpinnerPagina />}>
          <Routes>
            {/* Public pages */}
            <Route path="/login" element={<Login />} />
            <Route path="/registrazione" element={<Registrazione />} />
            <Route path="/verifica-email" element={<VerificaEmail />} />
            <Route path="/password-dimenticata" element={<PasswordDimenticata />} />
            <Route path="/reimposta-password" element={<ReimpostaPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Legal pages (public) */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/termini" element={<TerminiServizio />} />

            {/* Protected pages */}
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
              {/* Live workout: inside the layout (auth gating) but made immersive by the layout */}
              <Route path="/allenamento/:id" element={<WorkoutLive />} />
            </Route>

            <Route path="/" element={<RedirectIniziale />} />
            <Route path="*" element={<RedirectIniziale />} />
          </Routes>
          </Suspense>

          {/* Global cookie banner */}
          <CookieBanner />

          {/* Automatic update banner */}
          <BannerAggiornamento />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
