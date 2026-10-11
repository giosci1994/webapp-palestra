// ============================================
// GymMaster — Profile page (Full Restyling)
// Hero Card + Tab System (8 sections)
// ============================================

import { useAuth } from '../contesti/AuthContesto.jsx';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';
import { api, scaricaFile } from '../config/api.js';
import { RUOLI } from '../utils/costanti.js';
import { formattaData, formattaDataRelativa } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { Link, useSearchParams } from 'react-router-dom';
import RitaglioFoto from '../componenti/comuni/RitaglioFoto.jsx';
import { useState, useRef, useEffect, useEffectEvent } from 'react';
import {
  User, Shield, Dumbbell, Lock, CreditCard, FileText, Trash2,
  Sparkles, AlertCircle, ExternalLink, Building, LogOut,
  Pencil, Download, Smartphone, Monitor, KeyRound, Bell
} from 'lucide-react';
import ImpostazioniNotifiche from '../componenti/specifici/ImpostazioniNotifiche.jsx';
import SceltaLingua from '../componenti/specifici/SceltaLingua.jsx';

// `v` is the value saved on the account, `chiave` the translation key of its label
const OBIETTIVI = [
  { v: 'Massa Muscolare', chiave: 'profilo.obiettivi.massaMuscolare' },
  { v: 'Definizione', chiave: 'profilo.obiettivi.definizione' },
  { v: 'Resistenza', chiave: 'profilo.obiettivi.resistenza' },
  { v: 'Salute Generale', chiave: 'profilo.obiettivi.saluteGenerale' },
  { v: 'Perdita Peso', chiave: 'profilo.obiettivi.perditaPeso' }
];
const GENERI = [
  { v: 'M', chiave: 'profilo.generi.M' },
  { v: 'F', chiave: 'profilo.generi.F' },
  { v: 'Altro', chiave: 'profilo.generi.Altro' }
];
const VIS_DEFAULT = { palestra: true, peso: false, altezza: false, eta: false, obiettivo: true, statistiche: false, record: true };

// `chiave` is the translation key of the tab's name
const TABS = [
  { id: 'profilo', chiave: 'profilo.tab.profilo', icona: User },
  { id: 'notifiche', chiave: 'profilo.tab.notifiche', icona: Bell },
  { id: 'privacy', chiave: 'profilo.tab.privacy', icona: Shield },
  { id: 'pt', chiave: 'profilo.tab.pt', icona: Dumbbell },
  { id: 'sicurezza', chiave: 'profilo.tab.sicurezza', icona: Lock },
  { id: 'fatturazione', chiave: 'profilo.tab.fatturazione', icona: CreditCard },
  { id: 'legale', chiave: 'profilo.tab.legale', icona: FileText },
  { id: 'elimina', chiave: 'profilo.tab.elimina', icona: Trash2 },
];

/**
 * On/off switch. Outside Profilo: declared inside it, it would be a new
 * component on every render, recreated from scratch, and the knob would not slide.
 */
function Toggle({ attivo, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${attivo ? 'bg-[var(--accent)]' : 'bg-[var(--bordo)]'}`}>
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${attivo ? 'left-[26px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function Profilo() {
  const { t } = useLingua();
  const { utente, logout, aggiornaUtente } = useAuth();
  const [richiedendoPT, setRichiedendoPT] = useState(false);
  const [fotoDaRitagliare, setFotoDaRitagliare] = useState(null);
  const fileRef = useRef(null);
  // The visible tabs; the initial one can be picked from the address,
  // for example /profilo?tab=sicurezza
  const tabVisibili = TABS.filter(tab => tab.id !== 'pt' || utente?.ruolo === 'UTENTE');
  const [parametri] = useSearchParams();
  const [tabAttivo, setTabAttivo] = useState(() => {
    const richiesta = parametri.get('tab');
    return tabVisibili.some(tab => tab.id === richiesta) ? richiesta : 'profilo';
  });

  // Profile data form
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

  // Password change
  const [pwForm, setPwForm] = useState({ vecchia: '', nuova: '', conferma: '' });
  const [pwSalvando, setPwSalvando] = useState(false);
  const [pwMsg, setPwMsg] = useState({ testo: '', tipo: '' });

  // Statistics reset
  const [mostraReset, setMostraReset] = useState(false);
  const [confermaReset, setConfermaReset] = useState('');
  const [avviandoReset, setAvviandoReset] = useState(false);

  // App info
  const [infoApp, setInfoApp] = useState(null);

  // Telegram
  const [telegram, setTelegram] = useState(null);
  const [telegramCodice, setTelegramCodice] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);

  // Personal Trainer
  const [mioPT, setMioPT] = useState(undefined);
  const [listaTrainers, setListaTrainers] = useState([]);
  const [mostraListaPT, setMostraListaPT] = useState(false);
  const [inviandoPT, setInviandoPT] = useState(false);
  const [messaggioPT, setMessaggioPT] = useState('');

  // Connected devices (Security)
  const [sessioni, setSessioni] = useState(null);
  const [erroreSessioni, setErroreSessioni] = useState('');

  // Passkeys (Security)
  const [passkeySupportate] = useState(() => browserSupportsWebAuthn());
  const [passkey, setPasskey] = useState(null);
  const [passwordPasskey, setPasswordPasskey] = useState('');
  const [aggiungendoPasskey, setAggiungendoPasskey] = useState(false);
  const [msgPasskey, setMsgPasskey] = useState({ testo: '', tipo: '' });

  // Data export (Privacy, and before deleting the account)
  const [scaricandoDati, setScaricandoDati] = useState(false);
  const [erroreDati, setErroreDati] = useState('');

  // Account deletion
  const [confermaElimina, setConfermaElimina] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [passwordElimina, setPasswordElimina] = useState('');
  const [erroreElimina, setErroreElimina] = useState('');

  // Gyms
  const [listaPalestre, setListaPalestre] = useState([]);

  /** Download the JSON file with all the account's data */
  const scaricaDati = async () => {
    setErroreDati('');
    setScaricandoDati(true);
    try {
      await scaricaFile('/utenti/esportazione', 'gymmaster-dati.json');
    } catch (err) {
      setErroreDati(err?.message || t('profilo.esportazione.errore'));
    } finally {
      setScaricandoDati(false);
    }
  };

  // The form starts again from the user's data every time they change:
  // it realigns during render, without an effect and an extra render
  const [utenteDelModulo, setUtenteDelModulo] = useState(null);
  if (utente && utente !== utenteDelModulo) {
    setUtenteDelModulo(utente);
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

  useEffect(() => {
    api.get('/utenti/mio-pt').then(r => setMioPT(r.dati)).catch(() => setMioPT(null));
    api.get('/palestre').then(r => setListaPalestre(r.dati || [])).catch(() => setListaPalestre([]));
  }, [utente]);

  // --- Avatar (manual crop + automatic compression) ---
  const gestisciImmagine = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoDaRitagliare(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // lets the user pick the same file again
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
      setMsgSalvataggio(t('profilo.dati.salvato'));
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

  const caricaSessioni = () => api.get('/auth/sessioni')
    .then(r => { setErroreSessioni(''); setSessioni(r.dati); })
    .catch(err => { setErroreSessioni(err.message); setSessioni([]); });

  const scollegaDispositivo = async (famiglia) => {
    try { await api.delete(`/auth/sessioni/${famiglia}`); }
    catch (err) { setErroreSessioni(err.message); }
    caricaSessioni();
  };

  const scollegaAltri = async () => {
    try { await api.post('/auth/sessioni/chiudi-altre'); }
    catch (err) { setErroreSessioni(err.message); }
    caricaSessioni();
  };

  const caricaPasskey = () => api.get('/auth/passkey')
    .then(r => setPasskey(r.dati))
    .catch(err => { setMsgPasskey({ testo: err.message, tipo: 'err' }); setPasskey([]); });

  /** Password, then the gesture on the device (fingerprint, face or PIN) */
  const aggiungiPasskey = async () => {
    setMsgPasskey({ testo: '', tipo: '' });
    setAggiungendoPasskey(true);
    try {
      const { dati: sfida } = await api.post('/auth/passkey/registrazione/opzioni', { password: passwordPasskey });
      const risposta = await startRegistration({ optionsJSON: sfida.opzioni });
      await api.post('/auth/passkey/registrazione/verifica', { id: sfida.id, risposta });
      setPasswordPasskey('');
      setMsgPasskey({ testo: t('profilo.passkey.aggiunta'), tipo: 'ok' });
      caricaPasskey();
    } catch (err) {
      const messaggio = {
        NotAllowedError: t('profilo.passkey.annullata'),
        InvalidStateError: t('profilo.passkey.giaPresente')
      }[err?.name] || err.message;
      setMsgPasskey({ testo: messaggio, tipo: 'err' });
    } finally {
      setAggiungendoPasskey(false);
    }
  };

  const eliminaPasskey = async (id) => {
    if (!confirm(t('profilo.passkey.confermaElimina'))) return;
    try { await api.delete(`/auth/passkey/${id}`); }
    catch (err) { setMsgPasskey({ testo: err.message, tipo: 'err' }); }
    caricaPasskey();
  };

  const caricaTelegram = () => {
    if (telegram) return;
    api.get('/utenti/telegram/stato')
      .then(r => setTelegram(r.dati))
      .catch(() => setTelegram({ collegato: false }));
  };

  const caricaInfoApp = () => {
    if (infoApp) return;
    api.get('/utenti/info-app')
      .then(r => setInfoApp(r.dati))
      .catch(() => setInfoApp({ versione: 'N/A', stack: {}, changelog: [] }));
  };

  /** The data a tab loads when it opens */
  const caricaTab = (id) => {
    if (id === 'legale') caricaInfoApp();
    if (id === 'sicurezza') { caricaTelegram(); caricaSessioni(); caricaPasskey(); }
  };

  // Opened from a link straight on a tab: its data loads right away
  const caricaTabIniziale = useEffectEvent(() => caricaTab(tabAttivo));
  useEffect(() => { caricaTabIniziale(); }, []);

  const cambiaPw = async () => {
    setPwMsg({ testo: '', tipo: '' });
    if (pwForm.nuova !== pwForm.conferma) return setPwMsg({ testo: t('profilo.password.nonCorrispondono'), tipo: 'err' });
    if (pwForm.nuova.length < 8) return setPwMsg({ testo: t('profilo.password.minimo'), tipo: 'err' });
    try {
      setPwSalvando(true);
      const r = await api.post('/utenti/cambia-password', { vecchiaPassword: pwForm.vecchia, nuovaPassword: pwForm.nuova });
      setPwMsg({ testo: r.messaggio || t('profilo.password.aggiornata'), tipo: 'ok' });
      setPwForm({ vecchia: '', nuova: '', conferma: '' });
      // The change signed out the other devices
      if (sessioni) caricaSessioni();
    } catch (err) { setPwMsg({ testo: err.message, tipo: 'err' }); }
    finally { setPwSalvando(false); }
  };

  const eseguiReset = async () => {
    if (confermaReset !== t('profilo.reset.frase')) return;
    try {
      setAvviandoReset(true);
      await api.post('/utenti/reset-statistiche');
      alert(t('profilo.reset.fatto')); window.location.reload();
    } catch (err) { alert(err.message); }
    finally { setAvviandoReset(false); setMostraReset(false); setConfermaReset(''); }
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
                <img src={avatarPreview} alt={t('profilo.avatar')} className="w-20 h-20 rounded-2xl object-cover border-2 border-[var(--accent)] shadow-lg" />
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
                <span className={`badge ${ruoloInfo.colore}`}>{t(ruoloInfo.label)}</span>
                <span className="text-[10px] text-[var(--testo-terziario)]">{t('profilo.dal', { data: formattaData(utente?.dataRegistrazione) })}</span>
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
            {/* The tabs are icons only: the name is for screen reader users and as a tooltip */}
            <div className="flex items-center gap-2 flex-1" role="tablist" aria-label={t('profilo.sezioni')}>
              {tabVisibili.map((tab) => (
                <button key={tab.id}
                  role="tab"
                  aria-selected={tabAttivo === tab.id}
                  aria-label={t(tab.chiave)}
                  title={t(tab.chiave)}
                  onClick={() => { setTabAttivo(tab.id); caricaTab(tab.id); }}
                  className={`flex items-center justify-center py-2.5 rounded-[14px] text-sm font-bold transition-all duration-300 whitespace-nowrap shrink-0 relative ${
                    tabAttivo === tab.id 
                      ? 'px-10 text-[var(--testo-primario)]' 
                      : 'px-5 text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[rgba(255,255,255,0.05)]'
                  } ${tab.id === 'elimina' && tabAttivo !== tab.id ? '!text-[var(--pericolo)] opacity-70 hover:opacity-100' : ''}`}>
                  
                  {/* Animated active background */}
                  {tabAttivo === tab.id && (
                    <motion.div layoutId="profiloTabBg" className="absolute inset-0 bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-[14px] shadow-sm z-0" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                  )}
                  
                  <div className="relative z-10 flex items-center justify-center">
                    <tab.icona size={20} className={`shrink-0 transition-transform duration-300 ${tabAttivo === tab.id && tab.id !== 'elimina' ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent-dim)] scale-125' : ''} ${tabAttivo === tab.id && tab.id === 'elimina' ? 'text-[var(--pericolo)] scale-125' : ''}`} />
                  </div>
                </button>
              ))}
            </div>

            {/* LOGOUT BUTTON (RIGHT SIDE) */}
            <div className="border-l border-[var(--vetro-bordo)] pl-2 shrink-0">
              <button 
                onClick={(e) => { e.preventDefault(); if (window.confirm(t('profilo.esci.conferma'))) logout(); }}
                className="flex items-center justify-center py-2.5 px-5 rounded-[14px] transition-all duration-300 text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)]"
                title={t('profilo.esci.titolo')}
                aria-label={t('profilo.esci.titolo')}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <AnimatePresence mode="wait">

          {/* TAB 1: PROFILE */}
          {tabAttivo === 'profilo' && (
            <motion.div key="profilo" className="flex flex-col gap-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)] flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2"><User size={20} className="text-[var(--accent)]" /> {t('profilo.dati.titolo')}</h3>
                  <button
                    type="button"
                    onClick={() => setModificaAbilitata(!modificaAbilitata)}
                    className={`p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center ${
                      modificaAbilitata
                        ? 'bg-[var(--accent-dim)] text-[var(--accent)] scale-110 shadow-sm border border-[var(--accent)]/20'
                        : 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] hover:bg-[var(--bg-terziario)] border border-transparent'
                    }`}
                    title={modificaAbilitata ? t('profilo.dati.disabilitaModifiche') : t('profilo.dati.abilitaModifiche')}
                  >
                    <Pencil size={18} />
                  </button>
                </div>
                <div className="p-card-inner flex flex-col gap-4">
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.nome')}</label>
                    <input type="text" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} className="campo-input" placeholder={t('profilo.dati.nomePlaceholder')} disabled={!modificaAbilitata} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.dataNascita')}</label>
                      <input type="date" value={form.dataNascita} onChange={e => setForm(p => ({...p, dataNascita: e.target.value}))} className="campo-input" disabled={!modificaAbilitata} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.genere')}</label>
                      <select value={form.genere} onChange={e => setForm(p => ({...p, genere: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                        <option value="">—</option>
                        {GENERI.map(g => <option key={g.v} value={g.v}>{t(g.chiave)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.peso')}</label>
                      <input type="number" value={form.pesoKg} onChange={e => setForm(p => ({...p, pesoKg: e.target.value}))} className="campo-input" placeholder="75" step="0.1" min="0" inputMode="decimal" disabled={!modificaAbilitata} />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.altezza')}</label>
                      <input type="number" value={form.altezzaCm} onChange={e => setForm(p => ({...p, altezzaCm: e.target.value}))} className="campo-input" placeholder="175" min="0" inputMode="numeric" disabled={!modificaAbilitata} />
                    </div>
                  </div>
                  <Link to="/composizione" className="flex items-center justify-between px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors group">
                    <span className="text-sm font-semibold flex items-center gap-2">{t('profilo.dati.composizione')} <span className="text-xs font-normal text-[var(--testo-terziario)]">{t('profilo.dati.composizioneDettaglio')}</span></span>
                    <span className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors">→</span>
                  </Link>

                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1"><Building size={12} className="inline mr-1" />{t('profilo.dati.palestra')}</label>
                    <select value={form.palestraId} onChange={e => setForm(p => ({...p, palestraId: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                      <option value="">{t('profilo.dati.nessunaPalestra')}</option>
                      {listaPalestre.map(p => <option key={p.id} value={p.id}>{p.nomeCatena} — {p.indirizzo}, {p.citta}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.obiettivo')}</label>
                    <select value={form.obiettivoFitness} onChange={e => setForm(p => ({...p, obiettivoFitness: e.target.value}))} className="campo-input" disabled={!modificaAbilitata}>
                      <option value="">{t('profilo.dati.seleziona')}</option>
                      {OBIETTIVI.map(o => <option key={o.v} value={o.v}>{t(o.chiave)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('profilo.dati.bio')} <span className="text-[var(--testo-terziario)]">({(form.bio || '').length}/200)</span></label>
                    <textarea value={form.bio} onChange={e => setForm(p => ({...p, bio: e.target.value.slice(0, 200)}))}
                              className="campo-input min-h-[60px] resize-none" placeholder={t('profilo.dati.bioPlaceholder')} rows="2" disabled={!modificaAbilitata} />
                  </div>
                  <div className="flex items-center gap-3 pt-6 pb-2">
                    <button onClick={() => salvaProfilo()} disabled={!modificaAbilitata || salvando}
                            className="btn-primario flex-1 py-3 disabled:opacity-40">{salvando ? t('profilo.dati.salvataggio') : t('profilo.dati.salva')}</button>
                    {msgSalvataggio && <span className="text-sm font-medium">{msgSalvataggio}</span>}
                  </div>
                </div>
              </div>

              <SceltaLingua />

              {/* Professional account: become a Personal Trainer (standard users only) */}
              {utente?.ruolo === 'UTENTE' && (
                <div className="glass-card overflow-hidden">
                  <div className="p-card-inner border-b border-[var(--bordo-light)]">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Dumbbell size={20} className="text-[var(--accent)]" /> {t('profilo.professionale.titolo')}</h3>
                  </div>
                  <div className="p-card-inner">
                    {utente?.ruoloRichiesto === 'PERSONAL_TRAINER' ? (
                      <div className="flex items-center gap-4 p-card-inner rounded-[var(--raggio-md)] bg-[var(--avviso-dim)] border border-[var(--avviso)]">
                        <span className="text-3xl">⏳</span>
                        <div>
                          <p className="font-bold text-sm">{t('profilo.richiestaInAttesa')}</p>
                          <p className="text-xs text-[var(--testo-secondario)]">{t('profilo.professionale.inAttesaDettaglio')}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-[var(--testo-secondario)] mb-4"><Testo t="profilo.professionale.invito" componenti={{ b: <b /> }} /></p>
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
                          {richiedendoPT ? t('profilo.professionale.invio') : t('profilo.professionale.diventa')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: NOTIFICATIONS */}
          {tabAttivo === 'notifiche' && (
            <motion.div key="notifiche" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <ImpostazioniNotifiche />
            </motion.div>
          )}

          {/* TAB 3: PRIVACY */}
          {tabAttivo === 'privacy' && (
            <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Shield size={20} className="text-[var(--accent)]" /> {t('profilo.privacy.visibilitaTitolo')}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('profilo.privacy.visibilitaDescrizione')}</p>
                </div>
                <div className="p-card-inner flex flex-col gap-2">
                  {[
                    { campo: 'palestra', label: t('profilo.privacy.mostra.palestra'), icona: '🏢' },
                    { campo: 'peso', label: t('profilo.privacy.mostra.peso'), icona: '⚖️' },
                    { campo: 'altezza', label: t('profilo.privacy.mostra.altezza'), icona: '📏' },
                    { campo: 'eta', label: t('profilo.privacy.mostra.eta'), icona: '🎂' },
                    { campo: 'obiettivo', label: t('profilo.privacy.mostra.obiettivo'), icona: '🎯' },
                    { campo: 'statistiche', label: t('profilo.privacy.mostra.statistiche'), icona: '📊' },
                    { campo: 'record', label: t('profilo.privacy.mostra.record'), icona: '🏆' },
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
                  <h3 className="font-bold text-lg flex items-center gap-2"><Sparkles size={20} className="text-amber-400" /> {t('profilo.privacy.gamification')}</h3>
                </div>
                <div className="p-card-inner">
                  <div className="flex items-center justify-between px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <span className="text-sm flex items-center gap-2">{t('profilo.privacy.gamificationPartecipa')}</span>
                    <Toggle attivo={gamificationAttiva} onClick={async () => {
                      const nv = !gamificationAttiva; setGamificationAttiva(nv);
                      try { const r = await api.patch('/utenti/profilo', { gamificationAttiva: nv }); aggiornaUtente(r.dati); }
                      catch { setGamificationAttiva(!nv); }
                    }} />
                  </div>
                  <p className="text-[10px] text-[var(--testo-terziario)] mt-2 px-1">
                    {gamificationAttiva ? t('profilo.privacy.gamificationAttiva') : t('profilo.privacy.gamificationDisattivata')}
                  </p>
                </div>
              </div>
              {/* Your data */}
              <div className="glass-card overflow-hidden mt-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Download size={20} className="text-[var(--accent)]" /> {t('profilo.esportazione.titolo')}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('profilo.esportazione.descrizione')}</p>
                </div>
                <div className="p-card-inner">
                  <button onClick={scaricaDati} disabled={scaricandoDati} className="btn-primario w-full disabled:opacity-50">
                    {scaricandoDati ? t('profilo.esportazione.preparazione') : t('profilo.esportazione.scarica')}
                  </button>
                  {erroreDati && <p className="text-xs text-[var(--pericolo)] mt-2">{erroreDati}</p>}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: PERSONAL TRAINER */}
          {tabAttivo === 'pt' && (
            <motion.div key="pt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Dumbbell size={20} className="text-[var(--accent)]" /> {t('profilo.pt.titolo')}</h3>
                </div>
                <div className="p-card-inner">
                  {mioPT === undefined ? (
                    <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
                  ) : mioPT === null ? (
                    <div>
                      <p className="text-sm text-[var(--testo-secondario)] mb-4">{t('profilo.pt.nonIscritto')}</p>
                      {!mostraListaPT ? (
                        <button onClick={async () => {
                          setMostraListaPT(true);
                          try { const r = await api.get('/utenti/personal-trainers'); setListaTrainers(r.dati || []); } catch { setListaTrainers([]); }
                        }} className="btn-primario text-sm !py-2">{t('profilo.pt.cerca')}</button>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {listaTrainers.length > 0 && (
                            <div>
                              <textarea value={messaggioPT} onChange={e => setMessaggioPT(e.target.value)} maxLength={500} rows={2}
                                        className="campo-input text-sm resize-none" placeholder={t('profilo.pt.messaggioPlaceholder')} />
                              <p className="text-[10px] text-[var(--testo-terziario)] mt-1 px-1">{t('profilo.pt.messaggioNota')}</p>
                            </div>
                          )}
                          {listaTrainers.length === 0 ? (
                            <p className="text-sm text-[var(--testo-terziario)]">{t('profilo.pt.nessuno')}</p>
                          ) : listaTrainers.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 px-card-inner py-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] border border-[var(--bordo)]">
                              <Link to={`/trainer/${pt.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 overflow-hidden"
                                     style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                  {pt.immagineProfilo ? <img src={pt.immagineProfilo} className="w-full h-full object-cover" /> : pt.nome?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm truncate">{pt.nome}</p>
                                  <p className="text-xs text-[var(--testo-terziario)]">{t('profilo.pt.clienti', { count: pt._count?.clientiComePT || 0 })} · {t('profilo.pt.schede', { count: pt._count?.schedeCreate || 0 })}</p>
                                  {pt.bio && <p className="text-xs text-[var(--testo-secondario)] mt-0.5 line-clamp-1">{pt.bio}</p>}
                                </div>
                              </Link>
                              <button onClick={async () => {
                                try { setInviandoPT(true); await api.post('/utenti/iscrizione-pt', { trainerId: pt.id, messaggio: messaggioPT.trim() || null }); const r = await api.get('/utenti/mio-pt'); setMioPT(r.dati); setMostraListaPT(false); setMessaggioPT(''); }
                                catch (err) { alert(err.message); } finally { setInviandoPT(false); }
                              }} disabled={inviandoPT} className="px-4 py-2 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--accent)] text-white shrink-0">{t('profilo.pt.iscriviti')}</button>
                            </div>
                          ))}
                          <button onClick={() => setMostraListaPT(false)} className="text-xs text-[var(--testo-terziario)] mt-1">← {t('comune.chiudi')}</button>
                        </div>
                      )}
                    </div>
                  ) : mioPT.stato === 'IN_ATTESA' ? (
                    <div className="flex items-center gap-4 p-card-inner rounded-[var(--raggio-md)] bg-[var(--avviso-dim)] border border-[var(--avviso)]">
                      <span className="text-3xl">⏳</span>
                      <div className="flex-1">
                        <p className="font-bold text-sm">{t('profilo.richiestaInAttesa')}</p>
                        <p className="text-xs text-[var(--testo-secondario)]">{t('profilo.pt.attesaRisposta', { nome: mioPT.trainer?.nome })}</p>
                      </div>
                      <button onClick={async () => {
                        if (!confirm(t('profilo.pt.confermaAnnullaRichiesta'))) return;
                        try { await api.delete('/utenti/iscrizione-pt'); setMioPT(null); } catch (err) { alert(err.message); }
                      }} className="text-xs text-[var(--pericolo)] font-bold">{t('comune.annulla')}</button>
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
                          <p className="text-xs text-[var(--testo-secondario)]">{t('profilo.pt.clienti', { count: mioPT.trainer?._count?.clientiComePT || 0 })}</p>
                        </div>
                        <span className="badge successo">{t('profilo.pt.attivo')}</span>
                      </div>
                      <button onClick={async () => {
                        if (!confirm(t('profilo.pt.confermaTermina'))) return;
                        try { await api.delete('/utenti/iscrizione-pt'); setMioPT(null); } catch (err) { alert(err.message); }
                      }} className="text-xs text-[var(--pericolo)] hover:underline mt-3 block">{t('profilo.pt.termina')}</button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: SECURITY */}
          {tabAttivo === 'sicurezza' && (
            <motion.div key="sicurezza" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {/* Password change */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Lock size={20} className="text-[var(--accent)]" /> {t('profilo.password.titolo')}</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-3">
                  <input type="password" value={pwForm.vecchia} onChange={e => setPwForm(p => ({...p, vecchia: e.target.value}))} className="campo-input" placeholder={t('profilo.password.attuale')} autoComplete="current-password" />
                  <input type="password" value={pwForm.nuova} onChange={e => setPwForm(p => ({...p, nuova: e.target.value}))} className="campo-input" placeholder={t('profilo.password.nuova')} autoComplete="new-password" />
                  <input type="password" value={pwForm.conferma} onChange={e => setPwForm(p => ({...p, conferma: e.target.value}))} className="campo-input" placeholder={t('profilo.password.conferma')} autoComplete="new-password" />
                  {pwMsg.testo && <p className={`text-sm font-medium ${pwMsg.tipo === 'ok' ? 'text-[var(--successo)]' : 'text-[var(--pericolo)]'}`}>{pwMsg.testo}</p>}
                  <button onClick={cambiaPw} disabled={pwSalvando || !pwForm.vecchia || !pwForm.nuova || !pwForm.conferma}
                          className="btn-secondario disabled:opacity-50">{pwSalvando ? t('profilo.password.aggiornamento') : t('profilo.password.aggiorna')}</button>
                  <p className="text-[10px] text-[var(--testo-terziario)] px-1">{t('profilo.password.nota')}</p>
                </div>
              </div>
              {/* Connected devices */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Smartphone size={20} className="text-[var(--accent)]" /> {t('profilo.dispositivi.titolo')}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('profilo.dispositivi.descrizione')}</p>
                </div>
                <div className="p-card-inner flex flex-col gap-2">
                  {sessioni === null && <p className="text-sm text-[var(--testo-terziario)]">{t('comune.caricamento')}</p>}
                  {sessioni?.map(s => (
                    <div key={s.famiglia} className="flex items-center justify-between gap-3 px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                      <div className="flex items-center gap-3 min-w-0">
                        {/Android|iPhone|iPad/.test(s.dispositivo || '')
                          ? <Smartphone size={18} className="shrink-0 text-[var(--testo-secondario)]" />
                          : <Monitor size={18} className="shrink-0 text-[var(--testo-secondario)]" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {s.dispositivo || t('profilo.dispositivi.sconosciuto')}
                            {s.corrente && <span className="ml-2 text-[10px] font-bold text-[var(--accent)]">{t('profilo.dispositivi.questo')}</span>}
                          </p>
                          <p className="text-[11px] text-[var(--testo-terziario)]">{t('profilo.dispositivi.dettaglio', { data: formattaData(s.iniziataIl), ultimoUso: formattaDataRelativa(s.ultimoUso) })}</p>
                        </div>
                      </div>
                      {!s.corrente && (
                        <button onClick={() => scollegaDispositivo(s.famiglia)} className="btn-secondario text-sm !py-1.5 shrink-0">{t('profilo.dispositivi.esci')}</button>
                      )}
                    </div>
                  ))}
                  {sessioni?.some(s => !s.corrente) && (
                    <button onClick={scollegaAltri} className="btn-secondario text-sm mt-1">{t('profilo.dispositivi.esciAltri')}</button>
                  )}
                  {erroreSessioni && <p className="text-xs text-[var(--pericolo)]">{erroreSessioni}</p>}
                </div>
              </div>
              {/* Passkeys */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><KeyRound size={20} className="text-[var(--accent)]" /> {t('profilo.passkey.titolo')}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('profilo.passkey.descrizione')}</p>
                </div>
                <div className="p-card-inner flex flex-col gap-2">
                  {passkey?.length === 0 && <p className="text-sm text-[var(--testo-terziario)]">{t('profilo.passkey.nessuna')}</p>}
                  {passkey?.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.nome || t('profilo.passkey.nomePredefinito')}
                          {p.sincronizzata && <span className="ml-2 text-[10px] text-[var(--testo-terziario)]">{t('profilo.passkey.sincronizzata')}</span>}
                        </p>
                        <p className="text-[11px] text-[var(--testo-terziario)]">
                          {p.ultimoUso
                            ? t('profilo.passkey.aggiuntaUsata', { data: formattaData(p.creataIl), ultimoUso: formattaDataRelativa(p.ultimoUso) })
                            : t('profilo.passkey.aggiuntaMaiUsata', { data: formattaData(p.creataIl) })}
                        </p>
                      </div>
                      <button onClick={() => eliminaPasskey(p.id)} className="btn-secondario text-sm !py-1.5 shrink-0">{t('comune.elimina')}</button>
                    </div>
                  ))}
                  {passkeySupportate ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <input type="password" value={passwordPasskey} onChange={e => setPasswordPasskey(e.target.value)}
                             className="campo-input" placeholder={t('profilo.passkey.passwordPlaceholder')} autoComplete="current-password" />
                      <button onClick={aggiungiPasskey} disabled={!passwordPasskey || aggiungendoPasskey} className="btn-secondario disabled:opacity-50">
                        {aggiungendoPasskey ? t('profilo.passkey.istruzioni') : t('profilo.passkey.aggiungi')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--testo-terziario)]">{t('profilo.passkey.nonSupportate')}</p>
                  )}
                  {msgPasskey.testo && (
                    <p className={`text-xs ${msgPasskey.tipo === 'ok' ? 'text-[var(--successo)]' : 'text-[var(--pericolo)]'}`}>{msgPasskey.testo}</p>
                  )}
                </div>
              </div>
              {/* Telegram bot */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2">{t('profilo.telegram.titolo')}</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-3">
                  <p className="text-sm text-[var(--testo-secondario)]">
                    {t('profilo.telegram.descrizione')}
                  </p>
                  {telegram?.collegato ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[var(--successo)]">{t('profilo.telegram.collegato')}</span>
                      <button onClick={scollegaTelegram} disabled={tgLoading}
                              className="btn-secondario text-sm disabled:opacity-50" style={{ borderColor: 'var(--pericolo)', color: 'var(--pericolo)' }}>
                        {tgLoading ? '...' : t('profilo.telegram.scollega')}
                      </button>
                    </div>
                  ) : telegramCodice ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-[var(--testo-secondario)]">{t('profilo.telegram.invia')}</p>
                      <div className="text-2xl font-mono font-bold text-center tracking-[0.3em] text-[var(--accent)] bg-[var(--bg-terziario)] rounded-lg py-3">
                        {telegramCodice.codice}
                      </div>
                      {telegramCodice.deepLink && (
                        <a href={telegramCodice.deepLink} target="_blank" rel="noreferrer"
                           className="btn-primario text-center flex items-center justify-center gap-2">
                          <ExternalLink size={16} /> {t('profilo.telegram.apri')}
                        </a>
                      )}
                      <button onClick={generaCodiceTelegram} disabled={tgLoading}
                              className="text-xs text-[var(--testo-terziario)] underline self-center">{t('profilo.telegram.nuovoCodice')}</button>
                    </div>
                  ) : (
                    <button onClick={generaCodiceTelegram} disabled={tgLoading}
                            className="btn-secondario disabled:opacity-50">{tgLoading ? t('profilo.telegram.generazione') : t('profilo.telegram.collega')}</button>
                  )}
                </div>
              </div>
              {/* Statistics reset */}
              <div className="glass-card overflow-hidden border border-[var(--pericolo-dim)]">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg text-[var(--pericolo)] flex items-center gap-2"><AlertCircle size={20} /> {t('profilo.reset.titolo')}</h3>
                </div>
                <div className="p-card-inner">
                  <p className="text-sm text-[var(--testo-secondario)] mb-4">{t('profilo.reset.descrizione')}</p>
                  {!mostraReset ? (
                    <button onClick={() => setMostraReset(true)} className="btn-secondario text-sm" style={{ borderColor: 'var(--pericolo)', color: 'var(--pericolo)' }}>{t('profilo.reset.resetta')}</button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-[var(--testo-terziario)]"><Testo t="profilo.reset.istruzione" valori={{ frase: t('profilo.reset.frase') }} componenti={{ strong: <strong /> }} /></p>
                      <input type="text" value={confermaReset} onChange={e => setConfermaReset(e.target.value)} placeholder={t('profilo.reset.frase')}
                             className="campo-input text-center text-[var(--pericolo)] font-bold" />
                      <div className="flex gap-2">
                        <button onClick={() => { setMostraReset(false); setConfermaReset(''); }} className="flex-1 py-2 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">{t('comune.annulla')}</button>
                        <button onClick={eseguiReset} disabled={confermaReset !== t('profilo.reset.frase') || avviandoReset}
                                className="flex-1 py-2 rounded-lg bg-[var(--pericolo)] text-white disabled:opacity-50">{avviandoReset ? t('profilo.reset.inCorso') : t('profilo.reset.conferma')}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 6: BILLING */}
          {tabAttivo === 'fatturazione' && (
            <motion.div key="fatturazione" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><CreditCard size={20} className="text-[var(--accent)]" /> {t('profilo.fatturazione.titolo')}</h3>
                </div>
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-3xl mx-auto mb-4">🚧</div>
                  <h4 className="font-bold text-lg mb-2">{t('profilo.fatturazione.inLavorazione')}</h4>
                  <p className="text-sm text-[var(--testo-terziario)] max-w-xs mx-auto">{t('profilo.fatturazione.descrizione')}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 7: LEGAL & COMPLIANCE */}
          {tabAttivo === 'legale' && (
            <motion.div key="legale" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {/* Legal documents */}
              <div className="glass-card overflow-hidden mb-6">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={20} className="text-[var(--accent)]" /> {t('profilo.legale.documentiTitolo')}</h3>
                </div>
                <div className="flex flex-col">
                  {[
                    { label: t('profilo.legale.termini'), link: '/termini', icona: '📄' },
                    { label: t('profilo.legale.privacy'), link: '/privacy', icona: '🔐' },
                    { label: t('profilo.legale.cookie'), link: '/cookie-policy', icona: '🍪' },
                  ].map((doc, i, arr) => (
                    <a key={i} href={doc.link} target="_blank" rel="noopener noreferrer"
                       className={`flex items-center justify-between px-card-inner border-b border-[var(--bordo-light)] last:border-0 hover:bg-[var(--bg-terziario)] transition-colors group py-5 ${i === arr.length - 1 ? 'card-list-ultimo' : ''}`}>
                      <span className="text-sm font-medium flex items-center gap-2">{doc.icona} {doc.label}</span>
                      <ExternalLink size={16} className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
              {/* App info */}
              <div className="glass-card overflow-hidden">
                <div className="p-card-inner border-b border-[var(--bordo-light)]">
                  <h3 className="font-bold text-lg flex items-center gap-2">{t('profilo.legale.infoTitolo')}</h3>
                </div>
                <div className="p-card-inner flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-card-inner py-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] gap-1 sm:gap-4">
                    <span className="text-xs font-semibold text-[var(--testo-primario)]">{t('profilo.legale.versione')}</span>
                    <span className="text-xs text-[var(--testo-secondario)] text-left sm:text-right">{t('profilo.legale.versioneValori', { app: __APP_VERSION__, server: infoApp?.versione || '...', build: infoApp?.build || '...' })}</span>
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
                        <img src="https://github.com/giosci1994.png" alt={t('profilo.legale.sviluppatore')} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold group-hover:text-[var(--accent)] transition-colors">giosci1994</p>
                        <p className="text-[10px] text-[var(--testo-terziario)]">{t('profilo.legale.sviluppatoreRuolo')}</p>
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

          {/* TAB 8: DELETE ACCOUNT */}
          {tabAttivo === 'elimina' && (
            <motion.div key="elimina" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="glass-card overflow-hidden border border-[var(--pericolo)]">
                <div className="p-card-inner border-b border-[var(--pericolo-dim)]">
                  <h3 className="font-bold text-lg text-[var(--pericolo)] flex items-center gap-2"><Trash2 size={20} /> {t('profilo.elimina.titolo')}</h3>
                </div>
                <div className="p-card-inner">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--pericolo-dim)] mb-4">
                    <AlertCircle size={20} className="text-[var(--pericolo)] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[var(--pericolo)]">{t('profilo.elimina.attenzione')}</p>
                      <p className="text-xs text-[var(--testo-secondario)] mt-1">{t('profilo.elimina.attenzioneDettaglio')}</p>
                    </div>
                  </div>
                  <button onClick={scaricaDati} disabled={scaricandoDati}
                          className="btn-secondario text-sm w-full flex items-center justify-center gap-2 mb-1 disabled:opacity-50">
                    <Download size={16} /> {scaricandoDati ? t('profilo.esportazione.preparazione') : t('profilo.esportazione.scaricaPrima')}
                  </button>
                  {erroreDati && <p className="text-xs text-[var(--pericolo)] mb-1">{erroreDati}</p>}
                  <p className="text-xs text-[var(--testo-terziario)] mt-3 mb-3"><Testo t="profilo.elimina.istruzione" valori={{ frase: t('profilo.elimina.frase') }} componenti={{ strong: <strong /> }} /></p>
                  <input type="text" value={confermaElimina} onChange={e => setConfermaElimina(e.target.value)} placeholder={t('profilo.elimina.frase')}
                         className="campo-input text-center text-[var(--pericolo)] font-bold mb-3" />

                  <p className="text-xs text-[var(--testo-terziario)] mb-2">{t('profilo.elimina.password')}</p>
                  <input type="password" value={passwordElimina} onChange={e => setPasswordElimina(e.target.value)}
                         autoComplete="current-password" placeholder={t('profilo.elimina.passwordPlaceholder')}
                         className="campo-input mb-3" />

                  {erroreElimina && (
                    <p className="text-xs text-[var(--pericolo)] mb-3">{erroreElimina}</p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setConfermaElimina(''); setPasswordElimina(''); setErroreElimina(''); }} className="flex-1 py-2.5 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium">{t('comune.annulla')}</button>
                    <button disabled={confermaElimina !== t('profilo.elimina.frase') || !passwordElimina || eliminando}
                            onClick={async () => {
                              setErroreElimina('');
                              setEliminando(true);
                              try {
                                await api.delete('/utenti/account', { password: passwordElimina, conferma: 'ELIMINA' });
                                // The account no longer exists: sign out of the
                                // current session, otherwise the app would keep calling
                                // the API with the token of a deleted user.
                                logout();
                              } catch (err) {
                                setErroreElimina(err?.message || t('profilo.elimina.errore'));
                                setEliminando(false);
                              }
                            }}
                            className="flex-1 py-2.5 rounded-lg bg-[var(--pericolo)] text-white font-bold disabled:opacity-50">
                      {eliminando ? t('profilo.elimina.inCorso') : t('profilo.elimina.definitivo')}
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
