// ============================================
// GymMaster — Pagina Admin Esercizi
// Catalogo esercizi + Gestione suggerimenti utenti
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';

const STATI_BADGE = {
  IN_ATTESA: { label: 'In attesa', classe: 'bg-[var(--avviso-dim)] text-[var(--avviso)]' },
  APPROVATO: { label: 'Approvato', classe: 'bg-[var(--successo-dim)] text-[var(--successo)]' },
  RIFIUTATO: { label: 'Rifiutato', classe: 'bg-[var(--pericolo-dim)] text-[var(--pericolo)]' }
};

export default function AdminEsercizi() {
  const [esercizi, setEsercizi] = useState([]);
  const [attrezzature, setAttrezzature] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraForm, setMostraForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [form, setForm] = useState({ nome: '', gruppoMuscoloPrimario: '', gruppoMuscoloSecondario: '', attrezzaturaRichiestaId: '', descrizione: '', linkVideo: '' });

  // --- Suggerimenti ---
  const [suggerimenti, setSuggerimenti] = useState([]);
  const [editSugg, setEditSugg] = useState({}); // { [id]: { ...campi modificati } }
  const [gestendo, setGestendo] = useState(null); // ID del suggerimento in fase di gestione

  useEffect(() => {
    Promise.all([
      api.get('/esercizi').then(r => setEsercizi(r.dati || [])),
      api.get('/attrezzature').then(r => setAttrezzature(r.dati || [])),
      api.get('/admin/suggerimenti').then(r => setSuggerimenti(r.dati || []))
    ]).finally(() => setCaricamento(false));
  }, []);

  // --- Esercizi CRUD ---
  const apriForm = (e = null) => {
    if (e) { setEditId(e.id); setForm({ nome: e.nome, gruppoMuscoloPrimario: e.gruppoMuscoloPrimario, gruppoMuscoloSecondario: e.gruppoMuscoloSecondario || '', attrezzaturaRichiestaId: e.attrezzaturaRichiestaId || '', descrizione: e.descrizione || '', linkVideo: e.linkVideo || '' }); }
    else { setEditId(null); setForm({ nome: '', gruppoMuscoloPrimario: '', gruppoMuscoloSecondario: '', attrezzaturaRichiestaId: '', descrizione: '', linkVideo: '' }); }
    setMostraForm(true);
  };

  const salva = async () => {
    try {
      if (editId) { const r = await api.put(`/admin/esercizi/${editId}`, form); setEsercizi(prev => prev.map(e => e.id === editId ? r.dati : e)); }
      else { const r = await api.post('/admin/esercizi', form); setEsercizi(prev => [...prev, r.dati]); }
      setMostraForm(false);
    } catch (err) { alert(err.message); }
  };

  const elimina = async (id) => {
    if (!confirm('Elimina questo esercizio?')) return;
    try { await api.delete(`/admin/esercizi/${id}`); setEsercizi(prev => prev.filter(e => e.id !== id)); }
    catch (err) { alert(err.message); }
  };

  // --- Suggerimenti gestione ---
  const aggiornaEditSugg = (id, campo, valore) => {
    setEditSugg(prev => ({
      ...prev,
      [id]: { ...prev[id], [campo]: valore }
    }));
  };

  const approvaSuggerimento = async (sugg) => {
    setGestendo(sugg.id);
    try {
      const modifiche = editSugg[sugg.id] || {};
      const payload = {
        nome: modifiche.nome || sugg.nome,
        gruppoMuscoloPrimario: modifiche.gruppoMuscoloPrimario || sugg.gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: modifiche.gruppoMuscoloSecondario !== undefined ? modifiche.gruppoMuscoloSecondario : sugg.gruppoMuscoloSecondario,
        attrezzaturaRichiestaId: modifiche.attrezzaturaRichiestaId || '',
        descrizione: modifiche.descrizione !== undefined ? modifiche.descrizione : sugg.descrizione,
        linkVideo: modifiche.linkVideo || ''
      };

      const r = await api.patch(`/admin/suggerimenti/${sugg.id}/approva`, payload);
      // Aggiorna liste
      setSuggerimenti(prev => prev.map(s => s.id === sugg.id ? { ...s, stato: 'APPROVATO' } : s));
      setEsercizi(prev => [...prev, r.dati]);
    } catch (err) { alert(err.message); }
    finally { setGestendo(null); }
  };

  const rifiutaSuggerimento = async (sugg) => {
    const motivo = prompt('Motivo del rifiuto (opzionale):');
    setGestendo(sugg.id);
    try {
      await api.patch(`/admin/suggerimenti/${sugg.id}/rifiuta`, { motivoRifiuto: motivo || '' });
      setSuggerimenti(prev => prev.map(s => s.id === sugg.id ? { ...s, stato: 'RIFIUTATO' } : s));
    } catch (err) { alert(err.message); }
    finally { setGestendo(null); }
  };

  // --- Filtri ---
  const gruppiUnici = [...new Set(esercizi.map(e => e.gruppoMuscoloPrimario))].sort();
  const eserciziFiltrati = esercizi.filter(e => {
    if (filtroGruppo && e.gruppoMuscoloPrimario !== filtroGruppo) return false;
    if (ricerca && !e.nome.toLowerCase().includes(ricerca.toLowerCase())) return false;
    return true;
  });

  const suggerimentiPendenti = suggerimenti.filter(s => s.stato === 'IN_ATTESA');
  const suggerimentiGestiti = suggerimenti.filter(s => s.stato !== 'IN_ATTESA');

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📚 Gestione Esercizi</h1>
          <p className="text-sm text-[var(--testo-secondario)]">{esercizi.length} esercizi nel catalogo</p>
        </div>
        <button onClick={() => apriForm()} className="btn-primario">＋ Nuovo</button>
      </div>

      {/* ========================================= */}
      {/* SEZIONE SUGGERIMENTI PENDENTI */}
      {/* ========================================= */}
      {suggerimentiPendenti.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📬</span>
            <h2 className="text-lg font-bold">Suggerimenti dagli utenti</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--avviso)] text-white">
              {suggerimentiPendenti.length}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {suggerimentiPendenti.map(sugg => {
              const mod = editSugg[sugg.id] || {};
              const isGestendo = gestendo === sugg.id;

              return (
                <motion.div
                  key={sugg.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="glass-card px-card-inner py-4 border-l-4 border-[var(--avviso)]"
                >
                  {/* Header con info utente */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                        {sugg.utente?.nome?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <span className="text-sm font-medium">{sugg.utente?.nome}</span>
                        <span className="text-xs text-[var(--testo-terziario)] ml-2">
                          {new Date(sugg.creatoIl).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATI_BADGE[sugg.stato]?.classe}`}>
                      {STATI_BADGE[sugg.stato]?.label}
                    </span>
                  </div>

                  {/* Campi editabili dall'admin */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    <input
                      type="text"
                      value={mod.nome !== undefined ? mod.nome : sugg.nome}
                      onChange={e => aggiornaEditSugg(sugg.id, 'nome', e.target.value)}
                      className="campo-input text-sm"
                      placeholder="Nome esercizio"
                    />
                    <select
                      value={mod.gruppoMuscoloPrimario !== undefined ? mod.gruppoMuscoloPrimario : sugg.gruppoMuscoloPrimario}
                      onChange={e => aggiornaEditSugg(sugg.id, 'gruppoMuscoloPrimario', e.target.value)}
                      className="campo-input text-sm"
                    >
                      <option value="" disabled>Gruppo primario</option>
                      {Object.keys(GRUPPI_MUSCOLARI).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select
                      value={mod.gruppoMuscoloSecondario !== undefined ? mod.gruppoMuscoloSecondario : (sugg.gruppoMuscoloSecondario || '')}
                      onChange={e => aggiornaEditSugg(sugg.id, 'gruppoMuscoloSecondario', e.target.value)}
                      className="campo-input text-sm"
                    >
                      <option value="">Gruppo secondario (opz.)</option>
                      {Object.keys(GRUPPI_MUSCOLARI).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select
                      value={mod.attrezzaturaRichiestaId !== undefined ? mod.attrezzaturaRichiestaId : ''}
                      onChange={e => aggiornaEditSugg(sugg.id, 'attrezzaturaRichiestaId', e.target.value)}
                      className="campo-input text-sm"
                    >
                      <option value="">Attrezzatura (opz.)</option>
                      {attrezzature.map(a => <option key={a.id} value={a.id}>{a.nome} ({a.categoria})</option>)}
                    </select>
                  </div>

                  {/* Note suggerite dall'utente */}
                  {sugg.attrezzaturaSuggerita && (
                    <p className="text-xs text-[var(--testo-terziario)] mb-2 italic">
                      💬 Attrezzatura suggerita dall'utente: "{sugg.attrezzaturaSuggerita}"
                    </p>
                  )}
                  {sugg.descrizione && (
                    <p className="text-xs text-[var(--testo-terziario)] mb-2 italic">
                      📝 Note: "{sugg.descrizione}"
                    </p>
                  )}

                  {/* Campi extra admin */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    <textarea
                      value={mod.descrizione !== undefined ? mod.descrizione : (sugg.descrizione || '')}
                      onChange={e => aggiornaEditSugg(sugg.id, 'descrizione', e.target.value)}
                      className="campo-input text-sm"
                      placeholder="Descrizione (opz.)"
                      rows={1}
                    />
                    <input
                      type="url"
                      value={mod.linkVideo || ''}
                      onChange={e => aggiornaEditSugg(sugg.id, 'linkVideo', e.target.value)}
                      className="campo-input text-sm"
                      placeholder="Link video (opz.)"
                    />
                  </div>

                  {/* Azioni */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvaSuggerimento(sugg)}
                      disabled={isGestendo}
                      className="flex-1 py-2 rounded-[var(--raggio-md)] text-sm font-semibold bg-[var(--successo)] text-white hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      {isGestendo ? '...' : '✅ Approva e aggiungi al catalogo'}
                    </button>
                    <button
                      onClick={() => rifiutaSuggerimento(sugg)}
                      disabled={isGestendo}
                      className="px-4 py-2 rounded-[var(--raggio-md)] text-sm font-semibold bg-[var(--pericolo-dim)] text-[var(--pericolo)] hover:bg-[var(--pericolo)] hover:text-white transition-all disabled:opacity-50"
                    >
                      ❌
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Storico suggerimenti gestiti */}
          {suggerimentiGestiti.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-[var(--testo-terziario)] cursor-pointer hover:text-[var(--testo-secondario)]">
                Suggerimenti già gestiti ({suggerimentiGestiti.length})
              </summary>
              <div className="flex flex-col gap-1 mt-2">
                {suggerimentiGestiti.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-2 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] opacity-70">
                    <span className="text-sm">{GRUPPI_MUSCOLARI[s.gruppoMuscoloPrimario]?.emoji || '💪'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{s.nome}</span>
                      <span className="text-[10px] text-[var(--testo-terziario)] ml-2">da {s.utente?.nome}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATI_BADGE[s.stato]?.classe}`}>
                      {STATI_BADGE[s.stato]?.label}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </motion.div>
      )}

      {/* ========================================= */}
      {/* FORM NUOVO ESERCIZIO */}
      {/* ========================================= */}
      <AnimatePresence>
        {mostraForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
            <div className="glass-card p-card-inner">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} className="campo-input" placeholder="Nome esercizio *" />
                <select value={form.gruppoMuscoloPrimario} onChange={e => setForm(p => ({...p, gruppoMuscoloPrimario: e.target.value}))} className="campo-input">
                  <option value="" disabled>Gruppo primario *</option>
                  {Object.keys(GRUPPI_MUSCOLARI).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={form.gruppoMuscoloSecondario} onChange={e => setForm(p => ({...p, gruppoMuscoloSecondario: e.target.value}))} className="campo-input">
                  <option value="">Gruppo secondario (opz.)</option>
                  {Object.keys(GRUPPI_MUSCOLARI).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={form.attrezzaturaRichiestaId} onChange={e => setForm(p => ({...p, attrezzaturaRichiestaId: e.target.value}))} className="campo-input">
                  <option value="">Attrezzatura (opz.)</option>
                  {attrezzature.map(a => <option key={a.id} value={a.id}>{a.nome} ({a.categoria})</option>)}
                </select>
                <textarea value={form.descrizione} onChange={e => setForm(p => ({...p, descrizione: e.target.value}))} className="campo-input" placeholder="Descrizione (opz.)" rows={2} />
                <input type="url" value={form.linkVideo} onChange={e => setForm(p => ({...p, linkVideo: e.target.value}))} className="campo-input" placeholder="Link video (opz.)" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={salva} disabled={!form.nome || !form.gruppoMuscoloPrimario} className="btn-primario">{editId ? 'Salva' : 'Crea'}</button>
                <button onClick={() => setMostraForm(false)} className="btn-secondario">Annulla</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================= */}
      {/* FILTRI + LISTA ESERCIZI */}
      {/* ========================================= */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input type="text" value={ricerca} onChange={e => setRicerca(e.target.value)} className="campo-input campo-ricerca flex-1" placeholder="🔍 Cerca esercizio..." />
        <select value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} className="campo-input campo-select-compact" style={{ width: 'auto', minWidth: '140px', maxWidth: '180px' }}>
          <option value="">Tutti i gruppi</option>
          {gruppiUnici.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {caricamento ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
      ) : (
        <div className="flex flex-col gap-1">
          {eserciziFiltrati.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="flex items-center gap-3 px-card-inner py-3 rounded-[var(--raggio-md)] hover:bg-[var(--bg-terziario)] transition-all group">
              <span className="text-lg">{GRUPPI_MUSCOLARI[e.gruppoMuscoloPrimario]?.emoji || '💪'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.nome}</p>
                <p className="text-[10px] text-[var(--testo-terziario)]">{e.gruppoMuscoloPrimario}{e.gruppoMuscoloSecondario ? ` + ${e.gruppoMuscoloSecondario}` : ''}{e.attrezzatura ? ` · ${e.attrezzatura.nome}` : ''}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => apriForm(e)} className="text-xs text-[var(--accent)] px-1">✏️</button>
                <button onClick={() => elimina(e.id)} className="text-xs text-[var(--pericolo)] px-1">🗑️</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
