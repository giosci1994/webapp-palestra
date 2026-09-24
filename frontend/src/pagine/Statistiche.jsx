// ============================================
// GymMaster — Pagina Statistiche
// Grafici e dati sui progressi dell'utente
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { formattaPeso, formattaNumero, formattaDurata, formattaData, nomeEsercizio} from '../utils/formattatori.js';
import { GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { motion } from 'framer-motion';
import TestoScorrevole from '../componenti/comuni/TestoScorrevole.jsx';
import SezioneCorpo from '../componenti/specifici/SezioneCorpo.jsx';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Colori per i grafici
const COLORI_GRAFICI = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#06B6D4', '#F97316', '#14B8A6', '#D946EF'];

// Periodi selezionabili
const PERIODI = [
  { id: 7, label: '7g' },
  { id: 30, label: '30g' },
  { id: 90, label: '3m' },
  { id: 365, label: '1a' }
];

export default function Statistiche() {
  const [riepilogo, setRiepilogo] = useState(null);
  const [sessioni, setSessioni] = useState([]);
  const [gruppi, setGruppi] = useState([]);
  const [record, setRecord] = useState([]);
  const [periodo, setPeriodo] = useState(30);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => { caricaDati(); }, [periodo]);

  const caricaDati = async () => {
    try {
      setCaricamento(true);
      const [rie, ses, grp, rec] = await Promise.all([
        api.get('/statistiche/riepilogo'),
        api.get(`/statistiche/sessioni?giorni=${periodo}`),
        api.get('/statistiche/gruppi-muscolari'),
        api.get('/statistiche/record')
      ]);
      setRiepilogo(rie.dati);
      setSessioni(ses.dati || []);
      setGruppi(grp.dati || []);
      setRecord(rec.dati || []);
    } catch (err) {
      console.error('Errore caricamento statistiche:', err);
    } finally {
      setCaricamento(false);
    }
  };

  const eliminaRecord = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questo record personale?')) return;
    try {
      await api.delete(`/statistiche/record/${id}`);
      setRecord(prev => prev.filter(r => r.id !== id));
      caricaDati(); // Ricarica riepilogo per aggiornare il contatore
    } catch (err) {
      alert(err.message);
    }
  };

  // Tooltip personalizzato
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card p-3 text-xs" style={{ border: '1px solid var(--bordo)' }}>
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: <strong>{typeof p.value === 'number' ? formattaNumero(Math.round(p.value)) : p.value}</strong>
          </p>
        ))}
      </div>
    );
  };

  if (caricamento) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Statistiche</h1>
        <div className="flex items-center bg-[var(--bg-terziario)] p-1 rounded-xl border border-[var(--bordo-light)]">
          {PERIODI.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all ${
                      periodo === p.id 
                        ? 'bg-[var(--accent)] text-white shadow-md' 
                        : 'text-[var(--testo-secondario)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                    }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {riepilogo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-7">
          {[
            { label: 'Sessioni', valore: riepilogo.totaleSessioni, icona: '🏋️', colore: '#6366F1' },
            { label: 'Ore Totali', valore: formattaDurata(riepilogo.totaleDurata), icona: '⏱️', colore: '#8B5CF6' },
            { label: 'Volume (kg)', valore: formattaNumero(riepilogo.totaleVolume), icona: '📦', colore: '#EC4899' },
            { label: 'Record', valore: riepilogo.totaleRecord, icona: '🏆', colore: '#F59E0B' },
            { label: 'Streak', valore: `${riepilogo.streak}g`, icona: '🔥', colore: '#EF4444' },
            { label: 'Schede', valore: riepilogo.schedeCreate, icona: '📋', colore: '#10B981' }
          ].map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="glass-card p-card-inner text-center">
              <div className="text-2xl mb-1">{kpi.icona}</div>
              <p className="text-xl font-bold" style={{ color: kpi.colore }}>{kpi.valore}</p>
              <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide mt-0.5">{kpi.label}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Corpo: gruppi muscolari, esercizi, carichi e massimali */}
      <div className="mb-7">
        <SezioneCorpo />
      </div>

      {/* Grafici */}
      <div className="grid gap-7 md:grid-cols-2">
        {/* Volume nel tempo */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="glass-card p-card-inner min-w-0 w-full overflow-hidden">
          <h3 className="text-sm font-semibold mb-4 text-[var(--testo-secondario)]">📈 Volume nel tempo (kg)</h3>
          {sessioni.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={sessioni}>
                <defs>
                  <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: '#666' }}
                       tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="volume" stroke="#6366F1" strokeWidth={2}
                      fill="url(#gradVolume)" name="Volume (kg)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-[var(--testo-terziario)]">
              Nessuna sessione nel periodo selezionato
            </div>
          )}
        </motion.div>

        {/* Durata sessioni */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="glass-card p-card-inner min-w-0 w-full overflow-hidden">
          <h3 className="text-sm font-semibold mb-4 text-[var(--testo-secondario)]">⏱️ Durata sessioni (min)</h3>
          {sessioni.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sessioni}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: '#666' }}
                       tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="durata" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Durata (min)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-[var(--testo-terziario)]">
              Nessuna sessione nel periodo selezionato
            </div>
          )}
        </motion.div>

        {/* Distribuzione gruppi muscolari */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="glass-card p-card-inner min-w-0 w-full overflow-hidden">
          <h3 className="text-sm font-semibold mb-4 text-[var(--testo-secondario)]">🎯 Gruppi muscolari</h3>
          {gruppi.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={gruppi} dataKey="serie" nameKey="nome" cx="50%" cy="50%"
                       innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {gruppi.map((_, i) => (
                      <Cell key={i} fill={COLORI_GRAFICI[i % COLORI_GRAFICI.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 flex flex-col gap-1.5">
                {gruppi.slice(0, 6).map((g, i) => (
                  <div key={g.nome} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0"
                         style={{ background: COLORI_GRAFICI[i % COLORI_GRAFICI.length] }} />
                    <span className="flex-1 truncate text-[var(--testo-secondario)]">{g.nome}</span>
                    <span className="font-semibold">{g.serie}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-[var(--testo-terziario)]">
              Nessun dato disponibile
            </div>
          )}
        </motion.div>

        {/* Record personali recenti */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                    className="glass-card p-card-inner min-w-0 w-full overflow-hidden">
          <h3 className="text-sm font-semibold mb-4 text-[var(--testo-secondario)]">🏆 Record personali</h3>
          {record.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto no-scrollbar">
              {record.slice(0, 8).map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.04 }}
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] group relative overflow-hidden shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                       style={{ background: GRUPPI_MUSCOLARI[r.esercizio?.gruppoMuscoloPrimario]?.colore + '22',
                                color: GRUPPI_MUSCOLARI[r.esercizio?.gruppoMuscoloPrimario]?.colore || 'var(--accent)' }}>
                    {GRUPPI_MUSCOLARI[r.esercizio?.gruppoMuscoloPrimario]?.emoji || '💪'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <TestoScorrevole testo={nomeEsercizio(r.esercizio)} className="text-sm font-medium text-[var(--testo-primario)]" coloreSfondo="var(--bg-terziario)" />
                    <p className="text-[10px] text-[var(--testo-terziario)]">{formattaData(r.dataRecord)}</p>
                  </div>
                  <p className="text-sm font-bold text-[var(--successo)] shrink-0 ml-1">{formattaPeso(r.pesoMaxRaggiunto)} kg</p>
                  <button 
                    onClick={() => eliminaRecord(r.id)}
                    className="w-0 overflow-hidden opacity-0 group-hover:w-6 group-hover:opacity-100 group-hover:ml-2 rounded-full flex items-center justify-center bg-[var(--pericolo-dim)] text-[var(--pericolo)] hover:bg-[var(--pericolo)] hover:text-white transition-all duration-200 shrink-0"
                    title="Elimina record"
                  >
                    🗑️
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-[var(--testo-terziario)]">
              Completa degli allenamenti per vedere i tuoi record
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
