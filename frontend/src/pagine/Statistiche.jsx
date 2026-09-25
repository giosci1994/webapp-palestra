// ============================================
// GymMaster — Pagina Statistiche
// Grafici e dati sui progressi dell'utente
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { formattaNumero } from '../utils/formattatori.js';
import { motion } from 'framer-motion';
import SezioneCorpo from '../componenti/specifici/SezioneCorpo.jsx';
import IndicatoriPeriodo from '../componenti/specifici/IndicatoriPeriodo.jsx';
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
  // Due periodi di dati giornalieri: l'attuale e il precedente, per il confronto
  const [giorniDoppi, setGiorniDoppi] = useState([]);
  const [gruppi, setGruppi] = useState([]);
  // Istante del caricamento: riferimento unico per dividere i due periodi
  const [caricatoIl, setCaricatoIl] = useState(0);
  const [periodo, setPeriodo] = useState(30);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => { caricaDati(); }, [periodo]);

  const caricaDati = async () => {
    try {
      setCaricamento(true);
      const [rie, ses, grp] = await Promise.all([
        api.get('/statistiche/riepilogo'),
        api.get(`/statistiche/sessioni?giorni=${periodo * 2}`),
        api.get('/statistiche/gruppi-muscolari')
      ]);
      setRiepilogo(rie.dati);
      setGiorniDoppi(ses.dati || []);
      setCaricatoIl(Date.now());
      setGruppi(grp.dati || []);
    } catch (err) {
      console.error('Errore caricamento statistiche:', err);
    } finally {
      setCaricamento(false);
    }
  };

  // I grafici mostrano solo il periodo scelto; il precedente serve agli indicatori
  const inizioPeriodo = new Date(caricatoIl - periodo * 86400000).toISOString().slice(0, 10);
  const sessioni = giorniDoppi.filter(g => g.data >= inizioPeriodo);

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

      {/* Indicatori del periodo scelto, confrontati col precedente */}
      <div className="mb-7">
        <IndicatoriPeriodo giorni={giorniDoppi} periodo={periodo} adesso={caricatoIl} riepilogo={riepilogo} />
      </div>

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
      </div>
    </div>
  );
}
