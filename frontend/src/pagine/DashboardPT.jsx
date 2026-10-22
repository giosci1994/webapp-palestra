// ============================================
// GymMaster — Personal Trainer Dashboard
// Overview, Clients, Calendar, Exercises & Plans
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';
import { localeCorrente } from '../i18n/index.js';
import { indicizzaEsercizi, cerca } from '../utils/ricerca.js';
import { LIVELLI, GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { formattaPeso, formattaNumero, formattaDurata, formattaDataRelativa, nomeEsercizio, nomeGruppo, titoloAllenamento } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import ComposizioneCorporea from '../componenti/specifici/ComposizioneCorporea.jsx';

const COLORI_GRAFICI = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#06B6D4'];

// label is a translation key: show it with t()
const TABS = [
  { id: 'panoramica', label: 'dashboardPT.tab.panoramica' },
  { id: 'clienti', label: 'dashboardPT.tab.clienti' },
  { id: 'calendario', label: 'dashboardPT.tab.calendario' },
  { id: 'esercizi', label: 'dashboardPT.tab.esercizi' },
];

export default function DashboardPT() {
  const { t } = useLingua();
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

  // Announcements state
  const [formAnnuncio, setFormAnnuncio] = useState({ titolo: '', contenuto: '', priorita: 'normale', destinatarioId: '' });
  const [mostraFormAnnuncio, setMostraFormAnnuncio] = useState(false);

  // Calendar state
  const [meseCalendario, setMeseCalendario] = useState(new Date());
  const [giornoSelezionato, setGiornoSelezionato] = useState(null);

  // Plans state
  const [subTabSchede, setSubTabSchede] = useState('mie');
  const [formScheda, setFormScheda] = useState({ titolo: '', descrizione: '', livello: 'BASE', esercizi: [] });
  const [catalogoEsercizi, setCatalogoEsercizi] = useState([]);
  const [ricercaEsercizio, setRicercaEsercizio] = useState('');
  // Typo-tolerant search (utils/ricerca.js): the index is built once
  const indiceEsercizi = useMemo(() => indicizzaEsercizi(catalogoEsercizi), [catalogoEsercizi]);
  const risultatiEsercizi = useMemo(() => cerca(indiceEsercizi, ricercaEsercizio), [indiceEsercizi, ricercaEsercizio]);
  const [creandoScheda, setCreandoScheda] = useState(false);

  // On first load with the spinner; once a client is accepted, the data updates in place
  const caricaDati = useCallback(() => Promise.all([
    api.get('/pt/dashboard'),
    api.get('/pt/clienti'),
    api.get('/pt/richieste'),
    api.get('/pt/appuntamenti'),
    api.get('/pt/schede'),
    api.get('/pt/annunci'),
  ])
    .then(([s, c, r, a, sc, an]) => {
      setStats(s.dati); setClienti(c.dati || []); setRichieste(r.dati || []);
      setAppuntamenti(a.dati || []); setSchede(sc.dati || []); setAnnunci(an.dati || []);
    })
    .catch(err => console.error('Errore caricamento dati PT:', err))
    .finally(() => setCaricamento(false)), []);

  useEffect(() => { caricaDati(); }, [caricaDati]);

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
    if (!confirm(t('dashboardPT.confermaEliminaAppuntamento'))) return;
    try { await api.delete(`/pt/appuntamenti/${id}`); setAppuntamenti(prev => prev.filter(a => a.id !== id)); }
    catch (err) { alert(err.message); }
  };

  const toggleCompletato = async (app) => {
    try { await api.patch(`/pt/appuntamenti/${app.id}`, { completato: !app.completato }); setAppuntamenti(prev => prev.map(a => a.id === app.id ? { ...a, completato: !a.completato } : a)); }
    catch (err) { alert(err.message); }
  };

  const assegnaScheda = async (clienteId, schedaId) => {
    try { await api.post(`/pt/clienti/${clienteId}/assegna-scheda`, { schedaId }); alert(t('dashboardPT.schedaAssegnata')); }
    catch (err) { alert(err.message); }
  };

  const terminaCliente = async (clienteId) => {
    if (!confirm(t('dashboardPT.confermaTerminaCliente'))) return;
    try { await api.delete(`/pt/clienti/${clienteId}`); setClienti(prev => prev.filter(c => c.id !== clienteId)); setClienteDettaglio(null); }
    catch (err) { alert(err.message); }
  };

  const apriDettaglioCliente = async (clienteId) => {
    try { const r = await api.get(`/pt/clienti/${clienteId}`); setClienteDettaglio(r.dati); }
    catch (err) { alert(err.message); }
  };

  const eliminaSchedaAssegnata = async (clienteId, schedaId) => {
    if (!confirm(t('dashboardPT.confermaRimuoviScheda'))) return;
    try {
      await api.delete(`/pt/clienti/${clienteId}/schede/${schedaId}`);
      setClienteDettaglio(prev => ({ ...prev, schedeAssegnate: prev.schedeAssegnate.filter(s => s.id !== schedaId) }));
    } catch (err) { alert(err.message); }
  };

  // --- Announcements ---
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
    if (!confirm(t('dashboardPT.confermaEliminaAnnuncio'))) return;
    try { await api.delete(`/pt/annunci/${id}`); setAnnunci(prev => prev.filter(a => a.id !== id)); }
    catch (err) { alert(err.message); }
  };

  // --- Plans ---
  const caricaCatalogo = async () => {
    if (catalogoEsercizi.length > 0) return;
    try { const r = await api.get('/esercizi?limite=500'); setCatalogoEsercizi(r.dati || []); }
    catch { setCatalogoEsercizi([]); }
  };

  const creaSchedaPT = async () => {
    if (!formScheda.titolo || formScheda.esercizi.length === 0) return alert(t('dashboardPT.titoloEEsercizioObbligatori'));
    try {
      setCreandoScheda(true);
      const r = await api.post('/pt/schede', formScheda);
      setSchede(prev => [r.dati, ...prev]);
      setFormScheda({ titolo: '', descrizione: '', livello: 'BASE', esercizi: [] });
      setSubTabSchede('mie');
    } catch (err) { alert(err.message); }
    finally { setCreandoScheda(false); }
  };

  const aggiungiEsercizioAScheda = (es) => {
    setFormScheda(prev => ({ ...prev, esercizi: [...prev.esercizi, { esercizioId: es.id, nome: nomeEsercizio(es), serieTarget: 3, repTarget: '8-12', recuperoSecondi: 90 }] }));
    setRicercaEsercizio('');
  };

  const rimuoviEsercizioDaScheda = (idx) => {
    setFormScheda(prev => ({ ...prev, esercizi: prev.esercizi.filter((_, i) => i !== idx) }));
  };

  // --- Calendar helpers ---
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
        <h1 className="text-2xl md:text-3xl font-extrabold">{t('dashboardPT.titolo')}</h1>
        <p className="text-[var(--testo-secondario)] text-sm">{t('dashboardPT.benvenuto', { nome: utente?.nome })}</p>
      </motion.div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
        {TABS.map(voce => (
          <button key={voce.id} onClick={() => { setTab(voce.id); if (voce.id === 'esercizi') caricaCatalogo(); }}
            className={`shrink-0 px-4 py-2 rounded-[var(--raggio-pieno)] text-sm font-medium transition-all ${
              tab === voce.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)]'
            }`}>{t(voce.label)}</button>
        ))}
      </div>

      {/* ======= OVERVIEW TAB ======= */}
      {tab === 'panoramica' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {/* Quick actions */}
          <div className="glass-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-3">{t('dashboardPT.azioniRapide')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button onClick={() => setTab('esercizi')} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">➕</span><span className="text-xs font-semibold">{t('dashboardPT.creaScheda')}</span>
              </button>
              <button onClick={() => setTab('calendario')} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">📅</span><span className="text-xs font-semibold">{t('dashboardPT.appuntamento')}</span>
              </button>
              <button onClick={() => setMostraFormAnnuncio(true)} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">📢</span><span className="text-xs font-semibold">{t('dashboardPT.annuncio')}</span>
              </button>
              <Link to={`/trainer/${utente?.id}`} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--bg-terziario)] hover:bg-[var(--accent-dim)] transition-colors">
                <span className="text-xl">🔗</span><span className="text-xs font-semibold">{t('dashboardPT.profiloPubblico')}</span>
              </Link>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t('dashboardPT.kpi.clientiAttivi'), valore: stats?.clientiAttivi || 0, icona: '👥', colore: 'var(--accent)' },
              { label: t('dashboardPT.kpi.richieste'), valore: stats?.richiesteInAttesa || 0, icona: '📩', colore: 'var(--avviso)' },
              { label: t('dashboardPT.kpi.appuntamentiOggi'), valore: stats?.appuntamentiOggi || 0, icona: '📅', colore: 'var(--successo)' },
              { label: t('dashboardPT.kpi.sessioniClienti'), valore: stats?.sessioniClienti || 0, icona: '🏋️', colore: 'var(--accent-alt)' },
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
                <span className="w-2 h-2 rounded-full bg-[var(--avviso)] anima-pulsa"></span> {t('dashboardPT.richiestePendenti')}
              </h3>
              <div className="flex flex-col gap-2">
                {richieste.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {r.utente?.nome?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{r.utente?.nome}</p>
                      <p className="text-xs text-[var(--testo-terziario)]">{r.utente?.obiettivoFitness || t('dashboardPT.nessunObiettivo')}</p>
                      {r.messaggioRichiesta && (
                        <p className="text-xs text-[var(--testo-secondario)] italic mt-1 line-clamp-3">“{r.messaggioRichiesta}”</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => gestisciRichiesta(r.id, 'accetta')} className="px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--successo)] text-white">{t('dashboardPT.accetta')}</button>
                      <button onClick={() => gestisciRichiesta(r.id, 'rifiuta')} className="px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-bold bg-[var(--pericolo-dim)] text-[var(--pericolo)]">{t('dashboardPT.rifiuta')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your clients */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">{t('dashboardPT.tuoiClienti')}</h3>
              {clienti.length > 0 && <button onClick={() => setTab('clienti')} className="text-xs text-[var(--accent)] font-semibold">{t('dashboardPT.vediTutti')}</button>}
            </div>
            {clienti.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-[var(--testo-secondario)] mb-3"><Testo t="dashboardPT.nessunClienteAncora" componenti={{ b: <b /> }} /></p>
                <Link to={`/trainer/${utente?.id}`} className="btn-primario inline-flex text-sm">{t('dashboardPT.vediMioProfilo')}</Link>
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
                        {c.ultimoAccesso
                          ? t('dashboardPT.clienteAttivo', { quando: formattaDataRelativa(c.ultimoAccesso), count: c._count?.sessioni || 0 })
                          : t('dashboardPT.clienteMaiAttivo', { count: c._count?.sessioni || 0 })}
                      </p>
                    </div>
                    {c.obiettivoFitness && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondario)] text-[var(--testo-secondario)] shrink-0">{c.obiettivoFitness}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming appointments */}
          <div className="glass-card p-5">
            <h3 className="font-bold text-lg mb-3">{t('dashboardPT.prossimiAppuntamenti')}</h3>
            {appuntamenti.filter(a => !a.completato && new Date(a.dataOra) >= new Date()).length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)]">{t('dashboardPT.nessunAppuntamentoInProgramma')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {appuntamenti.filter(a => !a.completato && new Date(a.dataOra) >= new Date()).slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                    <div className="text-center shrink-0 w-12">
                      <div className="text-xs text-[var(--accent)] font-bold">{new Date(a.dataOra).toLocaleDateString(localeCorrente(), { day: '2-digit', month: 'short' })}</div>
                      <div className="text-[10px] text-[var(--testo-terziario)]">{new Date(a.dataOra).toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' })}</div>
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

          {/* Announcements board */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">{t('dashboardPT.bachecaAnnunci')}</h3>
              <button onClick={() => setMostraFormAnnuncio(!mostraFormAnnuncio)} className="btn-primario text-xs !py-1.5 !px-3">
                {mostraFormAnnuncio ? t('comune.chiudi') : t('dashboardPT.nuovo')}
              </button>
            </div>
            {mostraFormAnnuncio && (
              <div className="mb-4 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] flex flex-col gap-2">
                <input type="text" value={formAnnuncio.titolo} onChange={e => setFormAnnuncio(p => ({...p, titolo: e.target.value}))} className="campo-input" placeholder={t('dashboardPT.titoloAnnuncio')} />
                <textarea value={formAnnuncio.contenuto} onChange={e => setFormAnnuncio(p => ({...p, contenuto: e.target.value}))} className="campo-input min-h-[60px] resize-none" placeholder={t('dashboardPT.contenuto')} rows="2" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={formAnnuncio.priorita} onChange={e => setFormAnnuncio(p => ({...p, priorita: e.target.value}))} className="campo-input text-xs">
                    <option value="normale">{t('dashboardPT.priorita.normale')}</option>
                    <option value="importante">{t('dashboardPT.priorita.importante')}</option>
                    <option value="urgente">{t('dashboardPT.priorita.urgente')}</option>
                  </select>
                  <select value={formAnnuncio.destinatarioId} onChange={e => setFormAnnuncio(p => ({...p, destinatarioId: e.target.value}))} className="campo-input text-xs">
                    <option value="">{t('dashboardPT.tuttiIClienti')}</option>
                    {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <button onClick={creaAnnuncio} disabled={!formAnnuncio.titolo || !formAnnuncio.contenuto} className="btn-primario text-sm disabled:opacity-50">{t('dashboardPT.pubblica')}</button>
              </div>
            )}
            {annunci.length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)]">{t('dashboardPT.nessunAnnuncio')}</p>
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
                      <p className="text-[10px] text-[var(--testo-terziario)] mt-1">{new Date(a.creatoIl).toLocaleDateString(localeCorrente())}</p>
                    </div>
                    <button onClick={() => eliminaAnnuncio(a.id)} className="text-[var(--pericolo)] text-xs opacity-50 hover:opacity-100 shrink-0 mt-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ======= CLIENTS TAB ======= */}
      {tab === 'clienti' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {clienti.length === 0 ? (
            <div className="glass-card p-8 text-center"><div className="text-4xl mb-3">👥</div><p className="text-[var(--testo-secondario)]">{t('dashboardPT.nessunCliente')}</p></div>
          ) : clienti.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => apriDettaglioCliente(c.id)}
              className="glass-card p-4 flex items-center gap-4 cursor-pointer group hover:border-[var(--bordo-hover)] transition-all">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {c.immagineProfilo ? <img src={c.immagineProfilo} className="w-full h-full rounded-full object-cover" /> : c.nome?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{c.nome}</p>
                <p className="text-xs text-[var(--testo-terziario)]">{t('dashboardPT.obiettivoSessioni', { obiettivo: c.obiettivoFitness || t('dashboardPT.nessunObiettivo'), count: c._count?.sessioni || 0 })}</p>
              </div>
              <span className="text-xs text-[var(--accent)] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">{t('dashboardPT.dettagli')}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ======= CALENDAR TAB ======= */}
      {tab === 'calendario' && (() => {
        const { offset, totGiorni, anno, mese } = giorniMeseCalendario();
        const oggi = new Date();
        const oggiStr = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
        const appDelGiorno = giornoSelezionato ? appuntamentiDelGiorno(giornoSelezionato) : [];
        // Short weekday names, Monday first (1 January 2024 was a Monday)
        const nomiGiorni = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(localeCorrente(), { weekday: 'short' }));

        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            {/* Calendar header */}
            <div className="flex items-center justify-between">
              <button onClick={() => cambiaMese(-1)} className="w-9 h-9 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center hover:bg-[var(--bordo)] transition-colors">←</button>
              <h3 className="font-bold text-lg capitalize">
                {meseCalendario.toLocaleDateString(localeCorrente(), { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => cambiaMese(1)} className="w-9 h-9 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center hover:bg-[var(--bordo)] transition-colors">→</button>
            </div>

            {/* Calendar grid */}
            <div className="glass-card p-4 overflow-hidden">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {nomiGiorni.map(d => (
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

            {/* Detail of the selected day */}
            {giornoSelezionato && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold">{new Date(anno, mese, giornoSelezionato).toLocaleDateString(localeCorrente(), { day: 'numeric', month: 'long' })}</h4>
                  <button onClick={() => { setMostraNuovoApp(true); const d = `${anno}-${String(mese+1).padStart(2,'0')}-${String(giornoSelezionato).padStart(2,'0')}T09:00`; setFormApp(p => ({...p, dataOra: d})); }}
                    className="btn-primario text-xs !py-1.5 !px-3">{t('dashboardPT.piuAppuntamento')}</button>
                </div>
                {appDelGiorno.length === 0 ? (
                  <p className="text-sm text-[var(--testo-terziario)]">{t('dashboardPT.nessunAppuntamentoGiorno')}</p>
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
                            {a.cliente?.nome} · {new Date(a.dataOra).toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' })} · {a.durataMinuti}min
                          </p>
                        </div>
                        <button onClick={() => eliminaAppuntamento(a.id)} className="text-[var(--pericolo)] text-xs opacity-60 hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Full list (below the calendar) */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg">{t('dashboardPT.tuttiGliAppuntamenti')}</h3>
                <button onClick={() => setMostraNuovoApp(true)} className="btn-primario text-sm !py-2 !px-4">{t('dashboardPT.nuovo')}</button>
              </div>
              {appuntamenti.length === 0 ? (
                <p className="text-sm text-[var(--testo-terziario)]">{t('dashboardPT.nessunAppuntamento')}</p>
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
                          {a.cliente?.nome} · {new Date(a.dataOra).toLocaleDateString(localeCorrente())} {new Date(a.dataOra).toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' })} · {a.durataMinuti}min
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

      {/* ======= EXERCISES & PLANS TAB ======= */}
      {tab === 'esercizi' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {/* Sub-tabs */}
          <div className="flex gap-2">
            {[
              { id: 'mie', label: t('dashboardPT.sottoTab.mie') },
              { id: 'crea', label: t('dashboardPT.sottoTab.crea') },
              { id: 'catalogo', label: t('dashboardPT.sottoTab.catalogo') },
            ].map(st => (
              <button key={st.id} onClick={() => { setSubTabSchede(st.id); if (st.id === 'crea') caricaCatalogo(); }}
                className={`px-3 py-1.5 rounded-[var(--raggio-sm)] text-xs font-medium transition-all ${
                  subTabSchede === st.id ? 'bg-[var(--testo-primario)] text-[var(--bg-primario)]' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'
                }`}>{st.label}</button>
            ))}
          </div>

          {/* Sub-tab: My plans */}
          {subTabSchede === 'mie' && (
            <>
              {schede.filter(s => s.creatoreId === utente?.id).length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-[var(--testo-secondario)]">{t('dashboardPT.nessunaSchedaCreata')}</p>
                  <button onClick={() => { setSubTabSchede('crea'); caricaCatalogo(); }} className="btn-primario text-sm mt-3">{t('dashboardPT.creaLaPrima')}</button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {schede.filter(s => s.creatoreId === utente?.id).map(s => (
                    <div key={s.id} className="glass-card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold truncate">{s.titolo}</h4>
                        <span className={`badge ${LIVELLI[s.livello]?.colore || 'accent'} text-[10px]`}>{LIVELLI[s.livello] && t(LIVELLI[s.livello].label)}</span>
                      </div>
                      {s.descrizione && <p className="text-xs text-[var(--testo-secondario)] mb-2 line-clamp-1">{s.descrizione}</p>}
                      <p className="text-xs text-[var(--testo-terziario)]">{t('comune.esercizi', { count: s.esercizi?.length || 0 })} · {t('dashboardPT.sessioni', { count: s._count?.sessioni || 0 })}</p>
                      {clienti.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-[var(--bordo)]">
                          <select onChange={e => { if (e.target.value) assegnaScheda(e.target.value, s.id); e.target.value = ''; }} className="campo-input text-xs !py-1.5">
                            <option value="">{t('dashboardPT.assegnaACliente')}</option>
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

          {/* Sub-tab: Create plan */}
          {subTabSchede === 'crea' && (
            <div className="glass-card p-5">
              <h3 className="font-bold text-lg mb-4">{t('dashboardPT.creaNuovaScheda')}</h3>
              <div className="flex flex-col gap-3">
                <input type="text" value={formScheda.titolo} onChange={e => setFormScheda(p => ({...p, titolo: e.target.value}))} className="campo-input" placeholder={t('dashboardPT.titoloScheda')} />
                <textarea value={formScheda.descrizione} onChange={e => setFormScheda(p => ({...p, descrizione: e.target.value}))} className="campo-input min-h-[50px] resize-none" placeholder={t('dashboardPT.descrizioneOpzionale')} rows="2" />
                <select value={formScheda.livello} onChange={e => setFormScheda(p => ({...p, livello: e.target.value}))} className="campo-input">
                  <option value="BASE">{t(LIVELLI.BASE.label)}</option>
                  <option value="INTERMEDIO">{t(LIVELLI.INTERMEDIO.label)}</option>
                  <option value="AVANZATO">{t(LIVELLI.AVANZATO.label)}</option>
                </select>

                {/* Exercise search */}
                <div className="border-t border-[var(--bordo)] pt-3">
                  <label className="text-xs font-bold text-[var(--testo-terziario)] mb-2 block">{t('dashboardPT.aggiungiEsercizi')}</label>
                  <div className="relative">
                    <input type="text" value={ricercaEsercizio} onChange={e => setRicercaEsercizio(e.target.value)} className="campo-input" placeholder={t('dashboardPT.cercaEsercizio')} />
                    {ricercaEsercizio.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-secondario)] border border-[var(--bordo)] rounded-[var(--raggio-md)] max-h-48 overflow-y-auto z-10 shadow-xl">
                        {risultatiEsercizi.slice(0, 15).map(e => (
                          <button key={e.id} onClick={() => aggiungiEsercizioAScheda(e)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-terziario)] border-b border-[var(--bordo)] last:border-0 flex items-center justify-between">
                            <span className="truncate">{nomeEsercizio(e)}</span>
                            <span className="text-[10px] text-[var(--testo-terziario)] shrink-0 ml-2">{nomeGruppo(e.gruppoMuscoloPrimario)}</span>
                          </button>
                        ))}
                        {risultatiEsercizi.length === 0 && (
                          <p className="px-4 py-3 text-xs text-[var(--testo-terziario)]">{t('dashboardPT.nessunRisultato')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* List of added exercises */}
                {formScheda.esercizi.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {formScheda.esercizi.map((es, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                        <span className="w-6 h-6 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate">{es.nome}</span>
                        <input type="number" value={es.serieTarget} onChange={e => { const n = [...formScheda.esercizi]; n[idx].serieTarget = parseInt(e.target.value) || 3; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-14 text-center text-xs !py-1" title={t('dashboardPT.serie')} min="1" />
                        <span className="text-[10px] text-[var(--testo-terziario)]">x</span>
                        <input type="text" value={es.repTarget} onChange={e => { const n = [...formScheda.esercizi]; n[idx].repTarget = e.target.value; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-16 text-center text-xs !py-1" title={t('dashboardPT.ripetizioni')} />
                        <input type="number" value={es.recuperoSecondi} onChange={e => { const n = [...formScheda.esercizi]; n[idx].recuperoSecondi = parseInt(e.target.value) || 90; setFormScheda(p => ({...p, esercizi: n})); }}
                          className="campo-input !w-16 text-center text-xs !py-1" title={t('dashboardPT.recuperoSecondi')} min="0" step="15" />
                        <span className="text-[10px] text-[var(--testo-terziario)]">s</span>
                        <button onClick={() => rimuoviEsercizioDaScheda(idx)} className="text-[var(--pericolo)] text-xs opacity-60 hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={creaSchedaPT} disabled={creandoScheda || !formScheda.titolo || formScheda.esercizi.length === 0}
                  className="btn-primario disabled:opacity-50 mt-2">
                  {creandoScheda ? t('dashboardPT.creazione') : t('dashboardPT.creaSchedaConferma')}
                </button>
              </div>
            </div>
          )}

          {/* Sub-tab: Catalog (global plans) */}
          {subTabSchede === 'catalogo' && (
            <>
              {schede.filter(s => s.visibilita === 'GLOBALE').length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-[var(--testo-secondario)]">{t('dashboardPT.nessunaSchedaGlobale')}</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {schede.filter(s => s.visibilita === 'GLOBALE').map(s => (
                    <div key={s.id} className="glass-card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold truncate">{s.titolo}</h4>
                        <span className={`badge ${LIVELLI[s.livello]?.colore || 'accent'} text-[10px]`}>{LIVELLI[s.livello] && t(LIVELLI[s.livello].label)}</span>
                      </div>
                      {s.descrizione && <p className="text-xs text-[var(--testo-secondario)] mb-1 line-clamp-1">{s.descrizione}</p>}
                      <p className="text-xs text-[var(--testo-terziario)] mb-1">{t('dashboardPT.creataDa', { nome: s.creatore?.nome, count: s.esercizi?.length || 0 })}</p>
                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-[var(--accent)] font-medium">{t('dashboardPT.vediEsercizi')}</summary>
                        <ol className="mt-1 pl-4 list-decimal text-[var(--testo-secondario)]">
                          {s.esercizi?.map(e => <li key={e.id}>{nomeEsercizio(e.esercizio)} ({e.serieTarget}x{e.repTarget})</li>)}
                        </ol>
                      </details>
                      {clienti.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-[var(--bordo)]">
                          <select onChange={e => { if (e.target.value) assegnaScheda(e.target.value, s.id); e.target.value = ''; }} className="campo-input text-xs !py-1.5">
                            <option value="">{t('dashboardPT.assegnaACliente')}</option>
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

      {/* ======= CLIENT DETAIL MODAL ======= */}
      <AnimatePresence>
        {clienteDettaglio && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setClienteDettaglio(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              {/* Client header */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {clienteDettaglio.cliente?.immagineProfilo ? <img src={clienteDettaglio.cliente.immagineProfilo} className="w-full h-full object-cover" /> : clienteDettaglio.cliente?.nome?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{clienteDettaglio.cliente?.nome}</h2>
                  <p className="text-xs text-[var(--testo-terziario)]">{clienteDettaglio.cliente?.obiettivoFitness || t('dashboardPT.nessunObiettivo')} · {clienteDettaglio.cliente?.email}</p>
                </div>
                <button onClick={() => setClienteDettaglio(null)} className="w-8 h-8 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center shrink-0">✕</button>
              </div>

              {/* KPI Cards */}
              {clienteDettaglio.statistiche && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                  {[
                    { l: t('dashboardPT.statistiche.sessioni'), v: clienteDettaglio.statistiche.totaleSessioni, i: '🏋️', c: '#6366F1' },
                    { l: t('dashboardPT.statistiche.ore'), v: formattaDurata(clienteDettaglio.statistiche.totaleDurata), i: '⏱️', c: '#8B5CF6' },
                    { l: t('dashboardPT.statistiche.volume'), v: formattaNumero(clienteDettaglio.statistiche.totaleVolume), i: '📦', c: '#EC4899' },
                    { l: t('dashboardPT.statistiche.record'), v: clienteDettaglio.statistiche.totaleRecord, i: '🏆', c: '#F59E0B' },
                  ].map((k, i) => (
                    <div key={i} className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                      <div className="text-lg mb-0.5">{k.i}</div>
                      <div className="text-lg font-extrabold" style={{ color: k.c }}>{k.v}</div>
                      <div className="text-[10px] text-[var(--testo-terziario)] uppercase">{k.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* The client's body composition (the personal trainer can add measurements) */}
              <div className="mb-5">
                <h4 className="text-sm font-bold mb-2 flex items-center gap-2">{t('dashboardPT.composizioneCorporea')}</h4>
                <ComposizioneCorporea clienteId={clienteDettaglio.cliente?.id} altezzaCm={clienteDettaglio.cliente?.altezzaCm} />
              </div>

              {/* Volume chart */}
              {clienteDettaglio.statistiche?.sessioni?.length > 0 && (
                <div className="mb-5 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                  <h4 className="text-xs font-bold text-[var(--testo-terziario)] mb-3">{t('dashboardPT.volumeNelTempo')}</h4>
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

              {/* Muscle groups */}
              {clienteDettaglio.statistiche?.gruppiMuscolari?.length > 0 && (
                <div className="mb-5 p-4 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                  <h4 className="text-xs font-bold text-[var(--testo-terziario)] mb-3">{t('dashboardPT.gruppiMuscolari')}</h4>
                  <div className="flex flex-col gap-1.5">
                    {clienteDettaglio.statistiche.gruppiMuscolari.slice(0, 6).map((g, i) => {
                      const max = clienteDettaglio.statistiche.gruppiMuscolari[0]?.serie || 1;
                      return (
                        <div key={g.nome} className="flex items-center gap-2 text-xs">
                          <span className="w-16 truncate text-[var(--testo-secondario)]">{GRUPPI_MUSCOLARI[g.nome]?.emoji || '💪'} {nomeGruppo(g.nome)}</span>
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

              {/* Plans assigned by the personal trainer */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold mb-2">{t('dashboardPT.schedeAssegnate')}</h4>
                {(!clienteDettaglio.schedeAssegnate || clienteDettaglio.schedeAssegnate.length === 0) ? (
                  <p className="text-xs text-[var(--testo-terziario)] p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">{t('dashboardPT.nessunaSchedaAssegnata')}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {clienteDettaglio.schedeAssegnate.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.titolo}</p>
                          <p className="text-[10px] text-[var(--testo-terziario)]">{t('comune.esercizi', { count: s.esercizi?.length || 0 })} · {t('dashboardPT.sessioni', { count: s._count?.sessioni || 0 })} · {new Date(s.creatoIl).toLocaleDateString(localeCorrente())}</p>
                        </div>
                        <button onClick={() => eliminaSchedaAssegnata(clienteDettaglio.cliente?.id, s.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--pericolo-dim)] text-[var(--pericolo)] hover:bg-[var(--pericolo)] hover:text-white transition-colors shrink-0 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Personal records */}
              {clienteDettaglio.record?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold mb-2">{t('dashboardPT.topRecord')}</h4>
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

              {/* Latest workouts */}
              {clienteDettaglio.ultime5Sessioni?.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold mb-2">{t('dashboardPT.ultimeSessioni')}</h4>
                  <div className="flex flex-col gap-1">
                    {clienteDettaglio.ultime5Sessioni.map(s => (
                      <div key={s.id} className="flex justify-between text-xs py-1.5 px-2 rounded bg-[var(--bg-terziario)]">
                        <span className="truncate flex-1">{titoloAllenamento(s)}</span>
                        <span className="text-[var(--testo-terziario)] ml-2">{new Date(s.dataInizio).toLocaleDateString(localeCorrente())}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => terminaCliente(clienteDettaglio.cliente?.id)}
                className="w-full mt-2 py-2 rounded-[var(--raggio-md)] text-sm text-[var(--pericolo)] border border-[var(--pericolo-dim)] hover:bg-[var(--pericolo-dim)] transition-all">
                {t('dashboardPT.terminaRapporto')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======= NEW APPOINTMENT MODAL ======= */}
      <AnimatePresence>
        {mostraNuovoApp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setMostraNuovoApp(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="glass-card w-full max-w-sm p-6">
              <h3 className="text-lg font-bold mb-4">{t('dashboardPT.nuovoAppuntamento')}</h3>
              <div className="flex flex-col gap-3">
                <select value={formApp.clienteId} onChange={e => setFormApp(p => ({ ...p, clienteId: e.target.value }))} className="campo-input">
                  <option value="">{t('dashboardPT.selezionaCliente')}</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="text" value={formApp.titolo} onChange={e => setFormApp(p => ({ ...p, titolo: e.target.value }))} className="campo-input" placeholder={t('dashboardPT.titoloAppuntamento')} />
                <input type="datetime-local" value={formApp.dataOra} onChange={e => setFormApp(p => ({ ...p, dataOra: e.target.value }))} className="campo-input" />
                <input type="number" value={formApp.durataMinuti} onChange={e => setFormApp(p => ({ ...p, durataMinuti: parseInt(e.target.value) }))} className="campo-input" placeholder={t('dashboardPT.durataMinuti')} min="15" step="15" />
                <textarea value={formApp.descrizione} onChange={e => setFormApp(p => ({ ...p, descrizione: e.target.value }))} className="campo-input min-h-[60px] resize-none" placeholder={t('dashboardPT.descrizioneOpzionale')} rows="2" />
                <div className="flex gap-2">
                  <button onClick={() => setMostraNuovoApp(false)} className="flex-1 btn-secondario">{t('comune.annulla')}</button>
                  <button onClick={creaAppuntamento} disabled={!formApp.clienteId || !formApp.titolo || !formApp.dataOra} className="flex-1 btn-primario disabled:opacity-50">{t('dashboardPT.crea')}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
