// ============================================
// GymMaster — Dashboard
// Hub principale: Attività e Statistiche
// ============================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { formattaDataRelativa, formattaData } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, ChevronRight, ChevronLeft, ClipboardList, History, 
  Trophy, Activity, Info, Edit2, Check, X, Bot, CalendarDays, Trash2, Library,
  Megaphone, Dumbbell, Users, Clock, BarChart3, Calendar, PlayCircle, Building,
  CalendarHeart, FileText, CheckCircle, CalendarClock
} from 'lucide-react';
import Statistiche from './Statistiche.jsx';
import CaroselloAzioni from '../componenti/specifici/CaroselloAzioni.jsx';
import MiglioriOrari from '../componenti/specifici/MiglioriOrari.jsx';
import Calendario, { aStringaData, lunediDi } from '../componenti/comuni/Calendario.jsx';
import SezioneCollassabile from '../componenti/comuni/SezioneCollassabile.jsx';
import { useTelefono } from '../hooks/useMediaQuery.js';

export default function Dashboard() {
  const { utente, isAdmin } = useAuth();
  const naviga = useNavigate();
  
  const [tabAttivo, setTabAttivo] = useState('attività');
  const [sessioniRecenti, setSessioniRecenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  
  // Banner state
  const [banner, setBanner] = useState({ visibile: false, testo: '' });
  const [editBanner, setEditBanner] = useState(false);
  const [tempBannerTesto, setTempBannerTesto] = useState('');
  
  // Consiglio sulla scheda da fare, calcolato dal server sui muscoli riposati
  const [consiglio, setConsiglio] = useState(null);
  const [avviando, setAvviando] = useState(false);

  // PT info per utente iscritto
  const [mioPTDash, setMioPTDash] = useState(null);
  const [senzaPT, setSenzaPT] = useState(false);
  const [ptDashboard, setPtDashboard] = useState(null);
  const [ptCaricamento, setPtCaricamento] = useState(false);

  // Calendario: oltre alle sessioni svolte mostra gli allenamenti in programma,
  // che prima non comparivano affatto.
  const [dataCalendario, setDataCalendario] = useState(new Date());
  const [pianificati, setPianificati] = useState([]);
  const telefonoDash = useTelefono();
  const [modoCalendarioScelto, setModoCalendarioScelto] = useState(null);
  const modoCalendario = modoCalendarioScelto ?? (telefonoDash ? 'settimana' : 'mese');

  // Messaggi non letti: la slide dei messaggi compare solo se ce ne sono
  const [messaggiNonLetti, setMessaggiNonLetti] = useState(0);

  // Affluenza palestra
  const [affluenza, setAffluenza] = useState(null);
  const [affluenzaCaricamento, setAffluenzaCaricamento] = useState(false);

  useEffect(() => {
    caricaDati();
  }, []);

  // Ricarica quando cambia il periodo mostrato: il calendario deve restare
  // aggiornato anche scorrendo avanti e indietro fra i mesi.
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

  const caricaDati = async () => {
    try {
      setCaricamento(true);
      const [resSess, resBanner, resConsiglio] = await Promise.all([
        api.get('/sessioni?limite=30'),
        api.get('/banner').catch(() => ({ dati: { visibile: false, testo: '' } })),
        api.get('/statistiche/consiglio').catch(() => ({ dati: null }))
      ]);

      // Conteggio messaggi non letti (non bloccante)
      api.get('/chat/non-letti')
        .then(r => setMessaggiNonLetti(r.dati?.totale || 0))
        .catch(() => setMessaggiNonLetti(0));

      // Carica info PT (non bloccante)
      api.get('/utenti/mio-pt').then(r => {
        if (r.dati?.stato === 'ATTIVA') setMioPTDash(r.dati);
        setSenzaPT(!r.dati); // nessun rapporto PT (né attivo né in attesa)
      }).catch(() => {});
      
      // Carica affluenza se utente ha palestra
      if (utente?.palestraId || utente?.palestra?.id) {
        caricaAffluenza(utente.palestraId || utente.palestra?.id);
      }
      
      setSessioniRecenti(resSess.dati || []);
      if (resBanner.dati) {
        setBanner(resBanner.dati);
        setTempBannerTesto(resBanner.dati.testo);
      }

      setConsiglio(resConsiglio.dati || null);

    } catch (err) {
      console.error('Errore caricamento dashboard:', err);
    } finally {
      setCaricamento(false);
    }
  };

  const caricaDatiPT = async () => {
    try {
      setPtCaricamento(true);
      const res = await api.get('/utenti/mio-pt/dashboard');
      if (res.dati) setPtDashboard(res.dati);
    } catch (err) {
      console.error('Errore caricamento dati PT:', err);
    } finally {
      setPtCaricamento(false);
    }
  };

  // Carica dati affluenza palestra
  const caricaAffluenza = async (palestraId) => {
    if (!palestraId) return;
    try {
      setAffluenzaCaricamento(true);
      const res = await api.get(`/palestre/${palestraId}/affluenza`);
      if (res.dati) setAffluenza(res.dati);
    } catch {
      setAffluenza(null);
    } finally {
      setAffluenzaCaricamento(false);
    }
  };

  // Polling affluenza ogni 5 minuti
  useEffect(() => {
    const palestraId = utente?.palestraId || utente?.palestra?.id;
    if (!palestraId) return;
    const intervallo = setInterval(() => caricaAffluenza(palestraId), 5 * 60 * 1000);
    return () => clearInterval(intervallo);
  }, [utente?.palestraId, utente?.palestra?.id]);

  const salvaBanner = async (visibile) => {
    try {
      const nuovoBanner = { visibile, testo: tempBannerTesto };
      await api.put('/admin/banner', nuovoBanner);
      setBanner(nuovoBanner);
      setEditBanner(false);
    } catch (err) {
      alert("Errore salvataggio banner");
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
    if (!window.confirm("Sei sicuro di voler eliminare questa attività?")) return;
    try {
      await api.delete(`/sessioni/${id}`);
      setSessioniRecenti(prev => prev.filter(s => s.id !== id));
      // Ricarichiamo i dati per aggiornare il calendario e le statistiche
      caricaDati();
    } catch (err) {
      alert(err.response?.data?.errore || "Errore durante l'eliminazione");
    }
  };

  // Helper per il calendario (mese corrente)


  // Pallini del calendario: rosso per gli allenamenti gia' svolti, colore di
  // stato per quelli in programma.
  const marcatoriCalendario = (() => {
    const per = {};
    const aggiungi = (giorno, colore) => {
      if (!per[giorno]) per[giorno] = [];
      if (!per[giorno].some(x => x.colore === colore)) per[giorno].push({ colore });
    };
    for (const s of sessioniRecenti) aggiungi(s.dataInizio.split('T')[0], 'var(--pericolo)');
    for (const p of pianificati) {
      aggiungi(p.data, p.stato === 'COMPLETATO' ? 'var(--successo, #22c55e)'
                     : p.stato === 'SALTATO' ? 'var(--testo-terziario)'
                     : 'var(--accent)');
    }
    return per;
  })();


  const ora = new Date().getHours();
  const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';

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

  // Inviti contestuali della dashboard, raccolti in un unico banner scorrevole.
  // Ogni voce entra nell'elenco solo quando ha davvero senso mostrarla: se non
  // ne resta nessuna, CaroselloAzioni non rende nulla.
  const slideAzioni = [
    ...(senzaPT && !isAdmin && utente?.ruolo !== 'PERSONAL_TRAINER' ? [{
      id: 'trova-pt',
      Icona: Dumbbell,
      titolo: 'Vuoi una guida esperta?',
      sottotitolo: 'Trova un Personal Trainer e allenati con schede su misura.',
      etichetta: 'Trova un PT',
      a: '/trova-pt'
    }] : []),
    ...(messaggiNonLetti > 0 ? [{
      id: 'messaggi',
      Icona: MessageCircle,
      titolo: messaggiNonLetti === 1 ? 'Hai 1 messaggio non letto' : `Hai ${messaggiNonLetti} messaggi non letti`,
      sottotitolo: 'Apri la chat per leggerli e rispondere.',
      etichetta: 'Apri la chat',
      a: '/chat'
    }] : []),
    // "Inizia scheda" passa da Allenati ora, con la scheda gia' aperta: da li'
    // si parte con un tocco, e un tocco accidentale sul banner non crea una
    // sessione vuota
    ...(consiglio ? [{
      id: 'consiglio-ai',
      Icona: consiglio.motivo === 'oggi' ? CalendarClock : Bot,
      titolo: consiglio.scheda?.titolo || 'Oggi recupero',
      sottotitolo: consiglio.testo,
      etichetta: consiglio.scheda ? 'Inizia scheda' : 'Vedi il recupero',
      a: consiglio.scheda ? `/allenamento?scheda=${consiglio.scheda.id}` : '/statistiche'
    }] : [])
  ];


  return (
    <div className="py-4 md:py-8 pb-12">
      {/* Header Saluto */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 md:mb-20 relative">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-[var(--accent)] rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2 relative z-10">
          {saluto}, <br className="md:hidden" /><span className="testo-gradient">{utente?.nome?.split(' ')[0]}</span>
        </h1>
      </motion.div>

      {/* Banner Comunicazioni */}
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
                      placeholder="Inserisci il testo del banner..."
                      autoFocus
                    />
                  ) : (
                    <span className={`text-base md:text-xl font-medium flex-1 ${banner.visibile ? 'text-[var(--testo-primario)]' : 'text-[var(--testo-terziario)]'}`}>
                      {banner.testo || (isAdmin ? "Nessun testo. Clicca la matita per modificare." : "")}
                      {!banner.visibile && isAdmin && " (Attualmente Nascosto)"}
                    </span>
                  )}
                </div>
                
                {/* Controlli Admin */}
                {isAdmin && (
                  <div className="flex gap-2 shrink-0">
                    {editBanner ? (
                      <>
                        <button onClick={() => salvaBanner(true)} className="p-1.5 bg-[var(--successo-dim)] text-[var(--successo)] rounded hover:bg-[var(--successo)] hover:text-white transition-colors" title="Salva e Mostra">
                          <Check size={16} />
                        </button>
                        <button onClick={() => salvaBanner(false)} className="p-1.5 bg-[var(--pericolo-dim)] text-[var(--pericolo)] rounded hover:bg-[var(--pericolo)] hover:text-white transition-colors" title="Salva e Nascondi">
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

      {/* Inviti contestuali raccolti in un unico banner scorrevole */}
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
                {/* Sfondo attivo animato */}
                {tabAttivo === tab && (
                  <motion.div layoutId="dashboardTabBg" className="absolute inset-0 bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-[14px] shadow-sm z-0" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                )}
                
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <IconaTab size={18} className={`shrink-0 transition-transform duration-300 ${tabAttivo === tab ? 'text-[var(--accent)]' : ''}`} />
                  {tab}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenuto Tabs */}
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
            {/* Colonna Principale */}
            <div className="flex flex-col gap-8">
              
              {/* Allenati e gestisci schede */}
              <SezioneCollassabile chiave="allenati" titolo="Allenati e gestisci schede" Icona={Activity}>
                <div className="flex flex-col">
                  {[
                    { etichetta: 'Gestione Schede', icona: ClipboardList, link: '/schede' },
                    // Unico accesso alla pianificazione da telefono: la barra di
                    // navigazione mobile ha cinque voci fisse e la sidebar con la
                    // voce "Pianificazione" compare solo da md in su.
                    { etichetta: 'Pianifica Allenamenti', icona: CalendarClock, link: '/pianificazione' },
                    { etichetta: 'Catalogo Esercizi', icona: Library, link: '/catalogo' },
                    { etichetta: 'Storico Allenamenti', icona: History, link: '/storico' },
                    { etichetta: 'Classifiche', icona: Trophy, link: '/gamification' }
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

              {/* Ultime attività (Allenamenti Recenti) */}
              <SezioneCollassabile chiave="ultime-attivita" titolo="Ultime attività" Icona={History}>
                
                <div className="text-center text-[var(--testo-terziario)] flex items-center justify-center">
                  {sessioniRecenti.slice(0,3).length > 0 ? (
                    <ul className="w-full text-left">
                      {sessioniRecenti.slice(0,3).map((sessione, sIdx, sArr) => (
                        <li key={sessione.id} className={`px-card-inner border-b border-[var(--bordo-light)] last:border-0 flex justify-between items-center group py-5 ${sIdx === sArr.length - 1 ? 'card-list-ultimo' : ''}`}>
                          <div>
                            <p className="text-[var(--testo-primario)] font-medium text-base">{sessione.scheda?.titolo || 'Sessione Libera'}</p>
                            <p className="text-xs text-[var(--testo-terziario)] mt-1">{formattaDataRelativa(sessione.dataInizio)}</p>
                          </div>
                          <button 
                            onClick={(e) => eliminaSessione(sessione.id, e)}
                            className="p-2 text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] rounded-full transition-colors"
                            title="Elimina attività"
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
                        <p className="font-semibold text-[var(--testo-primario)]">Ancora nessun allenamento</p>
                        <p className="text-sm text-[var(--testo-terziario)] mt-1">Inizia da una scheda: comparirà qui.</p>
                      </div>
                      <Link to="/schede" style={{ color: '#fff' }} className="mt-1 w-full sm:w-auto text-center px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold transition-colors shadow-[var(--ombra-accent)]">
                        Vai alle schede
                      </Link>
                    </div>
                  )}
                </div>
              </SezioneCollassabile>

            </div>

            {/* Colonna laterale */}
            <div className="flex flex-col gap-8">
              
              {/* Migliori orari per allenarsi (dalle rilevazioni di affluenza) */}
              <MiglioriOrari palestraId={utente?.palestraId || utente?.palestra?.id} />

              {/* Calendario: allenamenti svolti e in programma */}
              <SezioneCollassabile chiave="calendario" titolo="Calendario" Icona={CalendarDays}>
                <div className="p-card-inner">
                  <Calendario
                    modo={modoCalendario}
                    ancora={dataCalendario}
                    onCambiaAncora={setDataCalendario}
                    onCambiaModo={setModoCalendarioScelto}
                    marcatori={marcatoriCalendario}
                  />

                  <div className="flex items-center gap-3 mt-5 pt-4 border-t border-[var(--bordo-light)] text-xs text-[var(--testo-terziario)] flex-wrap">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--pericolo)' }} /> Svolto</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} /> In programma</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--successo, #22c55e)' }} /> Completato</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--bordo-light)] flex items-center justify-between gap-3 text-sm">
                    <Link to="/pianificazione" className="font-semibold text-[var(--accent)] hover:underline">Pianifica</Link>
                    <Link to="/storico" className="font-semibold text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors">Storico →</Link>
                  </div>
                </div>
              </SezioneCollassabile>

              {/* Widget Affluenza Palestra */}
              {(utente?.palestraId || utente?.palestra?.id) && (
                <div className="glass-card flex flex-col overflow-hidden">
                  <div className="p-card-inner pb-4 flex items-center gap-3">
                    <Building size={22} className="text-[var(--accent)]" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg">Affluenza</h3>
                      <p className="text-[10px] text-[var(--testo-terziario)] truncate">
                        {utente?.palestra?.nomeCatena || 'La tua palestra'}
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
                        {/* Grafico affluenza — stile "orari di punta" */}
                        {(() => {
                          const ore = Array.from({ length: 24 }, (_, ora) => {
                            const dato = affluenza.graficoGiornata.find(d => d.ora === ora);
                            return { ora, livello: dato?.live ?? dato?.livello ?? 0, isOra: ora === affluenza.oraCorrente };
                          });
                          const maxLivello = Math.max(1, ...ore.map(o => o.livello));
                          const coloreBarra = (liv) => liv <= 0 ? null : liv <= 30 ? ['#22c55e', '#15803d'] : liv <= 60 ? ['#f59e0b', '#b45309'] : ['#ef4444', '#b91c1c'];
                          return (
                            <div className="mb-2">
                              {/* segnaposto ora corrente */}
                              <div className="flex gap-[3px] h-3 mb-1">
                                {ore.map(({ ora, isOra }) => (
                                  <div key={ora} className="flex-1 flex items-end justify-center">
                                    {isOra && <span className="block w-0 h-0" style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid var(--testo-primario)' }} />}
                                  </div>
                                ))}
                              </div>
                              {/* barre con traccia di sfondo */}
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
                              {/* asse ore */}
                              <div className="flex gap-[3px] mt-2 text-[10px] text-[var(--testo-terziario)]">
                                {ore.map(({ ora }) => (
                                  <div key={ora} className="flex-1 text-center">{ora % 6 === 0 ? String(ora).padStart(2, '0') : ''}</div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Live descrizione — prominente */}
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
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--testo-terziario)]">In tempo reale</p>
                              <p className={`text-sm font-semibold ${
                                affluenza.livelloColore === 'verde' ? 'text-green-400' :
                                affluenza.livelloColore === 'giallo' ? 'text-amber-400' :
                                affluenza.livelloColore === 'rosso' ? 'text-red-400' :
                                'text-[var(--testo-primario)]'
                              }`}>{affluenza.liveDescrizione}</p>
                            </div>
                          </div>
                        )}
                        {/* Timestamp aggiornamento */}
                        {affluenza.aggiornatoIl && (
                          <p className="text-[9px] text-[var(--testo-terziario)] mt-2 text-right">
                            Aggiornato: {new Date(affluenza.aggiornatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-xs text-[var(--testo-terziario)]">Dati affluenza non disponibili</p>
                        <p className="text-[10px] text-[var(--testo-terziario)] mt-1">Saranno aggiornati a breve</p>
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
            <Statistiche />
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
            {/* Colonna Principale PT */}
            <div className="flex flex-col gap-8">

              {/* 1. Profilo PT */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Users size={20} className="text-[var(--accent)]" />
                  <h3 className="font-bold text-lg">Il tuo Personal Trainer</h3>
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
                        {ptDashboard.trainer?._count?.clientiComePT || 0} clienti · Iscritto da {ptDashboard.giorniIscritto} giorni
                      </p>
                      {ptDashboard.trainer?.bio && (
                        <p className="text-sm text-[var(--testo-secondario)] mt-2">{ptDashboard.trainer.bio}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Bacheca Annunci */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Megaphone size={20} className="text-amber-400" />
                  <h3 className="font-bold text-lg">Bacheca Annunci</h3>
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
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">Nessun annuncio dal tuo PT</p>
                  )}
                </div>
              </div>

              {/* 3. Schede Assegnate */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <ClipboardList size={20} className="text-[var(--accent)]" />
                  <h3 className="font-bold text-lg">Schede dal PT</h3>
                </div>
                <div className="divide-y divide-[var(--bordo-light)]">
                  {ptDashboard.schedeAssegnate?.length > 0 ? ptDashboard.schedeAssegnate.map((s, sIdx, sArr) => (
                    <div key={s.id} className={`px-card-inner flex items-center justify-between group hover:bg-[var(--bg-terziario)] transition-colors py-5 ${sIdx === sArr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <div>
                        <p className="font-semibold text-sm">{s.titolo}</p>
                        <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
                          {s.esercizi?.length || 0} esercizi · {s._count?.sessioni || 0} sessioni completate
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/schede/${s.id}`} className="text-xs text-[var(--testo-terziario)] hover:text-[var(--accent)] transition-colors">Dettagli</Link>
                        <button onClick={() => avviaAllenamento(s.id)} disabled={avviando}
                          className="p-2 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors">
                          <PlayCircle size={18} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">Nessuna scheda assegnata ancora</p>
                  )}
                </div>
              </div>
            </div>

            {/* Colonna Laterale PT */}
            <div className="flex flex-col gap-8">

              {/* 4. Calendario Appuntamenti */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <Calendar size={20} className="text-green-400" />
                  <h3 className="font-bold text-lg">Appuntamenti</h3>
                </div>
                <div className="divide-y divide-[var(--bordo-light)]">
                  {ptDashboard.appuntamenti?.length > 0 ? ptDashboard.appuntamenti.map((a, i, arr) => {
                    const data = new Date(a.dataOra);
                    const isProssimo = i === 0;
                    return (
                      <div key={a.id} className={`px-card-inner flex items-center gap-4 ${isProssimo ? 'bg-green-500/5' : ''} py-5 ${i === arr.length - 1 ? 'card-list-ultimo' : ''}`}>
                        <div className={`w-12 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 ${isProssimo ? 'bg-green-500/20 text-green-400' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'}`}>
                          <span className="text-[10px] font-bold uppercase">{data.toLocaleDateString('it-IT', { month: 'short' })}</span>
                          <span className="text-lg font-extrabold leading-none">{data.getDate()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.titolo}</p>
                          <p className="text-xs text-[var(--testo-terziario)]">
                            <Clock size={10} className="inline mr-1" />
                            {data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            {a.durataMinuti && ` · ${a.durataMinuti} min`}
                          </p>
                          {a.note && <p className="text-xs text-[var(--testo-terziario)] mt-1 truncate">{a.note}</p>}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">Nessun appuntamento in programma</p>
                  )}
                </div>
              </div>

              {/* 5. Riepilogo Statistiche */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner flex items-center gap-3 border-b border-[var(--bordo-light)]">
                  <BarChart3 size={20} className="text-purple-400" />
                  <h3 className="font-bold text-lg">Riepilogo</h3>
                </div>
                <div className="p-card-inner grid grid-cols-2 gap-4">
                  {[
                    { label: 'Giorni iscritto', value: ptDashboard.giorniIscritto, icon: <CalendarHeart size={22} className="mx-auto text-[var(--accent)]" /> },
                    { label: 'Schede ricevute', value: ptDashboard.statistiche?.schedeAssegnate || 0, icon: <FileText size={22} className="mx-auto text-blue-400" /> },
                    { label: 'Appuntamenti fatti', value: ptDashboard.statistiche?.appuntamentiCompletati || 0, icon: <CheckCircle size={22} className="mx-auto text-green-400" /> },
                    { label: 'Prossimi appuntamenti', value: ptDashboard.statistiche?.appuntamentiFuturi || 0, icon: <CalendarClock size={22} className="mx-auto text-orange-400" /> },
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

