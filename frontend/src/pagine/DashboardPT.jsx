// ============================================
// GymMaster — Dashboard Personal Trainer
// Panoramica, Clienti, Calendario, Esercizi & Schede
// ============================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { LIVELLI, GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { formattaData, formattaPeso, formattaNumero, formattaDurata, formattaDataRelativa, nomeEsercizio} from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ComposizioneCorporea from '../componenti/specifici/ComposizioneCorporea.jsx';

const COLORI_GRAFICI = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#06B6D4'];

const TABS = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'clienti', label: 'Clienti' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'esercizi', label: 'Esercizi & Schede' },
];

export default function DashboardPT() {
  const { utente } = useAuth();
  const [tab, setTab] = useState('panoramica');
  const [stats, setStats] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [richieste, setRichieste] = useState([]);
  const [appuntamenti, setAppuntamenti] = useState([]);
  const [schede, setSchede] = useState([]);
  const [annunci, setAnnunci] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [clienteDettaglio, setClienteDettaglio] = useState(null);
  const [mostraNuovoApp, setMostraNuovoApp] = useState(false);
  const [formApp, setFormApp] = useState({ clienteId: '', titolo: '', descrizione: '', dataOra: '', durataMinuti: 60 });

  // Annunci state
  const [formAnnuncio, setFormAnnuncio] = useState({ titolo: '', contenuto: '', priorita: 'normale', destinatarioId: '' });
  const [mostraFormAnnuncio, setMostraFormAnnuncio] = useState(false);

  // Calendario state
  const [meseCalendario, setMeseCalendario] = useState(new Date());
  const [giornoSelezionato, setGiornoSelezionato] = useState(null);

  // Schede state
  const [subTabSchede, setSubTabSchede] = useState('mie');
  const [mostraCreaScheda, setMostraCreaScheda] = useState(false);
  const [formScheda, setFormScheda] = useState({ titolo: '', descrizione: '', livello: 'BASE', esercizi: [] });
  const [catalogoEsercizi, setCatalogoEsercizi] = useState([]);
  const [ricercaEsercizio, setRicercaEsercizio] = useState('');
  const [creandoScheda, setCreandoScheda] = useState(false);

  useEffect(() => { caricaDati(); }, []);

  const caricaDati = async () => {
    try {
      setCaricamento(true);
      const [s, c, r, a, sc, an] = await Promise.all([
        api.get('/pt/dashboard'),
        api.get('/pt/clienti'),
        api.get('/pt/richieste'),
        api.get('/pt/appuntamenti'),
        api.get('/pt/schede'),
        api.get('/pt/annunci'),
      ]);
      setStats(s.dati); setClienti(c.dati || []); setRichieste(r.dati || []);
      setAppuntamenti(a.dati || []); setSchede(sc.dati || []); setAnnunci(an.dati || []);
    } catch (err) { console.error('Errore caricamento dati PT:', err); }
    finally { setCaricamento(false); }
  };

  const gestisciRichiesta = async (id, azione) => {
    try { await api.patch(`/pt/richieste/${id}/${azione}`); setRichieste(prev => prev.filter(r => r.id !== id)); if (azione === 'accetta') caricaDati(); }
    catch (err) { alert(err.message); }
  };

  const creaAppuntamento = async () => {
    try {
      let dataOraConTZ = formApp.dataOra;
      if (dataOraConTZ && !dataOraConTZ.includes('+') && !dataOraConTZ.includes('Z')) {
        const offset = -new Date().getTimezoneOffset();
        const segno = offset >= 0 ? '+' : '-';
        const ore = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
        const minuti = String(Math.abs(offset) % 60).padStart(2, '0');
        dataOraConTZ = `${dataOraConTZ}:00${segno}${ore}:${minuti}`;
      }
      await api.post('/pt/appuntamenti', { ...formApp, dataOra: dataOraConTZ });
      setMostraNuovoApp(false); setFormApp({ clienteId: '', titolo: '', descrizione: '', dataOra: '', durataMinuti: 60 });
      const a = await api.get('/pt/appuntamenti'); setAppuntamenti(a.dati || []);
    } catch (err) { alert(err.message); }
  };

  const eliminaAppuntamento = async (id) => {
    if (!confirm('Eliminare questo appuntamento?')) return;
    try { await api.delete(`/pt/appuntamenti/${id}`); setAppuntamenti(prev => prev.filter(a => a.id !== id)); }
    catch (err) { alert(err.message); }
  };

  const toggleCompletato = async (app) => {
    try { await api.patch(`/pt/appuntamenti/${app.id}`, { completato: !app.completato }); setAppuntamenti(prev => prev.map(a => a.id === app.id ? { ...a, completato: !a.completato } : a)); }
    catch (err) { alert(err.message); }
  };

  const assegnaScheda = async (clienteId, schedaId) => {
    try { await api.post(`/pt/clienti/${clienteId}/assegna-scheda`, { schedaId }); alert('Scheda assegnata!'); }
    catch (err) { alert(err.message); }
  };

  const terminaCliente = async (clienteId) => {
    if (!confirm('Terminare il rapporto con questo cliente?')) return;
    try { await api.delete(`/pt/clienti/${clienteId}`); setClienti(prev => prev.filter(c => c.id !== clienteId)); setClienteDettaglio(null); }
    catch (err) { alert(err.message); }
  };

  const apriDettaglioCliente = async (clienteId) => {
    try { const r = await api.get(`/pt/clienti/${clienteId}`); setClienteDettaglio(r.dati); }
    catch (err) { alert(err.message); }
  };

  const eliminaSchedaAssegnata = async (clienteId, schedaId) => {
    if (!confirm('Rimuovere questa scheda dal cliente?')) return;
    try {
      await api.delete(`/pt/clienti/${clienteId}/schede/${schedaId}`);
      setClienteDettaglio(prev => ({ ...prev, schedeAssegnate: prev.schedeAssegnate.filter(s => s.id !== schedaId) }));
    } catch (err) { alert(err.message); }
  };

  // --- Annunci ---
  const creaAnnuncio = async () => {
    try {
      const payload = { ...formAnnuncio };
      if (!payload.destinatarioId) delete payload.destinatarioId;
      const r = await api.post('/pt/annunci', payload);
      setAnnunci(prev => [r.dati, ...prev]);
      setFormAnnuncio({ titolo: '', contenuto: '', priorita: 'normale', destinatarioId: '' });
      setMostraFormAnnuncio(false);
    } catch (err) { alert(err.message); }
  };

  const eliminaAnnuncio = async (id) => {
    if (!confirm('Eliminare questo annuncio?')) return;
    try { await api.delete(`/pt/annunci/${id}`); setAnnunci(prev => prev.filter(a => a.id !== id)); }
    catch (err) { alert(err.message); }
  };

  // --- Schede ---
  const caricaCatalogo = async () => {
    if (catalogoEsercizi.length > 0) return;
    try { const r = await api.get('/esercizi?limite=500'); setCatalogoEsercizi(r.dati || []); }
    catch { setCatalogoEsercizi([]); }
  };

  const creaSchedaPT = async () => {
    if (!formScheda.titolo || formScheda.esercizi.length === 0) return alert('Inserisci titolo e almeno un esercizio');
    try {
      setCreandoScheda(true);
      const r = await api.post('/pt/schede', formScheda);
      setSchede(prev => [r.dati, ...prev]);
      setFormScheda({ titolo: '', descrizione: '', livello: 'BASE', esercizi: [] });
      setMostraCreaScheda(false); setSubTabSchede('mie');
    } catch (err) { alert(err.message); }
    finally { setCreandoScheda(false); }
  };

  const aggiungiEsercizioAScheda = (es) => {
    setFormScheda(prev => ({ ...prev, esercizi: [...prev.esercizi, { esercizioId: es.id, nome: es.nome, serieTarget: 3, repTarget: '8-12', recuperoSecondi: 90 }] }));
    setRicercaEsercizio('');
  };

  const rimuoviEsercizioDaScheda = (idx) => {
    setFormScheda(prev => ({ ...prev, esercizi: prev.esercizi.filter((_, i) => i !== idx) }));
  };

  // --- Calendario helpers ---
  const giorniMeseCalendario = () => {
    const anno = meseCalendario.getFullYear(), mese = meseCalendario.getMonth();
    const primo = new Date(anno, mese, 1).getDay();
    const totGiorni = new Date(anno, mese + 1, 0).getDate();
    const offset = primo === 0 ? 6 : primo - 1;
    return { offset, totGiorni, anno, mese };
  };

  const appuntamentiDelGiorno = (giorno) => {
    const { anno, mese } = giorniMeseCalendario();
    const data = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
    return appuntamenti.filter(a => a.dataOra.split('T')[0] === data);
  };

  const cambiaMese = (delta) => {
    const n = new Date(meseCalendario); n.setMonth(n.getMonth() + delta); setMeseCalendario(n);
  };

  if (caricamento) {
    return <div className="flex justify-center py-20"><div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>;
  }

  return (
    <div className="py-2 pb-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold">Dashboard PT</h1>
        <p className="text-[var(--testo-secondario)] text-sm">Benvenuto, {utente?.nome}</p>
      </motion.div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'esercizi') caricaCatalogo(); }}
            className={`shrink-0 px-4 py-2 rounded-[var(--raggio-pieno)] text-sm font-medium transition-all ${
              tab === t.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)]'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ======= TAB PANORAMICA ======= */}
      {tab === 'panoramica' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {/* Azioni rapide */}
          <div className="glass-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-3">Azioni rapide</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button onClick={() => { setTab('esercizi'); setMostraCreaScheda(true); }} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">➕</span><span className="text-xs font-semibold">Crea scheda</span>
              </button>
              <button onClick={() => setTab('calendario')} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">📅</span><span className="text-xs font-semibold">Appuntamento</span>
              </button>
              <button onClick={() => setMostraFormAnnuncio(true)} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">📢</span><span className="text-xs font-semibold">Annuncio</span>
              </button>
              <Link to={`/trainer/${utente?.id}`} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">🔗</span><span className="text-xs font-semibold">Profilo pubblico</span>
              </Link>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Clienti Attivi', valore: stats?.clientiAttivi || 0, icona: '👥', colore: 'var(--accent)' },
              { label: 'Richieste', valore: stats?.richiesteInAttesa || 0, icona: '📩', colore: 'var(--avviso)' },
              { label: 'Appuntamenti Oggi', valore: stats?.appuntamentiOggi || 0, icona: '📅', colore: 'var(--successo)' },
              { label: 'Sessioni Clienti', valore: stats?.sessioniClienti || 0, icona: '🏋️', colore: 'var(--accent-alt)' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: 'var(--bg-terziario)' }}>{s.icona}</div>
                <div className="min-w-0">
                  <div className="text-2xl font-extrabold leading-none" style={{ color: s.colore }}>{s.valore}</div>
                  <div className="text-[11px] text-[var(--testo-terziario)] mt-1 truncate">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {richieste.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--avviso)] anima-pulsa"></span> Richieste Pendenti
              </h3>
              <div className="flex flex-col gap-2">
                {richieste.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {r.utente?.nome?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{r.utente?.nome}</p>
                      <p className="text-xs text-[var(--testo-terziario)]">{r.utente?.obiettivoFitness || 'Nessun obiettivo'}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => gestisciRichiesta(r.id, 'accetta')} className="px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--successo)] text-white">Accetta</button>
                      <button onClick={() => gestisciRichiesta(r.id, 'rifiuta')} className="px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--pericolo-dim)] text-[var(--pericolo)]">Rifiuta</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* I tuoi clienti */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">👥 I tuoi clienti</h3>
              {clienti.length > 0 && <button onClick={() => setTab('clienti')} className="text-xs text-[var(--accent)] font-semibold">Vedi tutti →</button>}
            </div>
            {clienti.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-[var(--testo-secondario)] mb-3">Non hai ancora clienti. Condividi il tuo <b>profilo pubblico</b> per farti trovare dagli utenti e ricevere richieste!</p>
                <Link to={`/trainer/${utente?.id}`} className="btn-primario inline-flex text-sm">🔗 Vedi il mio profilo pubblico</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {[...clienti].sort((a, b) => new Date(b.ultimoAccesso || 0) - new Date(a.ultimoAccesso || 0)).slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => setTab('clienti')} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors text-left">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {c.immagineProfilo ? <img src={c.immagineProfilo} alt="" className="w-full h-full object-cover" /> : c.nome?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.nome}</p>
                      <p className="text-xs text-[var(--testo-terziario)] truncate">
                        {c.ultimoAccesso ? `Attivo ${formattaDataRelativa(c.ultimoAccesso)}` : 'Mai attivo'} · 🏋️ {c._count?.sessioni || 0} sessioni
                      </p>
                    </div>
                    {c.obiettivoFitness && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondario)] text-[var(--testo-secondario)] shrink-0">{c.obiettivoFitness}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Prossimi appuntamenti */}
          <div className="glass-card p-5">
            <h3 className="font-bold text-lg mb-3">📅 Prossimi Appuntamenti</h3>
            {appuntamenti.filter(a => !a.completato && new Date(a.dataOra) >= new Date()).length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)]">Nessun appuntamento in programma</p>
            ) : (
              <div className="flex flex-col gap-2">
                {appuntamenti.filter(a => !a.completato && new Date(a.dataOra) >= new Date()).slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <div className="text-center shrink-0 w-12">
                      <div className="text-xs text-[var(--accent)] font-bold">{new Date(a.dataOra).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</div>
                      <div className="text-[10px] text-[var(--testo-terziario)]">{new Date(a.dataOra).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.titolo}</p>
                      <p className="text-xs text-[var(--testo-terziario)]">{a.cliente?.nome} · {a.durataMinuti}min</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bacheca Annunci */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">📢 Bacheca Annunci</h3>
              <button onClick={() => setMostraFormAnnuncio(!mostraFormAnnuncio)} className="btn-primario text-xs !py-1.5 !px-3">
                {mostraFormAnnuncio ? 'Chiudi' : '+ Nuovo'}
              </button>
            </div>
            {mostraFormAnnuncio && (
              <div className="mb-4 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] flex flex-col gap-2">
                <input type="text" value={formAnnuncio.titolo} onChange={e => setFormAnnuncio(p => ({...p, titolo: e.target.value}))} className="campo-input" placeholder="Titolo annuncio" />
                <textarea value={formAnnuncio.contenuto} onChange={e => setFormAnnuncio(p => ({...p, contenuto: e.target.value}))} className="campo-input min-h-[60px] resize-none" placeholder="Contenuto..." rows="2" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={formAnnuncio.priorita} onChange={e => setFormAnnuncio(p => ({...p, priorita: e.target.value}))} className="campo-input text-xs">
                    <option value="normale">Normale</option>
                    <option value="importante">Importante</option>
                    <option value="urgente">Urgente</option>
                  </select>
                  <select value={formAnnuncio.destinatarioId} onChange={e => setFormAnnuncio(p => ({...p, destinatarioId: e.target.value}))} className="campo-input text-xs">
                    <option value="">Tutti i clienti</option>
                    {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <button onClick={creaAnnuncio} disabled={!formAnnuncio.titolo || !formAnnuncio.contenuto} className="btn-primario text-sm disabled:opacity-50">Pubblica</button>
              </div>
            )}
            {annunci.length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)]">Nessun annuncio pubblicato</p>
            ) : (
              <div className="flex flex-col gap-2">
                {annunci.slice(0, 10).map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {a.priorita === 'urgente' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                        {a.priorita === 'importante' && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                        <p className="font-bold text-sm truncate">{a.titolo}</p>
                        {a.destinatario && <span className="text-[10px] bg-[var(--accent-dim)] text-[var(--accent)] px-1.5 py-0.5 rounded-full shrink-0">→ {a.destinatario.nome}</span>}
                      </div>
                      <p className="text-xs text-[var(--testo-secondario)] line-clamp-2">{a.contenuto}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)] mt-1">{new Date(a.creatoIl).toLocaleDateString('it-IT')}</p>
                    </div>
                    <button onClick={() => eliminaAnnuncio(a.id)} className="text-[var(--pericolo)] text-xs opacity-50 hover:opacity-100 shrink-0 mt-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ======= TAB CLIENTI ======= */}
      {tab === 'clienti' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {clienti.length === 0 ? (
            <div className="glass-card p-8 text-center"><div className="text-4xl mb-3">👥</div><p className="text-[var(--testo-secondario)]">Nessun cliente iscritto</p></div>
          ) : clienti.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => apriDettaglioCliente(c.id)}
              className="glass-card p-4 flex items-center gap-4 cursor-pointer group hover:border-[var(--bordo-hover)] transition-all">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {c.immagineProfilo ? <img src={c.immagineProfilo} className="w-full h-full rounded-full object-cover" /> : c.nome?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{c.nome}</p>
                <p className="text-xs text-[var(--testo-terziario)]">{c.obiettivoFitness || 'Nessun obiettivo'} · {c._count?.sessioni || 0} sessioni</p>
              </div>
              <span className="text-xs text-[var(--accent)] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Dettagli →</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ======= TAB CALENDARIO ======= */}
      {tab === 'calendario' && (() => {
        const { offset, totGiorni, anno, mese } = giorniMeseCalendario();
        const oggi = new Date();
        const oggiStr = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
        const appDelGiorno = giornoSelezionato ? appuntamentiDelGiorno(giornoSelezionato) : [];

        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            {/* Header calendario */}
            <div className="flex items-center justify-between">
              <button onClick={() => cambiaMese(-1)} className="w-9 h-9 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center hover:bg-[var(--bordo)] transition-colors">←</button>
              <h3 className="font-bold text-lg capitalize">
                {meseCalendario.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => cambiaMese(1)} className="w-9 h-9 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center hover:bg-[var(--bordo)] transition-colors">→</button>
            </div>

            {/* Griglia calendario */}
            <div className="glass-card p-4 overflow-hidden">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-[var(--testo-terziario)] uppercase">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: totGiorni }).map((_, i) => {
                  const g = i + 1;
                  const dataStr = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
                  const appInData = appuntamenti.filter(a => a.dataOra.split('T')[0] === dataStr);
                  const isOggi = dataStr === oggiStr;
                  const isSel = giornoSelezionato === g;

                  return (
                    <button key={g} onClick={() => setGiornoSelezionato(isSel ? null : g)}
                      className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all
                        ${isOggi ? 'ring-2 ring-[var(--accent)]' : ''}
                        ${isSel ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-terziario)]'}
                      `}>
                      <span className={`font-medium ${isOggi && !isSel ? 'text-[var(--accent)]' : ''}`}>{g}</span>
                      {appInData.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {appInData.slice(0, 3).map((a, j) => (
                            <span key={j} className={`w-1.5 h-1.5 rounded-full ${a.completato ? 'bg-emerald-400' : isSel ? 'bg-white' : 'bg-[var(--accent)]'}`} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dettaglio giorno selezionato */}
            {giornoSelezionato && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold">{giornoSelezionato} {meseCalendario.toLocaleDateString('it-IT', { month: 'long' })}</h4>
                  <button onClick={() => { setMostraNuovoApp(true); const d = `${anno}-${String(mese+1).padStart(2,'0')}-${String(giornoSelezionato).padStart(2,'0')}T09:00`; setFormApp(p => ({...p, dataOra: d})); }}
                    className="btn-primario text-xs !py-1.5 !px-3">+ Appuntamento</button>
                </div>
                {appDelGiorno.length === 0 ? (
                  <p className="text-sm text-[var(--testo-terziario)]">Nessun appuntamento per questo giorno</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {appDelGiorno.map(a => (
                      <div key={a.id} className={`flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] ${a.completato ? 'opacity-50' : ''}`}>
                        <button onClick={() => toggleCompletato(a)}
                          className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                            a.completato ? 'bg-[var(--successo)] border-[var(--successo)] text-white' : 'border-[var(--bordo-light)]'
                          }`}>{a.completato ? '✓' : ''}</button>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${a.completato ? 'line-through' : ''}`}>{a.titolo}</p>
                          <p className="text-xs text-[var(--testo-terziario)]">
                            {a.cliente?.nome} · {new Date(a.dataOra).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {a.durataMinuti}min
                          </p>
                        </div>
                        <button onClick={() => eliminaAppuntamento(a.id)} className="text-[var(--pericolo)] text-xs opacity-60 hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista completa (sotto il calendario) */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg">Tutti gli Appuntamenti</h3>
                <button onClick={() => setMostraNuovoApp(true)} className="btn-primario text-sm !py-2 !px-4">+ Nuovo</button>
              </div>
              {appuntamenti.length === 0 ? (
                <p className="text-sm text-[var(--testo-terziario)]">Nessun appuntamento</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {appuntamenti.map(a => (
                    <div key={a.id} className={`flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] ${a.completato ? 'opacity-50' : ''}`}>
                      <button onClick={() => toggleCompletato(a)}
                        className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                          a.completato ? 'bg-[var(--successo)] border-[var(--successo)] text-white' : 'border-[var(--bordo-light)]'
                        }`}>{a.completato ? '✓' : ''}</button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${a.completato ? 'line-through' : ''}`}>{a.titolo}</p>
                        <p className="text-xs text-[var(--testo-terziario)]">
                          {a.cliente?.nome} · {new Date(a.dataOra).toLocaleDateString('it-IT')} {new Date(a.dataOra).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {a.durataMinuti}min
                        </p>
                      </div>
                      <button onClick={() => eliminaAppuntamento(a.id)} className="text-[var(--pericolo)] text-xs opacity-60 hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* ======= TAB ESERCIZI & SCHEDE ======= */}
      {tab === 'esercizi' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {/* Sub-tabs */}
          <div className="flex gap-2">
            {[
              { id: 'mie', label: 'Le mie schede' },
              { id: 'crea', label: 'Crea scheda' },
              { id: 'catalogo', label: 'Catalogo' },
            ].map(st => (
              <button key={st.id} onClick={() => { setSubTabSchede(st.id); if (st.id === 'crea') caricaCatalogo(); }}
                className={`px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-medium transition-all ${
                  subTabSchede === st.id ? 'bg-[var(--testo-primario)] text-[var(--bg-primario)]' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'
                }`}>{st.label}</button>
            ))}
          </div>

          {/* Sub-tab: Le mie schede */}
          {subTabSchede === 'mie' && (
            <>
              {schede.filter(s => s.creatoreId === utente?.id).length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-[var(--testo-secondario)]">Nessuna scheda creata</p>
                  <button onClick={() => { setSubTabSchede('crea'); caricaCatalogo(); }} className="btn-primario text-sm mt-3">Crea la prima</button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {schede.filter(s => s.creatoreId === utente?.id).map(s => (
                    <div key={s.id} className="glass-card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold truncate">{s.titolo}</h4>
                        <span className={`badge ${LIVELLI[s.livello]?.colore || 'accent'} text-[10px]`}>{LIVELLI[s.livello]?.label}</span>
                      </div>
                      {s.descrizione && <p className="text-xs text-[var(--testo-secondario)] mb-2 line-clamp-1">{s.descrizione}</p>}
                      <p className="text-xs text-[var(--testo-terziario)]">{s.esercizi?.length || 0} esercizi · {s._count?.sessioni || 0} sessioni</p>
                      {clienti.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-[var(--bordo)]">
                          <select onChange={e => { if (e.target.value) assegnaScheda(e.target.value, s.id); e.target.value = ''; }} className="campo-input text-xs !py-1.5">
                            <option value="">Assegna a un cliente...</option>
                            {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Sub-tab: Crea scheda */}
          {subTabSchede === 'crea' && (
            <div className="glass-card p-5">
              <h3 className="font-bold text-lg mb-4">Crea Nuova Scheda</h3>
              <div className="flex flex-col gap-3">
                <input type="text" value={formScheda.titolo} onChange={e => setFormScheda(p => ({...p, titolo: e.target.value}))} className="campo-input" placeholder="Titolo scheda" />
                <textarea value={formScheda.descrizione} onChange={e => setFormScheda(p => ({...p, descrizione: e.target.value}))} className="campo-input min-h-[50px] resize-none" placeholder="Descrizione (opzionale)" rows="2" />
                <select value={formScheda.livello} onChange={e => setFormScheda(p => ({...p, livello: e.target.value}))} className="campo-input">
                  <option value="BASE">Base</option>
                  <option value="INTERMEDIO">Intermedio</option>
                  <option value="AVANZATO">Avanzato</option>
                </select>

                {/* Ricerca esercizi */}
                <div className="border-t border-[var(--bordo)] pt-3">
                  <label className="text-xs font-bold text-[var(--testo-terziario)] mb-2 block">Aggiungi Esercizi dal Catalogo</label>
                  <div className="relative">
                    <input type="text" value={ricercaEsercizio} onChange={e => setRicercaEsercizio(e.target.value)} className="campo-input" placeholder="Cerca esercizio..." />
                    {ricercaEsercizio.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-secondario)] border border-[var(--bordo)] rounded-[var(--raggio-md)] max-h-48 overflow-y-auto z-10 shadow-xl">
                        {catalogoEsercizi.filter(e => e.nome.toLowerCase().includes(ricercaEsercizio.toLowerCase())).slice(0, 15).map(e => (
                          <button key={e.id} onClick={() => aggiungiEsercizioAScheda(e)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-terziario)] border-b border-[var(--bordo)] last:border-0 flex items-center justify-between">
                            <span className="truncate">{e.nome}</span>
                            <span className="text-[10px] text-[var(--testo-terziario)] shrink-0 ml-2">{e.gruppoMuscoloPrimario}</span>
                          </button>
                        ))}
                        {catalogoEsercizi.filter(e => e.nome.toLowerCase().includes(ricercaEsercizio.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-xs text-[var(--testo-terziario)]">Nessun risultato</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lista esercizi aggiunti */}
                {formScheda.esercizi.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {formScheda.esercizi.map((es, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                        <span className="w-6 h-6 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate">{es.nome}</span>
                        <input type="number" value={es.serieTarget} onChange={e => { const n = [...formScheda.esercizi]; n[idx].serieTarget = parseInt(e.target.value) || 3; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-14 text-center text-xs !py-1" title="Serie" min="1" />
                        <span className="text-[10px] text-[var(--testo-terziario)]">x</span>
                        <input type="text" value={es.repTarget} onChange={e => { const n = [...formScheda.esercizi]; n[idx].repTarget = e.target.value; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-16 text-center text-xs !py-1" title="Ripetizioni" />
                        <input type="number" value={es.recuperoSecondi} onChange={e => { const n = [...formScheda.esercizi]; n[idx].recuperoSecondi = parseInt(e.target.value) || 90; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-16 text-center text-xs !py-1" title="Recupero (sec)" min="0" step="15" />
                        <span className="text-[10px] text-[var(--testo-terziario)]">s</span>
                        <button onClick={() => rimuoviEsercizioDaScheda(idx)} className="text-[var(--pericolo)] text-xs opacity-60 hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={creaSchedaPT} disabled={creandoScheda || !formScheda.titolo || formScheda.esercizi.length === 0}
                  className="btn-primario disabled:opacity-50 mt-2">
                  {creandoScheda ? 'Creazione...' : '✅ Crea Scheda'}
                </button>
              </div>
            </div>
          )}

          {/* Sub-tab: Catalogo (schede globali) */}
          {subTabSchede === 'catalogo' && (
            <>
              {schede.filter(s => s.visibilita === 'GLOBALE').length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-[var(--testo-secondario)]">Nessuna scheda globale sul server</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {schede.filter(s => s.visibilita === 'GLOBALE').map(s => (
                    <div key={s.id} className="glass-card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold truncate">{s.titolo}</h4>
                        <span className={`badge ${LIVELLI[s.livello]?.colore || 'accent'} text-[10px]`}>{LIVELLI[s.livello]?.label}</span>
                      </div>
                      {s.descrizione && <p className="text-xs text-[var(--testo-secondario)] mb-1 line-clamp-1">{s.descrizione}</p>}
                      <p className="text-xs text-[var(--testo-terziario)] mb-1">Creata da {s.creatore?.nome} · {s.esercizi?.length || 0} esercizi</p>
                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-[var(--accent)] font-medium">Vedi esercizi</summary>
                        <ol className="mt-1 pl-4 list-decimal text-[var(--testo-secondario)]">
                          {s.esercizi?.map(e => <li key={e.id}>{nomeEsercizio(e.esercizio)} ({e.serieTarget}x{e.repTarget})</li>)}
                        </ol>
                      </details>
                      {clienti.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-[var(--bordo)]">
                          <select onChange={e => { if (e.target.value) assegnaScheda(e.target.value, s.id); e.target.value = ''; }} className="campo-input text-xs !py-1.5">
                            <option value="">Assegna a un cliente...</option>
                            {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* ======= MODALE DETTAGLIO CLIENTE ======= */}
      <AnimatePresence>
        {clienteDettaglio && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setClienteDettaglio(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              {/* Header cliente */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {clienteDettaglio.cliente?.immagineProfilo ? <img src={clienteDettaglio.cliente.immagineProfilo} className="w-full h-full object-cover" /> : clienteDettaglio.cliente?.nome?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{clienteDettaglio.cliente?.nome}</h2>
                  <p className="text-xs text-[var(--testo-terziario)]">{clienteDettaglio.cliente?.obiettivoFitness || 'Nessun obiettivo'} · {clienteDettaglio.cliente?.email}</p>
                </div>
                <button onClick={() => setClienteDettaglio(null)} className="w-8 h-8 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center shrink-0">✕</button>
              </div>

              {/* KPI Cards */}
              {clienteDettaglio.statistiche && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                  {[
                    { l: 'Sessioni', v: clienteDettaglio.statistiche.totaleSessioni, i: '🏋️', c: '#6366F1' },
                    { l: 'Ore', v: formattaDurata(clienteDettaglio.statistiche.totaleDurata), i: '⏱️', c: '#8B5CF6' },
                    { l: 'Volume (kg)', v: formattaNumero(clienteDettaglio.statistiche.totaleVolume), i: '📦', c: '#EC4899' },
                    { l: 'Record', v: clienteDettaglio.statistiche.totaleRecord, i: '🏆', c: '#F59E0B' },
                  ].map((k, i) => (
                    <div key={i} className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                      <div className="text-lg mb-0.5">{k.i}</div>
                      <div className="text-lg font-extrabold" style={{ color: k.c }}>{k.v}</div>
                      <div className="text-[10px] text-[var(--testo-terziario)] uppercase">{k.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Composizione corporea del cliente (il PT può aggiungere misurazioni) */}
              <div className="mb-5">
                <h4 className="text-sm font-bold mb-2 flex items-center gap-2">📊 Composizione corporea</h4>
                <ComposizioneCorporea clienteId={clienteDettaglio.cliente?.id} altezzaCm={clienteDettaglio.cliente?.altezzaCm} />
              </div>

              {/* Grafico Volume */}
              {clienteDettaglio.statistiche?.sessioni?.length > 0 && (
                <div className="mb-5 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                  <h4 className="text-xs font-bold text-[var(--testo-terziario)] mb-3">📈 Volume nel tempo (kg)</h4>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={clienteDettaglio.statistiche.sessioni}>
                      <defs><linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366F1" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="data" tick={{ fontSize: 9, fill: '#666' }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 9, fill: '#666' }} />
                      <Area type="monotone" dataKey="volume" stroke="#6366F1" strokeWidth={2} fill="url(#gv)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Gruppi muscolari */}
              {clienteDettaglio.statistiche?.gruppiMuscolari?.length > 0 && (
                <div className="mb-5 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                  <h4 className="text-xs font-bold text-[var(--testo-terziario)] mb-3">🎯 Gruppi muscolari</h4>
                  <div className="flex flex-col gap-1.5">
                    {clienteDettaglio.statistiche.gruppiMuscolari.slice(0, 6).map((g, i) => {
                      const max = clienteDettaglio.statistiche.gruppiMuscolari[0]?.serie || 1;
                      return (
                        <div key={g.nome} className="flex items-center gap-2 text-xs">
                          <span className="w-16 truncate text-[var(--testo-secondario)]">{GRUPPI_MUSCOLARI[g.nome]?.emoji || '💪'} {g.nome}</span>
                          <div className="flex-1 h-4 bg-[var(--bg-primario)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(g.serie / max) * 100}%`, background: COLORI_GRAFICI[i % COLORI_GRAFICI.length] }} />
                          </div>
                          <span className="font-bold w-8 text-right">{g.serie}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Schede assegnate dal PT */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold mb-2">📋 Schede Assegnate</h4>
                {(!clienteDettaglio.schedeAssegnate || clienteDettaglio.schedeAssegnate.length === 0) ? (
                  <p className="text-xs text-[var(--testo-terziario)] p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">Nessuna scheda assegnata a questo cliente</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {clienteDettaglio.schedeAssegnate.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.titolo}</p>
                          <p className="text-[10px] text-[var(--testo-terziario)]">{s.esercizi?.length || 0} esercizi · {s._count?.sessioni || 0} sessioni · {new Date(s.creatoIl).toLocaleDateString('it-IT')}</p>
                        </div>
                        <button onClick={() => eliminaSchedaAssegnata(clienteDettaglio.cliente?.id, s.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--pericolo-dim)] text-[var(--pericolo)] hover:bg-[var(--pericolo)] hover:text-white transition-colors shrink-0 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Record personali */}
              {clienteDettaglio.record?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold mb-2">🏆 Top Record</h4>
                  <div className="flex flex-col gap-1">
                    {clienteDettaglio.record.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-[var(--bg-terziario)]">
                        <span className="truncate flex-1">{nomeEsercizio(r.esercizio)}</span>
                        <span className="font-bold text-[var(--accent)] ml-2">{formattaPeso(r.pesoMaxRaggiunto)} kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ultime sessioni */}
              {clienteDettaglio.ultime5Sessioni?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold mb-2">🗓️ Ultime Sessioni</h4>
                  <div className="flex flex-col gap-1">
                    {clienteDettaglio.ultime5Sessioni.map(s => (
                      <div key={s.id} className="flex justify-between text-xs py-1.5 px-2 rounded bg-[var(--bg-terziario)]">
                        <span className="truncate flex-1">{s.scheda?.titolo}</span>
                        <span className="text-[var(--testo-terziario)] ml-2">{new Date(s.dataInizio).toLocaleDateString('it-IT')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => terminaCliente(clienteDettaglio.cliente?.id)}
                className="w-full mt-2 py-2 rounded-[var(--raggio-md)] text-sm text-[var(--pericolo)] border border-[var(--pericolo-dim)] hover:bg-[var(--pericolo-dim)] transition-all">
                Termina Rapporto
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======= MODALE NUOVO APPUNTAMENTO ======= */}
      <AnimatePresence>
        {mostraNuovoApp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setMostraNuovoApp(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="glass-card w-full max-w-sm p-6">
              <h3 className="text-lg font-bold mb-4">Nuovo Appuntamento</h3>
              <div className="flex flex-col gap-3">
                <select value={formApp.clienteId} onChange={e => setFormApp(p => ({ ...p, clienteId: e.target.value }))} className="campo-input">
                  <option value="">Seleziona cliente...</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="text" value={formApp.titolo} onChange={e => setFormApp(p => ({ ...p, titolo: e.target.value }))} className="campo-input" placeholder="Titolo appuntamento" />
                <input type="datetime-local" value={formApp.dataOra} onChange={e => setFormApp(p => ({ ...p, dataOra: e.target.value }))} className="campo-input" />
                <input type="number" value={formApp.durataMinuti} onChange={e => setFormApp(p => ({ ...p, durataMinuti: parseInt(e.target.value) }))} className="campo-input" placeholder="Durata (minuti)" min="15" step="15" />
                <textarea value={formApp.descrizione} onChange={e => setFormApp(p => ({ ...p, descrizione: e.target.value }))} className="campo-input min-h-[60px] resize-none" placeholder="Descrizione (opzionale)" rows="2" />
                <div className="flex gap-2">
                  <button onClick={() => setMostraNuovoApp(false)} className="flex-1 btn-secondario">Annulla</button>
                  <button onClick={creaAppuntamento} disabled={!formApp.clienteId || !formApp.titolo || !formApp.dataOra} className="flex-1 btn-primario disabled:opacity-50">Crea</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
