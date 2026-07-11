// ============================================
// GymMaster — Pagina Profilo (Restyling Completo)
// Hero Card + Tab System (7 sezioni)
// ============================================

import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { RUOLI } from '../utils/costanti.js';
import { formattaData } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import RitaglioFoto from '../componenti/comuni/RitaglioFoto.jsx';
import { useState, useRef, useEffect } from 'react';
import {
  User, Shield, Dumbbell, Lock, CreditCard, FileText, Trash2,
  ChevronRight, Sparkles, AlertCircle, ExternalLink, Building, LogOut,
  Pencil
} from 'lucide-react';

const OBIETTIVI = ['Massa Muscolare', 'Definizione', 'Resistenza', 'Salute Generale', 'Perdita Peso'];
const GENERI = [{ v: 'M', l: 'Maschile' }, { v: 'F', l: 'Femminile' }, { v: 'Altro', l: 'Altro' }];
const VIS_DEFAULT = { palestra: true, peso: false, altezza: false, eta: false, obiettivo: true, statistiche: false, record: true };

const TABS = [
  { id: 'profilo', label: 'Profilo', icona: User },
  { id: 'privacy', label: 'Privacy', icona: Shield },
  { id: 'pt', label: 'Personal Trainer', icona: Dumbbell },
  { id: 'sicurezza', label: 'Sicurezza', icona: Lock },
  { id: 'fatturazione', label: 'Fatturazione', icona: CreditCard },
  { id: 'legale', label: 'Legal & Compliance', icona: FileText },
  { id: 'elimina', label: 'Elimina Account', icona: Trash2 },
];

export default function Profilo() {
  const { utente, logout, aggiornaUtente } = useAuth();
  const [richiedendoPT, setRichiedendoPT] = useState(false);
  const [fotoDaRitagliare, setFotoDaRitagliare] = useState(null);
  const fileRef = useRef(null);
  const [tabAttivo, setTabAttivo] = useState('profilo');

  // Form dati profilo
  const [form, setForm] = useState({
    nome: '', bio: '', dataNascita: '', pesoKg: '', altezzaCm: '',
    genere: '', obiettivoFitness: '', palestraId: ''
  });
  const [visibilita, setVisibilita] = useState(VIS_DEFAULT);
  const [gamificationAttiva, setGamificationAttiva] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msgSalvataggio, setMsgSalvataggio] = useState('');
  const [modificaAbilitata, setModificaAbilitata] = useState(false);

  // Cambio password
  const [pwForm, setPwForm] = useState({ vecchia: '', nuova: '', conferma: '' });
  const [pwSalvando, setPwSalvando] = useState(false);
  const [pwMsg, setPwMsg] = useState({ testo: '', tipo: '' });

  // Reset statistiche
  const [mostraReset, setMostraReset] = useState(false);
  const [confermaReset, setConfermaReset] = useState('');
  const [avviandoReset, setAvviandoReset] = useState(false);

  // Info app
  const [infoApp, setInfoApp] = useState(null);

  // Telegram
  const [telegram, setTelegram] = useState(null);
  const [telegramCodice, setTelegramCodice] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);

  // Personal Trainer
  const [mioPT, setMioPT] = useState(undefined);
  const [listaTrainers, setListaTrainers] = useState([]);
  const [mostraListaPT, setMostraListaPT] = useState(false);
  const [messaggioPT, setMessaggioPT] = useState('');
  const [inviandoPT, setInviandoPT] = useState(false);

  // Eliminazione account
  const [confermaElimina, setConfermaElimina] = useState('');
  const [eliminando, setEliminando] = useState(false);

  // Palestre
  const [listaPalestre, setListaPalestre] = useState([]);

  useEffect(() => {
    if (utente) {
      setForm({
        nome: utente.nome || '', bio: utente.bio || '',
        dataNascita: utente.dataNascita ? utente.dataNascita.split('T')[0] : '',
        pesoKg: utente.pesoKg || '', altezzaCm: utente.altezzaCm || '',
        genere: utente.genere || '', obiettivoFitness: utente.obiettivoFitness || '',
        palestraId: utente.palestra?.id || utente.palestraId || ''
      });
      setAvatarPreview(utente.immagineProfilo || null);
      setGamificationAttiva(utente.gamificationAttiva !== false);
      try { setVisibilita({ ...VIS_DEFAULT, ...JSON.parse(utente.preferenzeVisibilita || '{}') }); }
      catch { setVisibilita(VIS_DEFAULT); }
    }
    api.get('/utenti/mio-pt').then(r => setMioPT(r.dati)).catch(() => setMioPT(null));
    api.get('/palestre').then(r => setListaPalestre(r.dati || [])).catch(() => setListaPalestre([]));
  }, [utente]);

  // --- Avatar (ritaglio manuale + compressione automatica) ---
  const gestisciImmagine = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoDaRitagliare(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // consente di riselezionare lo stesso file
  };

  const confermaRitaglio = (base64) => {
    setAvatarPreview(base64);
    salvaProfilo({ immagineProfilo: base64 });
    setFotoDaRitagliare(null);
  };

  const salvaProfilo = async (extra = {}) => {
    try {
      setSalvando(true); setMsgSalvataggio('');
      const dati = { ...form, preferenzeVisibilita: JSON.stringify(visibilita), ...extra };
      if (dati.dataNascita === '') dati.dataNascita = null;
      if (dati.pesoKg === '') dati.pesoKg = null;
      if (dati.altezzaCm === '') dati.altezzaCm = null;
      if (dati.palestraId === '') dati.palestraId = null;
      const r = await api.patch('/utenti/profilo', dati);
      aggiornaUtente(r.dati);
      setMsgSalvataggio('✅ Salvato!');
      if (!extra.immagineProfilo) {
        setModificaAbilitata(false);
      }
      setTimeout(() => setMsgSalvataggio(''), 2000);
    } catch (err) { setMsgSalvataggio('❌ ' + err.message); }
    finally { setSalvando(false); }
  };

  const toggleVis = async (campo) => {
    const nuova = { ...visibilita, [campo]: !visibilita[campo] };
    setVisibilita(nuova);
    try {
      const r = await api.patch('/utenti/profilo', { preferenzeVisibilita: JSON.stringify(nuova) });
      aggiornaUtente(r.dati);
    } catch {
      setVisibilita(visibilita); // rollback
    }
  };

  const cambiaPw = async () => {
    setPwMsg({ testo: '', tipo: '' });
    if (pwForm.nuova !== pwForm.conferma) return setPwMsg({ testo: 'Le password non corrispondono', tipo: 'err' });
    if (pwForm.nuova.length < 8) return setPwMsg({ testo: 'Minimo 8 caratteri', tipo: 'err' });
    try {
      setPwSalvando(true);
      await api.post('/utenti/cambia-password', { vecchiaPassword: pwForm.vecchia, nuovaPassword: pwForm.nuova });
      setPwMsg({ testo: 'Password aggiornata con successo!', tipo: 'ok' });
      setPwForm({ vecchia: '', nuova: '', conferma: '' });
    } catch (err) { setPwMsg({ testo: err.message, tipo: 'err' }); }
    finally { setPwSalvando(false); }
  };

  const eseguiReset = async () => {
    if (confermaReset !== 'CONFERMO') return;
    try {
      setAvviandoReset(true);
      await api.post('/utenti/reset-statistiche');
      alert('Statistiche azzerate!'); window.location.reload();
    } catch (err) { alert(err.message); }
    finally { setAvviandoReset(false); setMostraReset(false); setConfermaReset(''); }
  };

  const caricaInfoApp = async () => {
    if (infoApp) return;
    try { const r = await api.get('/utenti/info-app'); setInfoApp(r.dati); }
    catch { setInfoApp({ versione: 'N/A', stack: {}, changelog: [] }); }
  };

  const caricaTelegram = async () => {
    if (telegram) return;
    try { const r = await api.get('/utenti/telegram/stato'); setTelegram(r.dati); }
    catch { setTelegram({ collegato: false }); }
  };

  const generaCodiceTelegram = async () => {
    try {
      setTgLoading(true);
      const r = await api.post('/utenti/telegram/genera-codice');
      setTelegramCodice(r.dati);
    } catch (err) { alert(err.message); }
    finally { setTgLoading(false); }
  };

  const scollegaTelegram = async () => {
    try {
      setTgLoading(true);
      await api.delete('/utenti/telegram');
      setTelegram({ collegato: false });
      setTelegramCodice(null);
    } catch (err) { alert(err.message); }
    finally { setTgLoading(false); }
  };

  const ruoloInfo = RUOLI[utente?.ruolo] || RUOLI.UTENTE;

  // === Toggle component riutilizzabile ===
  const Toggle = ({ attivo, onClick }) => (
    <button onClick={onClick}
      className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${attivo ? 'bg-[var(--accent)]' : 'bg-[var(--bordo)]'}`}>
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${attivo ? 'left-[26px]' : 'left-0.5'}`} />
    </button>
  );

  // === RENDER ===
  return (
    <div className="py-2 pb-24">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

        {/* ═══ HERO CARD ═══ */}
        <div className="glass-card p-card-inner relative overflow-hidden" style={{ marginBottom: '16px' }}>
          <div className="absolute inset-0 opacity-10" style={{ background: 'linear-gradient(135deg, var(--accent), transparent 70%)' }} />
          <div className="relative flex items-center gap-5">
            <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-2xl object-cover border-2 border-[var(--accent)] shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold"
                     style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {utente?.nome?.charAt(0)?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-lg">📷</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={gestisciImmagine} className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold truncate">{utente?.nome}</h1>
              <p className="text-sm text-[var(--testo-secondario)] truncate">{utente?.email}</p>
              {utente?.palestra && (
                <p className="text-xs text-[var(--testo-terziario)] flex items-center gap-1 mt-0.5"><Building size={11} /> {utente.palestra.nomeCatena} — {utente.palestra.citta}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`badge ${ruoloInfo.colore}`}>{ruoloInfo.label}</span>
                <span className="text-[10px] text-[var(--testo-terziario)]">Dal {formattaData(utente?.dataRegistrazione)}</span>
              </div>
            </div>
            <div className="text-center shrink-0 hidden sm:block">
              <p className="text-2xl font-extrabold testo-gradient">{utente?.puntiEsperienza || 0}</p>
              <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wider">XP</p>
            </div>
          </div>
        </div>

        {/* ═══ TABS ═══ */}
        <div style={{ paddingTop: '0px', paddingBottom: '25px', width: '100%' }}>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" style={{ background: 'var(--vetro)', border: '1px solid var(--vetro-bordo)', padding: '10px', borderRadius: '32px', boxShadow: 'var(--ombra-card)' }}>
            <div className="flex items-center gap-2 flex-1">
              {TABS.filter(t => t.id !== 'pt' || utente?.ruolo === 'UTENTE').map((tab) => (
                <button key={tab.id}
                  onClick={() => { setTabAttivo(tab.id); if (tab.id === 'legale') caricaInfoApp(); if (tab.id === 'sicurezza') caricaTelegram(); }}
                  className={`flex items-center justify-center py-2.5 rounded-[14px] text-sm font-bold transition-all duration-300 whitespace-nowrap shrink-0 relative ${
                    tabAttivo === tab.id 
                      ? 'px-10 text-[var(--testo-primario)]' 
                      : 'px-5 text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[rgba(255,255,255,0.05)]'
                  } ${tab.id === 'elimina' && tabAttivo !== tab.id ? '!text-[var(--pericolo)] opacity-70 hover:opacity-100' : ''}`}>
                  
                  {/* Sfondo attivo animato */}
                  {tabAttivo === tab.id && (
                    <motion.div layoutId="profiloTabBg" className="absolute inset-0 bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-[14px] shadow-sm z-0" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                  )}
                  
                  <div className="relative z-10 flex items-center justify-center">
                    <tab.icona size={20} className={`shrink-0 transition-transform duration-300 ${tabAttivo === tab.id && tab.id !== 'elimina' ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent-dim)] scale-125' : ''} ${tabAttivo === tab.id && tab.id === 'elimina' ? 'text-[var(--pericolo)] scale-125' : ''}`} />
                  </div>
                </button>
              ))}
            </div>

            {/* PULSANTE LOGOUT (PARTE DESTRA) */}
            <div className="border-l border-[var(--vetro-bordo)] pl-2 shrink-0">
              <button 
                onClick={(e) => { e.preventDefault(); if (window.confirm('Sei sicuro di voler uscire?')) logout(); }}
                className="flex items-center justify-center py-2.5 px-5 rounded-[14px] transition-all duration-300 text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)]"
                title="Esci dall'account"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* ═══ CONTENUTO TAB ═══ */}
        <AnimatePresence mode="wait">

          {/* TAB 1: PROFILO */}
          {tabAttivo === 'profilo' && (
            <motion.div key="profilo" className="flex flex-col gap-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)] flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2"><User size={20} className="text-[var(--accent)]" /> Dati Personali</h3>
                  <button
                    type="button"
                    onClick={() => setModificaAbilitata(!modificaAbilitata)}
                    className={`p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center ${
                      modificaAbilitata
                        ? 'bg-[var(--accent-dim)] text-[var(--accent)] scale-110 shadow-sm border border-[var(--accent)]/20'
                        : 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[var(--bg-terziario)] border border-transparent'
                    }`}
                    title={modificaAbilitata ? "Disabilita modifiche" : "Abilita modifiche"}
                  >
                    <Pencil size={18} />
                  </button>
                </div>
                <div className="p-card-inner flex flex-col gap-4">
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">Nome</label>
                    <input type="text" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} className="campo-input" placeholder="Il tuo nome" disabled={!modificaAbilitata} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">Data di nascita</label>
                      <input type="date" value={form.dataNascita} onChange={e => setForm(p => ({...p, dataNascita: e.target.value}))} className="campo-input" disabled={!modificaAbilitata} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">Genere</label>
                      <select value={form.genere} onChange={e => setForm(p => ({...p, genere: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                        <option value="">—</option>
                        {GENERI.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">Peso (kg)</label>
                      <input type="number" value={form.pesoKg} onChange={e => setForm(p => ({...p, pesoKg: e.target.value}))} className="campo-input" placeholder="75" step="0.1" min="0" inputMode="decimal" disabled={!modificaAbilitata} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">Altezza (cm)</label>
                      <input type="number" value={form.altezzaCm} onChange={e => setForm(p => ({...p, altezzaCm: e.target.value}))} className="campo-input" placeholder="175" min="0" inputMode="numeric" disabled={!modificaAbilitata} />
                    </div>
                  </div>
                  <Link to="/composizione" className="flex items-center justify-between px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors group">
                    <span className="text-sm font-semibold flex items-center gap-2">📊 Composizione corporea <span className="text-xs font-normal text-[var(--testo-terziario)]">peso, grasso, muscolo…</span></span>
                    <span className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors">→</span>
                  </Link>

                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1"><Building size={12} className="inline mr-1" />Palestra</label>
                    <select value={form.palestraId} onChange={e => setForm(p => ({...p, palestraId: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                      <option value="">Nessuna palestra</option>
                      {listaPalestre.map(p => <option key={p.id} value={p.id}>{p.nomeCatena} — {p.indirizzo}, {p.citta}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">Obiettivo Fitness</label>
                    <select value={form.obiettivoFitness} onChange={e => setForm(p => ({...p, obiettivoFitness: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                      <option value="">Seleziona...</option>
                      {OBIETTIVI.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">Bio <span className="text-[var(--testo-terziario)]">({(form.bio || '').length}/200)</span></label>
                    <textarea value={form.bio} onChange={e => setForm(p => ({...p, bio: e.target.value.slice(0, 200)}))}
                              className="campo-input min-h-[60px] resize-none" placeholder="Qualcosa su di te..." rows="2" disabled={!modificaAbilitata} />
                  </div>
                  <div className="flex items-center gap-3 pt-6 pb-2">
                    <button onClick={() => salvaProfilo()} disabled={!modificaAbilitata || salvando}
                            className="btn-primario flex-1 py-3 disabled:opacity-40">{salvando ? 'Salvataggio...' : '💾 Salva Modifiche'}</button>
                    {msgSalvataggio && <span className="text-sm font-medium">{msgSalvataggio}</span>}
                  </div>
                </div>
              </div>

              {/* Account professionale: diventa Personal Trainer (solo utenti standard) */}
              {utente?.ruolo === 'UTENTE' && (
                <div className="glass-card overflow-hidden">
                  <div className="p-card-inner border-b border-[var(--bordo-light)]">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Dumbbell size={20} className="text-[var(--accent)]" /> Account professionale</h3>
                  </div>
                  <div className="p-card-inner">
                    {utente?.ruoloRichiesto === 'PERSONAL_TRAINER' ? (
                      <div className="flex items-center gap-4 p-card-inner rounded-[var(--raggio-md)] bg-[var(--avviso-dim)] border border-[var(--avviso)]">
                        <span className="text-3xl">⏳</span>
                        <div>
                          <p className="font-bold text-sm">Richiesta in attesa</p>
                          <p className="text-xs text-[var(--testo-secondario)]">Un amministratore valuterà a breve la tua richiesta di diventare Personal Trainer.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-[var(--testo-secondario)] mb-4">Sei un professionista del fitness? Richiedi il ruolo di <b>Personal Trainer</b> per gestire clienti, creare schede pubbliche e apparire tra i PT scopribili dagli utenti.</p>
                        <button
                          onClick={async () => {
                            try {
                              setRichiedendoPT(true);
                              await api.post('/utenti/richiedi-pt');
                              aggiornaUtente({ ruoloRichiesto: 'PERSONAL_TRAINER' });
                            } catch (err) { alert(err.message); } finally { setRichiedendoPT(false); }
                          }}
                          disabled={richiedendoPT}
                          className="btn-primario w-full disabled:opacity-50"
                        >
                          {richiedendoPT ? 'Invio richiesta…' : '🏋️ Diventa Personal Trainer'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: PRIVACY */}
          {tabAttivo === 'privacy' && (
            <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Shield size={20} className="text-[var(--accent)]" /> Visibilità Profilo</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-1">Scegli quali informazioni mostrare agli altri utenti</p>
                </div>
                <div className="p-card-inner flex flex-col gap-2">
                  {[
                    { campo: 'palestra', label: 'Mostra palestra', icona: '🏢' },
                    { campo: 'peso', label: 'Mostra peso', icona: '⚖️' },
                    { campo: 'altezza', label: 'Mostra altezza', icona: '📏' },
                    { campo: 'eta', label: 'Mostra età', icona: '🎂' },
                    { campo: 'obiettivo', label: 'Mostra obiettivo fitness', icona: '🎯' },
                    { campo: 'statistiche', label: 'Mostra statistiche allenamenti', icona: '📊' },
                    { campo: 'record', label: 'Mostra record personali', icona: '🏆' },
                  ].map(({ campo, label, icona }) => (
                    <div key={campo} className="flex items-center justify-between px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                      <span className="text-sm flex items-center gap-2">{icona} {label}</span>
                      <Toggle attivo={visibilita[campo]} onClick={() => toggleVis(campo)} />
                    </div>
                  ))}
                </div>
              </div>
              {/* Gamification */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Sparkles size={20} className="text-amber-400" /> Gamification</h3>
                </div>
                <div className="p-card-inner">
                  <div className="flex items-center justify-between px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <span className="text-sm flex items-center gap-2">✨ Partecipa a classifiche e badge</span>
                    <Toggle attivo={gamificationAttiva} onClick={async () => {
                      const nv = !gamificationAttiva; setGamificationAttiva(nv);
                      try { const r = await api.patch('/utenti/profilo', { gamificationAttiva: nv }); aggiornaUtente(r.dati); }
                      catch { setGamificationAttiva(!nv); }
                    }} />
                  </div>
                  <p className="text-[10px] text-[var(--testo-terziario)] mt-2 px-1">
                    {gamificationAttiva ? 'Punti esperienza, livelli e classifiche sono attivi.' : 'Gamification disattivata — non apparirai nelle classifiche. Puoi riattivare in qualsiasi momento.'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: PERSONAL TRAINER */}
          {tabAttivo === 'pt' && (
            <motion.div key="pt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Dumbbell size={20} className="text-[var(--accent)]" /> Il tuo Personal Trainer</h3>
                </div>
                <div className="p-card-inner">
                  {mioPT === undefined ? (
                    <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
                  ) : mioPT === null ? (
                    <div>
                      <p className="text-sm text-[var(--testo-secondario)] mb-4">Non sei iscritto presso nessun Personal Trainer.</p>
                      {!mostraListaPT ? (
                        <button onClick={async () => {
                          setMostraListaPT(true);
                          try { const r = await api.get('/utenti/personal-trainers'); setListaTrainers(r.dati || []); } catch { setListaTrainers([]); }
                        }} className="btn-primario text-sm !py-2">🔍 Cerca un Personal Trainer</button>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {listaTrainers.length === 0 ? (
                            <p className="text-sm text-[var(--testo-terziario)]">Nessun PT disponibile al momento.</p>
                          ) : listaTrainers.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 px-card-inner py-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] border border-[var(--bordo)]">
                              <Link to={`/trainer/${pt.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 overflow-hidden"
                                     style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                  {pt.immagineProfilo ? <img src={pt.immagineProfilo} className="w-full h-full object-cover" /> : pt.nome?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm truncate">{pt.nome}</p>
                                  <p className="text-xs text-[var(--testo-terziario)]">{pt._count?.clientiComePT || 0} clienti · {pt._count?.schedeCreate || 0} schede</p>
                                  {pt.bio && <p className="text-xs text-[var(--testo-secondario)] mt-0.5 line-clamp-1">{pt.bio}</p>}
                                </div>
                              </Link>
                              <button onClick={async () => {
                                try { setInviandoPT(true); await api.post('/utenti/iscrizione-pt', { trainerId: pt.id, messaggio: messaggioPT || null }); const r = await api.get('/utenti/mio-pt'); setMioPT(r.dati); setMostraListaPT(false); }
                                catch (err) { alert(err.message); } finally { setInviandoPT(false); }
                              }} disabled={inviandoPT} className="px-4 py-2 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--accent)] text-white shrink-0">Iscriviti</button>
                            </div>
                          ))}
                          <button onClick={() => setMostraListaPT(false)} className="text-xs text-[var(--testo-terziario)] mt-1">← Chiudi</button>
                        </div>
                      )}
                    </div>
                  ) : mioPT.stato === 'IN_ATTESA' ? (
                    <div className="flex items-center gap-4 p-card-inner rounded-[var(--raggio-md)] bg-[var(--avviso-dim)] border border-[var(--avviso)]">
                      <span className="text-3xl">⏳</span>
                      <div className="flex-1">
                        <p className="font-bold text-sm">Richiesta in attesa</p>
                        <p className="text-xs text-[var(--testo-secondario)]">In attesa di risposta da {mioPT.trainer?.nome}</p>
                      </div>
                      <button onClick={async () => {
                        if (!confirm('Annullare la richiesta?')) return;
                        try { await api.delete('/utenti/iscrizione-pt'); setMioPT(null); } catch (err) { alert(err.message); }
                      }} className="text-xs text-[var(--pericolo)] font-bold">Annulla</button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-4 p-card-inner rounded-[var(--raggio-md)] bg-[var(--successo-dim)] border border-[var(--successo)]">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden"
                             style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          {mioPT.trainer?.immagineProfilo ? <img src={mioPT.trainer.immagineProfilo} className="w-full h-full object-cover" /> : mioPT.trainer?.nome?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-lg">{mioPT.trainer?.nome}</p>
                          <p className="text-xs text-[var(--testo-secondario)]">{mioPT.trainer?._count?.clientiComePT || 0} clienti</p>
                        </div>
                        <span className="badge successo">Attivo</span>
                      </div>
                      <button onClick={async () => {
                        if (!confirm('Terminare il rapporto con il tuo PT?')) return;
                        try { await api.delete('/utenti/iscrizione-pt'); setMioPT(null); } catch (err) { alert(err.message); }
                      }} className="text-xs text-[var(--pericolo)] hover:underline mt-3 block">Termina iscrizione</button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: SICUREZZA */}
          {tabAttivo === 'sicurezza' && (
            <motion.div key="sicurezza" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {/* Cambio Password */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Lock size={20} className="text-[var(--accent)]" /> Cambia Password</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-3">
                  <input type="password" value={pwForm.vecchia} onChange={e => setPwForm(p => ({...p, vecchia: e.target.value}))} className="campo-input" placeholder="Password attuale" autoComplete="current-password" />
                  <input type="password" value={pwForm.nuova} onChange={e => setPwForm(p => ({...p, nuova: e.target.value}))} className="campo-input" placeholder="Nuova password (min 8 caratteri)" autoComplete="new-password" />
                  <input type="password" value={pwForm.conferma} onChange={e => setPwForm(p => ({...p, conferma: e.target.value}))} className="campo-input" placeholder="Conferma nuova password" autoComplete="new-password" />
                  {pwMsg.testo && <p className={`text-sm font-medium ${pwMsg.tipo === 'ok' ? 'text-[var(--successo)]' : 'text-[var(--pericolo)]'}`}>{pwMsg.testo}</p>}
                  <button onClick={cambiaPw} disabled={pwSalvando || !pwForm.vecchia || !pwForm.nuova || !pwForm.conferma}
                          className="btn-secondario disabled:opacity-50">{pwSalvando ? 'Aggiornamento...' : '🔑 Aggiorna Password'}</button>
                </div>
              </div>
              {/* Bot Telegram */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2">📲 Bot Telegram</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-3">
                  <p className="text-sm text-[var(--testo-secondario)]">
                    Collega il tuo account al bot Telegram per leggere le tue schede e crearne di nuove parlando con l'assistente direttamente in chat.
                  </p>
                  {telegram?.collegato ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[var(--successo)]">✅ Account collegato</span>
                      <button onClick={scollegaTelegram} disabled={tgLoading}
                              className="btn-secondario text-sm disabled:opacity-50" style={{ borderColor: 'var(--pericolo)', color: 'var(--pericolo)' }}>
                        {tgLoading ? '...' : 'Scollega'}
                      </button>
                    </div>
                  ) : telegramCodice ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-[var(--testo-secondario)]">Apri il bot e invia questo codice (valido 10 minuti):</p>
                      <div className="text-2xl font-mono font-bold text-center tracking-[0.3em] text-[var(--accent)] bg-[var(--bg-terziario)] rounded-lg py-3">
                        {telegramCodice.codice}
                      </div>
                      {telegramCodice.deepLink && (
                        <a href={telegramCodice.deepLink} target="_blank" rel="noreferrer"
                           className="btn-primario text-center flex items-center justify-center gap-2">
                          <ExternalLink size={16} /> Apri il bot e collega
                        </a>
                      )}
                      <button onClick={generaCodiceTelegram} disabled={tgLoading}
                              className="text-xs text-[var(--testo-terziario)] underline self-center">Genera nuovo codice</button>
                    </div>
                  ) : (
                    <button onClick={generaCodiceTelegram} disabled={tgLoading}
                            className="btn-secondario disabled:opacity-50">{tgLoading ? 'Generazione...' : '🔗 Collega Telegram'}</button>
                  )}
                </div>
              </div>
              {/* Reset Statistiche */}
              <div className="glass-card overflow-hidden border border-[var(--pericolo-dim)]">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg text-[var(--pericolo)] flex items-center gap-2"><AlertCircle size={20} /> Gestione Dati</h3>
                </div>
                <div className="p-card-inner">
                  <p className="text-sm text-[var(--testo-secondario)] mb-4">Azzera tutte le tue statistiche (sessioni e record). Le schede verranno mantenute.</p>
                  {!mostraReset ? (
                    <button onClick={() => setMostraReset(true)} className="btn-secondario text-sm" style={{ borderColor: 'var(--pericolo)', color: 'var(--pericolo)' }}>⚠️ Resetta Statistiche</button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-[var(--testo-terziario)]">Digita <strong>CONFERMO</strong> per procedere.</p>
                      <input type="text" value={confermaReset} onChange={e => setConfermaReset(e.target.value)} placeholder="CONFERMO"
                             className="campo-input text-center text-[var(--pericolo)] font-bold" />
                      <div className="flex gap-2">
                        <button onClick={() => { setMostraReset(false); setConfermaReset(''); }} className="flex-1 py-2 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">Annulla</button>
                        <button onClick={eseguiReset} disabled={confermaReset !== 'CONFERMO' || avviandoReset}
                                className="flex-1 py-2 rounded-lg bg-[var(--pericolo)] text-white disabled:opacity-50">{avviandoReset ? 'Reset...' : 'Resetta'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: FATTURAZIONE */}
          {tabAttivo === 'fatturazione' && (
            <motion.div key="fatturazione" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><CreditCard size={20} className="text-[var(--accent)]" /> Fatturazione</h3>
                </div>
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-3xl mx-auto mb-4">🚧</div>
                  <h4 className="font-bold text-lg mb-2">In Lavorazione</h4>
                  <p className="text-sm text-[var(--testo-terziario)] max-w-xs mx-auto">Questa sezione è attualmente in fase di sviluppo. Sarà disponibile a breve con funzionalità di fatturazione e gestione abbonamenti.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 6: LEGAL & COMPLIANCE */}
          {tabAttivo === 'legale' && (
            <motion.div key="legale" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {/* Documenti legali */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={20} className="text-[var(--accent)]" /> Documenti Legali</h3>
                </div>
                <div className="flex flex-col">
                  {[
                    { label: 'Termini e Condizioni', link: '/termini', icona: '📄' },
                    { label: 'Informativa sulla Privacy', link: '/privacy', icona: '🔐' },
                    { label: 'Cookie Policy', link: '/cookie-policy', icona: '🍪' },
                  ].map((doc, i, arr) => (
                    <a key={i} href={doc.link} target="_blank" rel="noopener noreferrer"
                       className={`flex items-center justify-between px-card-inner border-b border-[var(--bordo-light)] last:border-0 hover:bg-[var(--bg-terziario)] transition-colors group py-5 ${i === arr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <span className="text-sm font-medium flex items-center gap-2">{doc.icona} {doc.label}</span>
                      <ExternalLink size={16} className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
              {/* Info App */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2">🏋️ Info Applicazione</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-card-inner py-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] gap-1 sm:gap-4">
                    <span className="text-xs font-semibold text-[var(--testo-primario)]">Versione</span>
                    <span className="text-xs text-[var(--testo-secondario)] text-left sm:text-right">App v{__APP_VERSION__} · Server v{infoApp?.versione || '...'} · Build {infoApp?.build || '...'}</span>
                  </div>
                  {infoApp?.nodeVersion && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-card-inner py-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] gap-1 sm:gap-4">
                      <span className="text-xs font-semibold text-[var(--testo-primario)]">Node.js Runtime</span>
                      <span className="text-xs text-[var(--testo-secondario)] text-left sm:text-right">{infoApp.nodeVersion}</span>
                    </div>
                  )}
                  {infoApp?.stack && Object.entries(infoApp.stack).map(([k, v]) => (
                    <div key={k} className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-card-inner py-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] gap-1 sm:gap-4">
                      <span className="text-xs font-semibold text-[var(--testo-primario)] capitalize">{k}</span>
                      <span className="text-xs text-[var(--testo-secondario)] text-left sm:text-right">{v}</span>
                    </div>
                  ))}
                  {/* Developer */}
                  <div className="mt-2 pt-4 border-t border-[var(--bordo)]">
                    <a href="https://github.com/giosci1994/" target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-3 px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] hover:bg-[rgba(255,255,255,0.08)] transition-all group cursor-pointer">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[var(--bordo)] group-hover:border-[var(--accent)] transition-colors shadow-lg">
                        <img src="https://github.com/giosci1994.png" alt="Developer" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold group-hover:text-[var(--accent)] transition-colors">giosci1994</p>
                        <p className="text-[10px] text-[var(--testo-terziario)]">Sviluppatore & Creatore</p>
                      </div>
                      <svg className="w-5 h-5 text-[var(--testo-terziario)] group-hover:text-[var(--testo-primario)] transition-colors shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 7: ELIMINA ACCOUNT */}
          {tabAttivo === 'elimina' && (
            <motion.div key="elimina" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden border border-[var(--pericolo)]">
                <div className="p-card-inner border-b border-[var(--pericolo-dim)]">
                  <h3 className="font-bold text-lg text-[var(--pericolo)] flex items-center gap-2"><Trash2 size={20} /> Elimina Account</h3>
                </div>
                <div className="p-card-inner">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--pericolo-dim)] mb-4">
                    <AlertCircle size={20} className="text-[var(--pericolo)] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[var(--pericolo)]">Attenzione: questa azione è irreversibile</p>
                      <p className="text-xs text-[var(--testo-secondario)] mt-1">Eliminando il tuo account perderai definitivamente tutti i tuoi dati: schede, allenamenti, statistiche, messaggi e progressi. Questa azione non può essere annullata.</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--testo-terziario)] mb-3">Per procedere, scrivi <strong>ELIMINA IL MIO ACCOUNT</strong> nel campo sottostante.</p>
                  <input type="text" value={confermaElimina} onChange={e => setConfermaElimina(e.target.value)} placeholder="ELIMINA IL MIO ACCOUNT"
                         className="campo-input text-center text-[var(--pericolo)] font-bold mb-4" />
                  <div className="flex gap-3">
                    <button onClick={() => setConfermaElimina('')} className="flex-1 py-2.5 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium">Annulla</button>
                    <button disabled={confermaElimina !== 'ELIMINA IL MIO ACCOUNT' || eliminando}
                            onClick={async () => {
                              try { setEliminando(true); /* TODO: API eliminazione account */ alert('Funzionalità in fase di implementazione.'); }
                              catch (err) { alert(err.message); } finally { setEliminando(false); }
                            }}
                            className="flex-1 py-2.5 rounded-lg bg-[var(--pericolo)] text-white font-bold disabled:opacity-50">
                      {eliminando ? 'Eliminazione...' : '🗑️ Elimina Definitivamente'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>



      </motion.div>

      {fotoDaRitagliare && (
        <RitaglioFoto
          immagine={fotoDaRitagliare}
          onAnnulla={() => setFotoDaRitagliare(null)}
          onConferma={confermaRitaglio}
        />
      )}
    </div>
  );
}
