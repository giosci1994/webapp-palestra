// ============================================
// GymMaster — Body composition (with history)
// Reusable: owner mode or personal-trainer-for-client mode.
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../config/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';

// Measurement fields: the first (weight) is basic, the others are "info avanzate" (advanced info).
// label is a translation key; unita is a unit symbol, or unitaChiave when the unit is a word.
const CAMPI = [
  { k: 'peso', label: 'composizioneCorporea.campi.peso', unita: 'kg', step: '0.1' },
  { k: 'grassoCorporeoPct', label: 'composizioneCorporea.campi.grassoCorporeoPct', unita: '%', step: '0.1' },
  { k: 'massaMuscolareKg', label: 'composizioneCorporea.campi.massaMuscolareKg', unita: 'kg', step: '0.1' },
  { k: 'muscoloScheletricoPct', label: 'composizioneCorporea.campi.muscoloScheletricoPct', unita: '%', step: '0.1' },
  { k: 'acquaPct', label: 'composizioneCorporea.campi.acquaPct', unita: '%', step: '0.1' },
  { k: 'massaMagraKg', label: 'composizioneCorporea.campi.massaMagraKg', unita: 'kg', step: '0.1' },
  { k: 'grassoSottocutaneoPct', label: 'composizioneCorporea.campi.grassoSottocutaneoPct', unita: '%', step: '0.1' },
  { k: 'grassoViscerale', label: 'composizioneCorporea.campi.grassoViscerale', unitaChiave: 'composizioneCorporea.unita.livello', step: '1' },
  { k: 'massaOsseaKg', label: 'composizioneCorporea.campi.massaOsseaKg', unita: 'kg', step: '0.1' },
  { k: 'proteinePct', label: 'composizioneCorporea.campi.proteinePct', unita: '%', step: '0.1' },
  { k: 'bmr', label: 'composizioneCorporea.campi.bmr', unita: 'kcal', step: '1' },
  { k: 'etaMetabolica', label: 'composizioneCorporea.campi.etaMetabolica', unitaChiave: 'composizioneCorporea.unita.anni', step: '1' },
];
const FORM_VUOTO = Object.fromEntries(CAMPI.map(c => [c.k, '']));

function Delta({ attuale, precedente, invertito }) {
  if (attuale == null || precedente == null) return null;
  const d = Math.round((attuale - precedente) * 10) / 10;
  if (d === 0) return <span className="text-[10px] text-[var(--testo-terziario)]">=</span>;
  const positivo = d > 0;
  // "invertito": for weight/fat a drop is "good" (green)
  const buono = invertito ? !positivo : positivo;
  return (
    <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${buono ? 'text-[var(--successo)]' : 'text-[var(--pericolo)]'}`}>
      {positivo ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{positivo ? '+' : ''}{d}
    </span>
  );
}

export default function ComposizioneCorporea({ clienteId = null, altezzaCm = null, modificabile = true }) {
  const { t, lingua } = useLingua();
  const base = clienteId ? `/misurazioni/cliente/${clienteId}` : '/misurazioni';
  const [lista, setLista] = useState(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [mostraAvanzate, setMostraAvanzate] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [salvando, setSalvando] = useState(false);

  const carica = useCallback(() => api.get(base).then(r => setLista(r.dati || [])).catch(() => setLista([])), [base]);
  useEffect(() => { carica(); }, [carica]);

  const ultima = lista?.[0];
  const penultima = lista?.[1];

  // BMI: uses the saved one or computes it from weight + height
  const bmiCalcolato = (m) => {
    if (!m) return null;
    if (m.bmi != null) return m.bmi;
    if (m.peso != null && altezzaCm) return Math.round((m.peso / Math.pow(altezzaCm / 100, 2)) * 10) / 10;
    return null;
  };

  const datiGrafico = useMemo(() => {
    if (!lista) return [];
    return [...lista].reverse().filter(m => m.peso != null).map(m => ({
      data: new Date(m.data).toLocaleDateString(localeCorrente(lingua), { day: '2-digit', month: '2-digit' }),
      peso: m.peso,
      grasso: m.grassoCorporeoPct
    }));
  }, [lista, lingua]);

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
    if (!confirm(t('composizioneCorporea.eliminaConferma'))) return;
    try { await api.delete(`/misurazioni/${id}`); await carica(); } catch (err) { alert(err.message); }
  };

  const bmiUlt = bmiCalcolato(ultima);
  const snapshot = [
    { label: t('composizioneCorporea.riepilogo.peso'), valore: ultima?.peso, unita: 'kg', prev: penultima?.peso, invertito: true, colore: 'var(--accent)' },
    { label: 'BMI', valore: bmiUlt, unita: '', prev: bmiCalcolato(penultima), invertito: true, colore: 'var(--accent-alt)' },
    { label: t('composizioneCorporea.riepilogo.grasso'), valore: ultima?.grassoCorporeoPct, unita: '%', prev: penultima?.grassoCorporeoPct, invertito: true, colore: 'var(--avviso)' },
    { label: t('composizioneCorporea.riepilogo.massaMuscolare'), valore: ultima?.massaMuscolareKg, unita: 'kg', prev: penultima?.massaMuscolareKg, invertito: false, colore: 'var(--successo)' },
  ];

  if (lista === null) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Snapshot of the current values */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {snapshot.map(s => (
          <div key={s.label} className="glass-card p-3 text-center">
            <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-extrabold" style={{ color: s.colore }}>{s.valore != null ? s.valore : '—'}<span className="text-xs font-normal text-[var(--testo-terziario)]">{s.valore != null ? s.unita : ''}</span></p>
            <div className="flex justify-center mt-0.5"><Delta attuale={s.valore} precedente={s.prev} invertito={s.invertito} /></div>
          </div>
        ))}
      </div>

      {/* Weight trend chart */}
      {datiGrafico.length >= 2 && (
        <div className="glass-card p-card-inner">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-2">{t('composizioneCorporea.andamentoPeso')}</p>
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
              <Area type="monotone" dataKey="peso" name={t('composizioneCorporea.campi.peso')} stroke="var(--accent)" strokeWidth={2} fill="url(#gradPeso)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add measurement */}
      {modificabile && (
        <div className="glass-card p-card-inner">
          {!mostraForm ? (
            <button onClick={() => setMostraForm(true)} className="btn-primario w-full flex items-center justify-center gap-2">
              <Plus size={18} /> {t('composizioneCorporea.nuovaMisurazione')}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-[var(--testo-terziario)] mb-1">{t('composizioneCorporea.campoConUnita', { nome: t(CAMPI[0].label), unita: CAMPI[0].unita })}</label>
                <input type="number" inputMode="decimal" step="0.1" value={form.peso}
                       onChange={e => setForm(f => ({ ...f, peso: e.target.value }))}
                       className="campo-input" placeholder="75.0" autoFocus />
              </div>

              <button onClick={() => setMostraAvanzate(a => !a)} className="flex items-center gap-1 text-sm text-[var(--accent)] font-semibold self-start">
                <ChevronDown size={16} className={`transition-transform ${mostraAvanzate ? 'rotate-180' : ''}`} /> {t('composizioneCorporea.infoAvanzate')}
              </button>

              <AnimatePresence>
                {mostraAvanzate && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-2">
                      {CAMPI.filter(c => c.k !== 'peso').map(c => (
                        <div key={c.k}>
                          <label className="block text-[10px] text-[var(--testo-terziario)] mb-1 truncate">{t('composizioneCorporea.campoConUnita', { nome: t(c.label), unita: c.unitaChiave ? t(c.unitaChiave) : c.unita })}</label>
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
                <button onClick={() => { setMostraForm(false); setForm(FORM_VUOTO); setMostraAvanzate(false); }} className="btn-secondario flex-1">{t('comune.annulla')}</button>
                <button onClick={salva} disabled={salvando || !Object.values(form).some(v => v !== '')} className="btn-primario flex-1 disabled:opacity-50">
                  {salvando ? t('comune.salvataggio') : t('comune.salva')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="glass-card overflow-hidden">
        <div className="p-card-inner border-b border-[var(--bordo-light)]">
          <h4 className="font-bold flex items-center gap-2">{t('composizioneCorporea.storico')}</h4>
        </div>
        {lista.length === 0 ? (
          <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">{t('composizioneCorporea.nessunaMisurazione')}</p>
        ) : (
          <div className="divide-y divide-[var(--bordo-light)]">
            {lista.map(m => (
              <div key={m.id} className="px-card-inner py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{new Date(m.data).toLocaleDateString(localeCorrente(lingua), { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  <p className="text-xs text-[var(--testo-terziario)] truncate">
                    {[m.peso != null && `${m.peso}kg`, bmiCalcolato(m) != null && `BMI ${bmiCalcolato(m)}`, m.grassoCorporeoPct != null && t('composizioneCorporea.voce.grasso', { valore: m.grassoCorporeoPct }), m.massaMuscolareKg != null && t('composizioneCorporea.voce.muscolo', { valore: m.massaMuscolareKg })].filter(Boolean).join(' · ') || t('composizioneCorporea.voce.nessunValore')}
                    {m.inseritaDaPTId && ` · ${t('composizioneCorporea.voce.dalPT')}`}
                  </p>
                </div>
                {modificabile && !clienteId && (
                  <button onClick={() => elimina(m.id)} className="text-[var(--testo-terziario)] hover:text-[var(--pericolo)] shrink-0 p-1" title={t('comune.elimina')}>
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
