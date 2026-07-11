// ============================================
// GymMaster — Composizione corporea (con storico)
// Riutilizzabile: modalità proprietario o PT-per-cliente.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { api } from '../../config/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';

// Campi misurazione: il primo (peso) è base, gli altri sono "info avanzate"
const CAMPI = [
  { k: 'peso', label: 'Peso', unita: 'kg', step: '0.1' },
  { k: 'grassoCorporeoPct', label: 'Grasso corporeo', unita: '%', step: '0.1' },
  { k: 'massaMuscolareKg', label: 'Massa muscolare', unita: 'kg', step: '0.1' },
  { k: 'muscoloScheletricoPct', label: 'Muscolo scheletrico', unita: '%', step: '0.1' },
  { k: 'acquaPct', label: 'Acqua corporea', unita: '%', step: '0.1' },
  { k: 'massaMagraKg', label: 'Massa magra (senza grasso)', unita: 'kg', step: '0.1' },
  { k: 'grassoSottocutaneoPct', label: 'Grasso sottocutaneo', unita: '%', step: '0.1' },
  { k: 'grassoViscerale', label: 'Grasso viscerale', unita: 'liv.', step: '1' },
  { k: 'massaOsseaKg', label: 'Massa ossea', unita: 'kg', step: '0.1' },
  { k: 'proteinePct', label: 'Proteine', unita: '%', step: '0.1' },
  { k: 'bmr', label: 'Metabolismo basale (BMR)', unita: 'kcal', step: '1' },
  { k: 'etaMetabolica', label: 'Età metabolica', unita: 'anni', step: '1' },
];
const FORM_VUOTO = Object.fromEntries(CAMPI.map(c => [c.k, '']));

function Delta({ attuale, precedente, invertito }) {
  if (attuale == null || precedente == null) return null;
  const d = Math.round((attuale - precedente) * 10) / 10;
  if (d === 0) return <span className="text-[10px] text-[var(--testo-terziario)]">=</span>;
  const positivo = d > 0;
  // "invertito": per peso/grasso un calo è "buono" (verde)
  const buono = invertito ? !positivo : positivo;
  return (
    <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${buono ? 'text-[var(--successo)]' : 'text-[var(--pericolo)]'}`}>
      {positivo ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{positivo ? '+' : ''}{d}
    </span>
  );
}

export default function ComposizioneCorporea({ clienteId = null, altezzaCm = null, modificabile = true }) {
  const base = clienteId ? `/misurazioni/cliente/${clienteId}` : '/misurazioni';
  const [lista, setLista] = useState(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [mostraAvanzate, setMostraAvanzate] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [salvando, setSalvando] = useState(false);

  const carica = () => api.get(base).then(r => setLista(r.dati || [])).catch(() => setLista([]));
  useEffect(() => { carica(); }, [clienteId]);

  const ultima = lista?.[0];
  const penultima = lista?.[1];

  // BMI: usa quello salvato o lo calcola da peso + altezza
  const bmiCalcolato = (m) => {
    if (!m) return null;
    if (m.bmi != null) return m.bmi;
    if (m.peso != null && altezzaCm) return Math.round((m.peso / Math.pow(altezzaCm / 100, 2)) * 10) / 10;
    return null;
  };

  const datiGrafico = useMemo(() => {
    if (!lista) return [];
    return [...lista].reverse().filter(m => m.peso != null).map(m => ({
      data: new Date(m.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
      peso: m.peso,
      grasso: m.grassoCorporeoPct
    }));
  }, [lista]);

  const salva = async () => {
    setSalvando(true);
    try {
      await api.post(base, form);
      setForm(FORM_VUOTO);
      setMostraForm(false);
      setMostraAvanzate(false);
      await carica();
    } catch (err) { alert(err.message); }
    finally { setSalvando(false); }
  };

  const elimina = async (id) => {
    if (!confirm('Eliminare questa misurazione?')) return;
    try { await api.delete(`/misurazioni/${id}`); await carica(); } catch (err) { alert(err.message); }
  };

  const bmiUlt = bmiCalcolato(ultima);
  const snapshot = [
    { label: 'Peso', valore: ultima?.peso, unita: 'kg', prev: penultima?.peso, invertito: true, colore: 'var(--accent)' },
    { label: 'BMI', valore: bmiUlt, unita: '', prev: bmiCalcolato(penultima), invertito: true, colore: 'var(--accent-alt)' },
    { label: '% Grasso', valore: ultima?.grassoCorporeoPct, unita: '%', prev: penultima?.grassoCorporeoPct, invertito: true, colore: 'var(--avviso)' },
    { label: 'Massa musc.', valore: ultima?.massaMuscolareKg, unita: 'kg', prev: penultima?.massaMuscolareKg, invertito: false, colore: 'var(--successo)' },
  ];

  if (lista === null) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Snapshot valori attuali */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {snapshot.map(s => (
          <div key={s.label} className="glass-card p-3 text-center">
            <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-extrabold" style={{ color: s.colore }}>{s.valore != null ? s.valore : '—'}<span className="text-xs font-normal text-[var(--testo-terziario)]">{s.valore != null ? s.unita : ''}</span></p>
            <div className="flex justify-center mt-0.5"><Delta attuale={s.valore} precedente={s.prev} invertito={s.invertito} /></div>
          </div>
        ))}
      </div>

      {/* Grafico andamento peso */}
      {datiGrafico.length >= 2 && (
        <div className="glass-card p-card-inner">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-2">Andamento peso</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={datiGrafico} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradPeso" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="data" tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondario)', border: '1px solid var(--bordo)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="peso" stroke="var(--accent)" strokeWidth={2} fill="url(#gradPeso)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Aggiungi misurazione */}
      {modificabile && (
        <div className="glass-card p-card-inner">
          {!mostraForm ? (
            <button onClick={() => setMostraForm(true)} className="btn-primario w-full flex items-center justify-center gap-2">
              <Plus size={18} /> Nuova misurazione
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-[var(--testo-terziario)] mb-1">Peso (kg)</label>
                <input type="number" inputMode="decimal" step="0.1" value={form.peso}
                       onChange={e => setForm(f => ({ ...f, peso: e.target.value }))}
                       className="campo-input" placeholder="75.0" autoFocus />
              </div>

              <button onClick={() => setMostraAvanzate(a => !a)} className="flex items-center gap-1 text-sm text-[var(--accent)] font-semibold self-start">
                <ChevronDown size={16} className={`transition-transform ${mostraAvanzate ? 'rotate-180' : ''}`} /> Info avanzate (bilancia)
              </button>

              <AnimatePresence>
                {mostraAvanzate && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-2">
                      {CAMPI.filter(c => c.k !== 'peso').map(c => (
                        <div key={c.k}>
                          <label className="block text-[10px] text-[var(--testo-terziario)] mb-1 truncate">{c.label} ({c.unita})</label>
                          <input type="number" inputMode="decimal" step={c.step} value={form[c.k]}
                                 onChange={e => setForm(f => ({ ...f, [c.k]: e.target.value }))}
                                 className="campo-input text-sm" />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2">
                <button onClick={() => { setMostraForm(false); setForm(FORM_VUOTO); setMostraAvanzate(false); }} className="btn-secondario flex-1">Annulla</button>
                <button onClick={salva} disabled={salvando || !Object.values(form).some(v => v !== '')} className="btn-primario flex-1 disabled:opacity-50">
                  {salvando ? 'Salvataggio…' : 'Salva'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Storico */}
      <div className="glass-card overflow-hidden">
        <div className="p-card-inner border-b border-[var(--bordo-light)]">
          <h4 className="font-bold flex items-center gap-2">📋 Storico misurazioni</h4>
        </div>
        {lista.length === 0 ? (
          <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">Nessuna misurazione registrata.</p>
        ) : (
          <div className="divide-y divide-[var(--bordo-light)]">
            {lista.map(m => (
              <div key={m.id} className="px-card-inner py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{new Date(m.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  <p className="text-xs text-[var(--testo-terziario)] truncate">
                    {[m.peso != null && `${m.peso}kg`, bmiCalcolato(m) != null && `BMI ${bmiCalcolato(m)}`, m.grassoCorporeoPct != null && `${m.grassoCorporeoPct}% grasso`, m.massaMuscolareKg != null && `${m.massaMuscolareKg}kg musc.`].filter(Boolean).join(' · ') || 'Nessun valore'}
                    {m.inseritaDaPTId && ' · 👨‍🏫 dal PT'}
                  </p>
                </div>
                {modificabile && !clienteId && (
                  <button onClick={() => elimina(m.id)} className="text-[var(--testo-terziario)] hover:text-[var(--pericolo)] shrink-0 p-1" title="Elimina">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
