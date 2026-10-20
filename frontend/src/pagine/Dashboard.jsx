// ============================================
// GymMaster — Dashboard
// Main hub: Activity and Statistics
// ============================================

import { useState, useEffect, useCallback, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { formattaDataRelativa, aStringaData, lunediDi } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, ChevronRight, ClipboardList, History, 
  Trophy, Activity, Info, Edit2, Check, X, Bot, CalendarDays, Trash2, Library,
  Megaphone, Dumbbell, Users, Clock, BarChart3, Calendar, PlayCircle, Building,
  CalendarHeart, FileText, CheckCircle, CalendarClock
} from 'lucide-react';
import CaroselloAzioni from '../componenti/specifici/CaroselloAzioni.jsx';
import MiglioriOrari from '../componenti/specifici/MiglioriOrari.jsx';
import Calendario from '../componenti/comuni/Calendario.jsx';
import SezioneCollassabile from '../componenti/comuni/SezioneCollassabile.jsx';
import { useTelefono } from '../hooks/useMediaQuery.js';
import { useLingua } from '../hooks/useLingua.js';
import { localeCorrente } from '../i18n/index.js';
import { caricaPagina } from '../utils/caricaPagina.js';
import Spinner from '../componenti/comuni/Spinner.jsx';

// The Statistics tab (with all its charts) is loaded only when it is opened
const Statistiche = caricaPagina(() => import('./Statistiche.jsx'));

// The tab ids are compared in the code; what is shown for each is a translation key
const ETICHETTE_TAB = {
  'attività': 'dashboard.tab.attivita',
  'statistiche': 'dashboard.tab.statistiche',
  'il mio PT': 'dashboard.tab.ilMioPt'
};

export default function Dashboard() {
  const { t } = useLingua();
  const { utente, isAdmin } = useAuth();
  const naviga = useNavigate();
  
  const [tabAttivo, setTabAttivo] = useState('attività');
  const [sessioniRecenti, setSessioniRecenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  
  // Banner state
  const [banner, setBanner] = useState({ visibile: false, testo: '' });
  const [editBanner, setEditBanner] = useState(false);
  const [tempBannerTesto, setTempBannerTesto] = useState('');
  
  // Suggestion on which plan to do, computed by the server from rested muscles
  const [consiglio, setConsiglio] = useState(null);
  const [avviando, setAvviando] = useState(false);

  // Personal trainer info for a member
  const [mioPTDash, setMioPTDash] = useState(null);
  const [senzaPT, setSenzaPT] = useState(false);
  const [ptDashboard, setPtDashboard] = useState(null);

  // Calendar: besides the completed workouts it shows the scheduled ones,
  // which used to not appear at all.
  const [dataCalendario, setDataCalendario] = useState(new Date());
  const [pianificati, setPianificati] = useState([]);
  const telefonoDash = useTelefono();
  const [modoCalendarioScelto, setModoCalendarioScelto] = useState(null);
  const modoCalendario = modoCalendarioScelto ?? (telefonoDash ? 'settimana' : 'mese');

  // Unread messages: the messages slide appears only if there are some
  const [messaggiNonLetti, setMessaggiNonLetti] = useState(0);

  // Gym crowd level
  const [affluenza, setAffluenza] = useState(null);
  const [affluenzaCaricamento, setAffluenzaCaricamento] = useState(false);

  // Reload when the period shown changes: the calendar must stay up to date
  // even when scrolling back and forth between months.
  useEffect(() => {
    let da, a;
    if (modoCalendario === 'mese') {
      da = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth(), 1);
      a = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() + 1, 0);
    } else {
      da = lunediDi(dataCalendario);
      a = new Date(da); a.setDate(a.getDate() + 6);
    }
    let annullato = false;
    api.get(`/pianificazione?da=${aStringaData(da)}&a=${aStringaData(a)}`)
      .then(r => { if (!annullato) setPianificati(r.dati || []); })
      .catch(() => { if (!annullato) setPianificati([]); });
    return () => { annullato = true; };
  }, [dataCalendario, modoCalendario]);

  const palestraId = utente?.palestraId || utente?.palestra?.id;

  // Load the gym crowd level data
  const caricaAffluenza = useCallback((idPalestra) => {
    if (!idPalestra) return;
    setAffluenzaCaricamento(true);
    api.get(`/palestre/${idPalestra}/affluenza`)
      .then(res => { if (res.dati) setAffluenza(res.dati); })
      .catch(() => setAffluenza(null))
      .finally(() => setAffluenzaCaricamento(false));
  }, []);

  // On first load with the spinner; once an activity is deleted, the data
  // updates in place
  const caricaDati = useCallback(() => Promise.all([
    api.get('/sessioni?limite=30'),
    api.get('/banner').catch(() => ({ dati: { visibile: false, testo: '' } })),
    api.get('/statistiche/consiglio').catch(() => ({ dati: null }))
  ])
    .then(([resSess, resBanner, resConsiglio]) => {
      // Unread message count (non-blocking)
      api.get('/chat/non-letti')
        .then(r => setMessaggiNonLetti(r.dati?.totale || 0))
        .catch(() => setMessaggiNonLetti(0));

      // Load the personal trainer info (non-blocking)
      api.get('/utenti/mio-pt').then(r => {
        if (r.dati?.stato === 'ATTIVA') setMioPTDash(r.dati);
        setSenzaPT(!r.dati); // no personal trainer relationship (neither active nor pending)
      }).catch(() => {});

      // Load the crowd level if the user has a gym
      caricaAffluenza(palestraId);

      setSessioniRecenti(resSess.dati || []);
      if (resBanner.dati) {
        setBanner(resBanner.dati);
        setTempBannerTesto(resBanner.dati.testo);
      }

      setConsiglio(resConsiglio.dati || null);
    })
    .catch(err => console.error('Error loading the dashboard:', err))
    .finally(() => setCaricamento(false)), [palestraId, caricaAffluenza]);

  useEffect(() => {
    caricaDati();
  }, [caricaDati]);

  const caricaDatiPT = async () => {
    try {
      const res = await api.get('/utenti/mio-pt/dashboard');
      if (res.dati) setPtDashboard(res.dati);
    } catch (err) {
      console.error('Error loading the personal trainer data:', err);
    }
  };

  // Poll the crowd level every 5 minutes
  useEffect(() => {
    if (!palestraId) return;
    const intervallo = setInterval(() => caricaAffluenza(palestraId), 5 * 60 * 1000);
    return () => clearInterval(intervallo);
  }, [palestraId, caricaAffluenza]);

  const salvaBanner = async (visibile) => {
    try {
      const nuovoBanner = { visibile, testo: tempBannerTesto };
      await api.put('/admin/banner', nuovoBanner);
      setBanner(nuovoBanner);
      setEditBanner(false);
    } catch {
      alert(t('dashboard.banner.erroreSalvataggio'));
    }
  };

  const avviaAllenamento = async (schedaId) => {
    try {
      setAvviando(true);
      const risposta = await api.post('/sessioni', { schedaId: parseInt(schedaId) });
      naviga(`/allenamento/${risposta.dati.id}`, { state: { sessione: risposta.dati } });
    } catch (err) {
      alert(err.message);
      setAvviando(false);
    }
  };

  const eliminaSessione = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('dashboard.confermaEliminaAttivita'))) return;
    try {
      await api.delete(`/sessioni/${id}`);
      setSessioniRecenti(prev => prev.filter(s => s.id !== id));
      // We reload the data to update the calendar and the statistics
      caricaDati();
    } catch (err) {
      alert(err.response?.data?.errore || t('dashboard.erroreEliminazione'));
    }
  };

  // Calendar dots: green for completed workouts, violet for scheduled ones
  const marcatoriCalendario = (() => {
    const per = {};
    const aggiungi = (giorno, colore) => {
      if (!per[giorno]) per[giorno] = [];
      if (!per[giorno].some(x => x.colore === colore)) per[giorno].push({ colore });
    };
    // Completed workouts (both planned and unplanned)
    const giorniCompletati = new Set();
    for (const s of sessioniRecenti) giorniCompletati.add(s.dataInizio.split('T')[0]);
    for (const p of pianificati) {
      if (p.stato === 'COMPLETATO') giorniCompletati.add(p.data);
    }
    for (const giorno of giorniCompletati) aggiungi(giorno, 'var(--successo, #22c55e)');

    // Scheduled workouts (in progress, skipped)
    for (const p of pianificati) {
      if (p.stato === 'SALTATO') aggiungi(p.data, 'var(--testo-terziario)');
      else if (p.stato === 'IN_PROGRAMMA') aggiungi(p.data, 'var(--accent)');
    }
    return per;
  })();


  const ora = new Date().getHours();
  const saluto = ora < 12 ? t('dashboard.saluto.mattina') : ora < 18 ? t('dashboard.saluto.pomeriggio') : t('dashboard.saluto.sera');

  if (caricamento) {
    return (
      <div className="py-4 md:py-8 pb-12">
        {/* Header */}
        <div className="mb-8 md:mb-12">
          <div className="h-10 w-56 rounded-xl bg-[var(--bg-terziario)] animate-pulse" />
        </div>
        {/* Tabs */}
        <div className="h-12 w-full max-w-xs rounded-[32px] bg-[var(--bg-terziario)] animate-pulse mb-8" />
        {/* Card */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
          <div className="flex flex-col gap-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card p-card-inner">
                <div className="h-5 w-40 rounded bg-[var(--bg-terziario)] animate-pulse mb-4" />
                <div className="h-4 w-full rounded bg-[var(--bg-terziario)] animate-pulse mb-2" />
                <div className="h-4 w-2/3 rounded bg-[var(--bg-terziario)] animate-pulse" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-8">
            {[0, 1].map((i) => (
              <div key={i} className="glass-card p-card-inner h-48 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Contextual prompts of the dashboard, gathered in a single sliding banner.
  // Each entry joins the list only when it really makes sense to show it: if
  // none is left, CaroselloAzioni renders nothing.
  const slideAzioni = [
    ...(senzaPT && !isAdmin && utente?.ruolo !== 'PERSONAL_TRAINER' ? [{
      id: 'trova-pt',
      Icona: Dumbbell,
      titolo: t('dashboard.slide.trovaPt.titolo'),
      sottotitolo: t('dashboard.slide.trovaPt.sottotitolo'),
      etichetta: t('dashboard.slide.trovaPt.etichetta'),
      a: '/trova-pt'
    }] : []),
    ...(messaggiNonLetti > 0 ? [{
      id: 'messaggi',
      Icona: MessageCircle,
      titolo: t('dashboard.slide.messaggi.titolo', { count: messaggiNonLetti }),
      sottotitolo: t('dashboard.slide.messaggi.sottotitolo'),
      etichetta: t('dashboard.slide.messaggi.etichetta'),
      a: '/chat'
    }] : []),
    // "Inizia scheda" (start plan) goes through "Allenati ora", with the plan
    // already open: from there it starts with one tap, and an accidental tap on
    // the banner does not create an empty workout
    ...(consiglio ? [{
      id: 'consiglio-ai',
      Icona: consiglio.motivo === 'oggi' ? CalendarClock : Bot,
      titolo: consiglio.scheda?.titolo || t('dashboard.slide.consiglio.oggiRecupero'),
      sottotitolo: consiglio.testo,
      etichetta: consiglio.scheda ? t('dashboard.slide.consiglio.iniziaScheda') : t('dashboard.slide.consiglio.vediRecupero'),
      a: consiglio.scheda ? `/allenamento?scheda=${consiglio.scheda.id}` : '/statistiche'
    }] : [])
  ];


  return (
    <div className="py-4 md:py-8 pb-12">
      {/* Greeting header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 md:mb-20 relative">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-[var(--accent)] rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2 relative z-10">
          {saluto} <br className="md:hidden" /><span className="testo-gradient">{utente?.nome?.split(' ')[0]}</span>
        </h1>
      </motion.div>

      {/* Announcements banner */}
      <AnimatePresence>
        {(banner.visibile || isAdmin) && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 md:mb-20"
          >
            <div className={`border rounded-[var(--raggio-lg)] p-card-inner flex flex-col relative overflow-hidden transition-colors ${!banner.visibile ? 'bg-transparent border-dashed border-[var(--testo-terziario)] opacity-50' : 'bg-[var(--accent-dim)] border-[var(--accent-glow)]'}`}>
              
              {banner.visibile && (
                <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--accent)] opacity-20 rounded-full blur-3xl pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
              )}
              
              <div className="flex items-start justify-between gap-4 z-10">
                <div className="flex items-center gap-6 w-full">
                  <Info className={banner.visibile ? 'text-[var(--accent)]' : 'text-[var(--testo-terziario)]'} size={40} />
                  
                  {editBanner ? (
                    <input 
                      type="text" 
                      value={tempBannerTesto}
                      onChange={(e) => setTempBannerTesto(e.target.value)}
                      className="flex-1 bg-black/20 border border-[var(--bordo-light)] rounded px-4 py-3 text-base md:text-lg outline-none focus:border-[var(--accent)]"
                      placeholder={t('dashboard.banner.placeholder')}
                      autoFocus
                    />
                  ) : (
                    <span className={`text-base md:text-xl font-medium flex-1 ${banner.visibile ? 'text-[var(--testo-primario)]' : 'text-[var(--testo-terziario)]'}`}>
                      {banner.testo || (isAdmin ? t('dashboard.banner.vuoto') : "")}
                      {!banner.visibile && isAdmin && ` ${t('dashboard.banner.nascosto')}`}
                    </span>
                  )}
                </div>
                
                {/* Admin controls */}
                {isAdmin && (
                  <div className="flex gap-2 shrink-0">
                    {editBanner ? (
                      <>
                        <button onClick={() => salvaBanner(true)} className="p-1.5 bg-[var(--successo-dim)] text-[var(--successo)] rounded hover:bg-[var(--successo)] hover:text-white transition-colors" title={t('dashboard.banner.salvaMostra')}>
                          <Check size={16} />
                        </button>
                        <button onClick={() => salvaBanner(false)} className="p-1.5 bg-[var(--pericolo-dim)] text-[var(--pericolo)] rounded hover:bg-[var(--pericolo)] hover:text-white transition-colors" title={t('dashboard.banner.salvaNascondi')}>
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditBanner(true)} className="p-1.5 bg-[var(--bg-terziario)] text-[var(--testo-secondario)] rounded hover:text-[var(--testo-primario)] transition-colors">
                        <Edit2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contextual prompts gathered in a single sliding banner */}
      <CaroselloAzioni slide={slideAzioni} />

      {/* Tabs */}
      <div style={{ paddingTop: '15px', paddingBottom: '25px', width: '100%' }}>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" style={{ background: 'var(--vetro)', border: '1px solid var(--vetro-bordo)', padding: '10px', borderRadius: '32px', boxShadow: 'var(--ombra-card)' }}>
          {['attività', 'statistiche', ...(mioPTDash ? ['il mio PT'] : [])].map((tab) => {
            let IconaTab = tab === 'attività' ? Activity : tab === 'statistiche' ? BarChart3 : Dumbbell;
            return (
              <button
                key={tab}
                onClick={() => {
                  setTabAttivo(tab);
                  if (tab === 'il mio PT' && !ptDashboard) caricaDatiPT();
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-6 rounded-[14px] text-sm font-bold capitalize transition-all duration-300 whitespace-nowrap shrink-0 relative ${
                  tabAttivo === tab ? 'text-[var(--testo-primario)]' : 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[rgba(255,255,255,0.05)]'
                }`}
              >
                {/* Animated active background */}
                {tabAttivo === tab && (
                  <motion.div layoutId="dashboardTabBg" className="absolute inset-0 bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-[14px] shadow-sm z-0" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                )}
                
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <IconaTab size={18} className={`shrink-0 transition-transform duration-300 ${tabAttivo === tab ? 'text-[var(--accent)]' : ''}`} />
                  {t(ETICHETTE_TAB[tab])}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs content */}
      <AnimatePresence mode="wait">
        {tabAttivo === 'attività' && (
          <motion.div 
            key="attività"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8"
          >
            {/* Main column */}
            <div className="flex flex-col gap-8">
              
              {/* Train and manage plans */}
              <SezioneCollassabile chiave="allenati" titolo={t('dashboard.allenati.titolo')} Icona={Activity}>
                <div className="flex flex-col">
                  {[
                    { etichetta: t('dashboard.allenati.gestioneSchede'), icona: ClipboardList, link: '/schede' },
                    // The only way to the calendar from a phone: the mobile navigation
                    // bar has five fixed entries, and the sidebar with the
                    // "Pianificazione" entry only appears from md up.
                    { etichetta: t('dashboard.allenati.pianificaAllenamenti'), icona: CalendarClock, link: '/pianificazione' },
                    { etichetta: t('dashboard.allenati.catalogoEsercizi'), icona: Library, link: '/catalogo' },
                    { etichetta: t('dashboard.allenati.storicoAllenamenti'), icona: History, link: '/storico' },
                    { etichetta: t('dashboard.allenati.classifiche'), icona: Trophy, link: '/gamification' }
                  ].map((item, i, arr) => (
                    <Link key={i} to={item.link} className={`flex items-center justify-between px-card-inner border-b border-[var(--bordo-light)] last:border-0 hover:bg-[var(--bg-terziario)] transition-colors group py-5 ${i === arr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <div className="flex items-center gap-4">
                        <item.icona className="text-[var(--testo-secondario)] group-hover:text-[var(--testo-primario)] transition-colors" size={24} />
                        <span className="font-medium text-base text-[var(--testo-secondario)] group-hover:text-[var(--testo-primario)] transition-colors">{item.etichetta}</span>
                      </div>
                      <ChevronRight className="text-[var(--testo-terziario)] group-hover:text-[var(--testo-primario)] transition-colors" size={24} />
                    </Link>
                  ))}
                </div>
              </SezioneCollassabile>

              {/* Latest activity (Recent Workouts) */}
              <SezioneCollassabile chiave="ultime-attivita" titolo={t('dashboard.ultimeAttivita.titolo')} Icona={History}>
                
                <div className="text-center text-[var(--testo-terziario)] flex items-center justify-center">
                  {sessioniRecenti.slice(0,3).length > 0 ? (
                    <ul className="w-full text-left">
                      {sessioniRecenti.slice(0,3).map((sessione, sIdx, sArr) => (
                        <li key={sessione.id} className={`px-card-inner border-b border-[var(--bordo-light)] last:border-0 flex justify-between items-center group py-5 ${sIdx === sArr.length - 1 ? 'card-list-ultimo' : ''}`}>
                          <div>
                            <p className="text-[var(--testo-primario)] font-medium text-base">{sessione.scheda?.titolo || t('dashboard.ultimeAttivita.sessioneLibera')}</p>
                            <p className="text-xs text-[var(--testo-terziario)] mt-1">{formattaDataRelativa(sessione.dataInizio)}</p>
                          </div>
                          <button 
                            onClick={(e) => eliminaSessione(sessione.id, e)}
                            className="p-2 text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] rounded-full transition-colors"
                            title={t('dashboard.ultimeAttivita.elimina')}
                          >
                            <Trash2 size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="py-10 px-card-inner flex flex-col items-center text-center gap-3 w-full">
                      <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
                        <Dumbbell size={26} className="text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--testo-primario)]">{t('dashboard.ultimeAttivita.vuotoTitolo')}</p>
                        <p className="text-sm text-[var(--testo-terziario)] mt-1">{t('dashboard.ultimeAttivita.vuotoTesto')}</p>
                      </div>
                      <Link to="/schede" style={{ color: '#fff' }} className="mt-1 w-full sm:w-auto text-center px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold transition-colors shadow-[var(--ombra-accent)]">
                        {t('dashboard.ultimeAttivita.vaiAlleSchede')}
                      </Link>
                    </div>
                  )}
                </div>
              </SezioneCollassabile>

            </div>

            {/* Side column */}
            <div className="flex flex-col gap-8">
              
              {/* Best times to train (from the crowd level readings) */}
              <MiglioriOrari palestraId={utente?.palestraId || utente?.palestra?.id} />

              {/* Calendar: completed and scheduled workouts */}
              <SezioneCollassabile chiave="calendario" titolo={t('dashboard.calendario.titolo')} Icona={CalendarDays}>
                <div className="p-card-inner">
                  <Calendario
                    modo={modoCalendario}
                    ancora={dataCalendario}
                    onCambiaAncora={setDataCalendario}
                    onCambiaModo={setModoCalendarioScelto}
                    marcatori={marcatoriCalendario}
                  />

                  <div className="flex items-center gap-3 mt-5 pt-4 border-t border-[var(--bordo-light)] text-xs text-[var(--testo-terziario)] flex-wrap">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--successo, #22c55e)' }} /> {t('dashboard.calendario.completato')}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} /> {t('dashboard.calendario.inProgramma')}</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--bordo-light)] flex items-center justify-between gap-3 text-sm">
                    <Link to="/pianificazione" className="font-semibold text-[var(--accent)] hover:underline">{t('dashboard.calendario.pianifica')}</Link>
                    <Link to="/storico" className="font-semibold text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors">{t('dashboard.calendario.storico')}</Link>
                  </div>
                </div>
              </SezioneCollassabile>

              {/* Gym crowd level widget */}
              {(utente?.palestraId || utente?.palestra?.id) && (
                <div className="glass-card flex flex-col overflow-hidden">
                  <div className="p-card-inner pb-4 flex items-center gap-3">
                    <Building size={22} className="text-[var(--accent)]" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg">{t('dashboard.affluenza.titolo')}</h3>
                      <p className="text-[10px] text-[var(--testo-terziario)] truncate">
                        {utente?.palestra?.nomeCatena || t('dashboard.affluenza.latuaPalestra')}
                      </p>
                    </div>
                    {affluenza?.livelloColore && affluenza.livelloColore !== 'grigio' && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        affluenza.livelloColore === 'verde' ? 'bg-green-500/20 text-green-400' :
                        affluenza.livelloColore === 'giallo' ? 'bg-amber-500/20 text-amber-400' :
                        affluenza.livelloColore === 'rosso' ? 'bg-red-500/20 text-red-400' :
                        'bg-[var(--bg-terziario)] text-[var(--testo-terziario)]'
                      }`}>
                        {affluenza.livelloTesto}
                      </span>
                    )}
                  </div>
                  <div className="px-6 pb-6">
                    {affluenzaCaricamento ? (
                      <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
                      </div>
                    ) : affluenza?.graficoGiornata?.length > 0 ? (
                      <>
                        {/* Crowd level chart — "popular times" style */}
                        {(() => {
                          const ore = Array.from({ length: 24 }, (_, ora) => {
                            const dato = affluenza.graficoGiornata.find(d => d.ora === ora);
                            return { ora, livello: dato?.live ?? dato?.livello ?? 0, isOra: ora === affluenza.oraCorrente };
                          });
                          const maxLivello = Math.max(1, ...ore.map(o => o.livello));
                          const coloreBarra = (liv) => liv <= 0 ? null : liv <= 30 ? ['#22c55e', '#15803d'] : liv <= 60 ? ['#f59e0b', '#b45309'] : ['#ef4444', '#b91c1c'];
                          return (
                            <div className="mb-2">
                              {/* current hour marker */}
                              <div className="flex gap-[3px] h-3 mb-1">
                                {ore.map(({ ora, isOra }) => (
                                  <div key={ora} className="flex-1 flex items-end justify-center">
                                    {isOra && <span className="block w-0 h-0" style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid var(--testo-primario)' }} />}
                                  </div>
                                ))}
                              </div>
                              {/* bars with a background track */}
                              <div className="flex items-end gap-[3px] h-24">
                                {ore.map(({ ora, livello, isOra }) => {
                                  const c = coloreBarra(livello);
                                  const pct = livello > 0 ? Math.max(7, Math.round((livello / maxLivello) * 100)) : 3;
                                  return (
                                    <div key={ora} title={`${ora}:00 — ${livello}%`}
                                         className="flex-1 h-full flex items-end rounded-[5px] overflow-hidden"
                                         style={{ background: 'rgba(255,255,255,0.1)', boxShadow: isOra ? '0 0 0 1.5px rgba(255,255,255,0.6)' : 'none' }}>
                                      <motion.div
                                        className="w-full rounded-[5px]"
                                        initial={{ scaleY: 0 }}
                                        animate={{ scaleY: 1 }}
                                        transition={{ duration: 0.5, delay: ora * 0.012, ease: [0.22, 1, 0.36, 1] }}
                                        style={{ height: `${pct}%`, transformOrigin: 'bottom', background: c ? c[0] : 'transparent' }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              {/* hours axis */}
                              <div className="flex gap-[3px] mt-2 text-[10px] text-[var(--testo-terziario)]">
                                {ore.map(({ ora }) => (
                                  <div key={ora} className="flex-1 text-center">{ora % 6 === 0 ? String(ora).padStart(2, '0') : ''}</div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Live description — prominent */}
                        {affluenza.liveDescrizione && (
                          <div className={`mt-3 p-3 rounded-xl flex items-center gap-3 border ${
                            affluenza.livelloColore === 'verde' ? 'bg-green-500/10 border-green-500/30' :
                            affluenza.livelloColore === 'giallo' ? 'bg-amber-500/10 border-amber-500/30' :
                            affluenza.livelloColore === 'rosso' ? 'bg-red-500/10 border-red-500/30' :
                            'bg-[var(--bg-terziario)] border-[var(--bordo-light)]'
                          }`}>
                            <span className={`w-3 h-3 rounded-full shrink-0 animate-pulse ${
                              affluenza.livelloColore === 'verde' ? 'bg-green-500' :
                              affluenza.livelloColore === 'giallo' ? 'bg-amber-500' :
                              affluenza.livelloColore === 'rosso' ? 'bg-red-500' :
                              'bg-gray-400'
                            }`} />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--testo-terziario)]">{t('dashboard.affluenza.tempoReale')}</p>
                              <p className={`text-sm font-semibold ${
                                affluenza.livelloColore === 'verde' ? 'text-green-400' :
                                affluenza.livelloColore === 'giallo' ? 'text-amber-400' :
                                affluenza.livelloColore === 'rosso' ? 'text-red-400' :
                                'text-[var(--testo-primario)]'
                              }`}>{affluenza.liveDescrizione}</p>
                            </div>
                          </div>
                        )}
                        {/* Update timestamp */}
                        {affluenza.aggiornatoIl && (
                          <p className="text-[9px] text-[var(--testo-terziario)] mt-2 text-right">
                            {t('dashboard.affluenza.aggiornato', { ora: new Date(affluenza.aggiornatoIl).toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' }) })}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-xs text-[var(--testo-terziario)]">{t('dashboard.affluenza.nonDisponibile')}</p>
                        <p className="text-[10px] text-[var(--testo-terziario)] mt-1">{t('dashboard.affluenza.aggiornamentoBreve')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}

        {tabAttivo === 'statistiche' && (
          <motion.div 
            key="statistiche"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
              <Statistiche />
            </Suspense>
          </motion.div>
        )}

        {tabAttivo === 'il mio PT' && ptDashboard && (
          <motion.div
            key="il-mio-pt"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8"
          >
            {/* Personal trainer main column */}
            <div className="flex flex-col gap-8">

              {/* 1. Personal trainer profile */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Users size={20} className="text-[var(--accent)]" />
                  <h3 className="font-bold text-lg">{t('dashboard.pt.titolo')}</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {ptDashboard.trainer?.immagineProfilo
                        ? <img src={ptDashboard.trainer.immagineProfilo} className="w-full h-full object-cover" />
                        : ptDashboard.trainer?.nome?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{ptDashboard.trainer?.nome}</p>
                      <p className="text-xs text-[var(--testo-terziario)]">
                        {t('dashboard.pt.clienti', { count: ptDashboard.trainer?._count?.clientiComePT || 0 })} · {t('dashboard.pt.iscrittoDa', { count: ptDashboard.giorniIscritto ?? 0 })}
                      </p>
                      {ptDashboard.trainer?.bio && (
                        <p className="text-sm text-[var(--testo-secondario)] mt-2">{ptDashboard.trainer.bio}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Announcements board */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Megaphone size={20} className="text-amber-400" />
                  <h3 className="font-bold text-lg">{t('dashboard.pt.bacheca')}</h3>
                  {ptDashboard.annunci?.length > 0 && (
                    <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {ptDashboard.annunci.length}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[var(--bordo-light)]">
                  {ptDashboard.annunci?.length > 0 ? ptDashboard.annunci.slice(0, 10).map((a, aIdx, aArr) => (
                    <div key={a.id} className={`px-card-inner py-5 ${aIdx === aArr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {a.priorita === 'urgente' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                        {a.priorita === 'importante' && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                        <h4 className="font-bold text-sm">{a.titolo}</h4>
                        <span className="text-[10px] text-[var(--testo-terziario)] ml-auto">
                          {formattaDataRelativa(a.creatoIl)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--testo-secondario)] leading-relaxed">{a.contenuto}</p>
                    </div>
                  )) : (
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">{t('dashboard.pt.nessunAnnuncio')}</p>
                  )}
                </div>
              </div>

              {/* 3. Assigned plans */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <ClipboardList size={20} className="text-[var(--accent)]" />
                  <h3 className="font-bold text-lg">{t('dashboard.pt.schede')}</h3>
                </div>
                <div className="divide-y divide-[var(--bordo-light)]">
                  {ptDashboard.schedeAssegnate?.length > 0 ? ptDashboard.schedeAssegnate.map((s, sIdx, sArr) => (
                    <div key={s.id} className={`px-card-inner flex items-center justify-between group hover:bg-[var(--bg-terziario)] transition-colors py-5 ${sIdx === sArr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <div>
                        <p className="font-semibold text-sm">{s.titolo}</p>
                        <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
                          {t('comune.esercizi', { count: s.esercizi?.length || 0 })} · {t('dashboard.pt.sessioniCompletate', { count: s._count?.sessioni || 0 })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/schede/${s.id}`} className="text-xs text-[var(--testo-terziario)] hover:text-[var(--accent)] transition-colors">{t('dashboard.pt.dettagli')}</Link>
                        <button onClick={() => avviaAllenamento(s.id)} disabled={avviando}
                          className="p-2 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors">
                          <PlayCircle size={18} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">{t('dashboard.pt.nessunaScheda')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Personal trainer side column */}
            <div className="flex flex-col gap-8">

              {/* 4. Appointments calendar */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Calendar size={20} className="text-green-400" />
                  <h3 className="font-bold text-lg">{t('dashboard.pt.appuntamenti')}</h3>
                </div>
                <div className="divide-y divide-[var(--bordo-light)]">
                  {ptDashboard.appuntamenti?.length > 0 ? ptDashboard.appuntamenti.map((a, i, arr) => {
                    const data = new Date(a.dataOra);
                    const isProssimo = i === 0;
                    return (
                      <div key={a.id} className={`px-card-inner flex items-center gap-4 ${isProssimo ? 'bg-green-500/5' : ''} py-5 ${i === arr.length - 1 ? 'card-list-ultimo' : ''}`}>
                        <div className={`w-12 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 ${isProssimo ? 'bg-green-500/20 text-green-400' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'}`}>
                          <span className="text-[10px] font-bold uppercase">{data.toLocaleDateString(localeCorrente(), { month: 'short' })}</span>
                          <span className="text-lg font-extrabold leading-none">{data.getDate()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.titolo}</p>
                          <p className="text-xs text-[var(--testo-terziario)]">
                            <Clock size={10} className="inline mr-1" />
                            {data.toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' })}
                            {a.durataMinuti && ` · ${a.durataMinuti} min`}
                          </p>
                          {a.note && <p className="text-xs text-[var(--testo-terziario)] mt-1 truncate">{a.note}</p>}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">{t('dashboard.pt.nessunAppuntamento')}</p>
                  )}
                </div>
              </div>

              {/* 5. Statistics summary */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <BarChart3 size={20} className="text-purple-400" />
                  <h3 className="font-bold text-lg">{t('dashboard.pt.riepilogo')}</h3>
                </div>
                <div className="p-card-inner grid grid-cols-2 gap-4">
                  {[
                    { label: t('dashboard.pt.giorniIscritto'), value: ptDashboard.giorniIscritto, icon: <CalendarHeart size={22} className="mx-auto text-[var(--accent)]" /> },
                    { label: t('dashboard.pt.schedeRicevute'), value: ptDashboard.statistiche?.schedeAssegnate || 0, icon: <FileText size={22} className="mx-auto text-blue-400" /> },
                    { label: t('dashboard.pt.appuntamentiFatti'), value: ptDashboard.statistiche?.appuntamentiCompletati || 0, icon: <CheckCircle size={22} className="mx-auto text-green-400" /> },
                    { label: t('dashboard.pt.prossimiAppuntamenti'), value: ptDashboard.statistiche?.appuntamentiFuturi || 0, icon: <CalendarClock size={22} className="mx-auto text-orange-400" /> },
                  ].map((stat, i) => (
                    <div key={i} className="text-center p-4 rounded-xl bg-[var(--bg-terziario)] border border-[var(--bordo-light)]">
                      <span className="block mb-2">{stat.icon}</span>
                      <p className="text-2xl font-extrabold">{stat.value}</p>
                      <p className="text-xs text-[var(--testo-terziario)] mt-1">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {tabAttivo === 'il mio PT' && !ptDashboard && (
          <div className="flex justify-center items-center py-32">
            <div className="w-12 h-12 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

