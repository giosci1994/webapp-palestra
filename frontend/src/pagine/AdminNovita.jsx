// ============================================
// GymMaster — Admin: "What's new" management (in-app stories)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { motion, AnimatePresence } from 'framer-motion';

// Emojis offered for the "what's new" stories (grid picker)
const EMOJI_LISTA = [
  '✨','💪','🏋️','🔥','⚡','🎯','🏆','🥇','📈','📊','⏱️','💯','✅','🚀','❤️','🧘',
  '🤸','🏃','🚴','🤖','📱','💬','📋','📝','🔔','🎉','⭐','🌟','💎','🦾','🍎','🥗',
  '💧','😴','📅','🥊','🧠','👏','🙌','😊'
];

// Emoji picker grid (inline, no overflow/clipping)
function GrigliaEmoji({ onSelect }) {
  return (
    <div className="grid grid-cols-8 gap-1 p-2 rounded-xl bg-[var(--bg-terziario)] border border-[var(--bordo)] max-h-40 overflow-y-auto">
      {EMOJI_LISTA.map(e => (
        <button key={e} type="button" onClick={() => onSelect(e)}
          className="text-xl rounded-lg p-1.5 hover:bg-[var(--bg-secondario)] transition-colors">{e}</button>
      ))}
    </div>
  );
}

const FORM_VUOTO = {
  titolo: '', sottotitolo: '', icona: '✨',
  punti: [{ icona: '', testo: '' }],
  ctaTesto: '', ctaRotta: '',
  coloreInizio: '#8b5cf6', coloreFine: '#06b6d4',
  attiva: true, ordine: 0
};

function parsePunti(p) {
  if (!p) return [];
  try { const a = JSON.parse(p); return Array.isArray(a) ? a : []; } catch { return []; }
}

export default function AdminNovita() {
  const { t } = useLingua();
  const [lista, setLista] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraForm, setMostraForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(FORM_VUOTO);
  const [pickerAperto, setPickerAperto] = useState(null); // 'icona' | `punto-${i}` | null

  // On first load with the spinner; after an edit the list updates in place
  const carica = useCallback(() => api.get('/admin/novita')
    .then(r => setLista(r.dati || []))
    .catch(err => console.error(err))
    .finally(() => setCaricamento(false)), []);

  useEffect(() => { carica(); }, [carica]);

  const apriForm = (n = null) => {
    if (n) {
      const punti = parsePunti(n.punti);
      setEditId(n.id);
      setForm({
        titolo: n.titolo || '', sottotitolo: n.sottotitolo || '', icona: n.icona || '✨',
        punti: punti.length ? punti : [{ icona: '', testo: '' }],
        ctaTesto: n.ctaTesto || '', ctaRotta: n.ctaRotta || '',
        coloreInizio: n.coloreInizio || '#8b5cf6', coloreFine: n.coloreFine || '#06b6d4',
        attiva: n.attiva, ordine: n.ordine || 0
      });
    } else { setEditId(null); setForm(FORM_VUOTO); }
    setMostraForm(true);
  };

  const salva = async () => {
    const payload = {
      ...form,
      punti: form.punti.filter(p => p.testo?.trim()),
      ordine: parseInt(form.ordine) || 0
    };
    try {
      if (editId) await api.put(`/admin/novita/${editId}`, payload);
      else await api.post('/admin/novita', payload);
      setMostraForm(false); carica();
    } catch (err) { alert(err.message); }
  };

  const elimina = async (id) => {
    if (!confirm(t('adminNovita.confermaElimina'))) return;
    try { await api.delete(`/admin/novita/${id}`); carica(); } catch (err) { alert(err.message); }
  };

  const toggleAttiva = async (n) => {
    try { await api.put(`/admin/novita/${n.id}`, { attiva: !n.attiva }); carica(); } catch (err) { alert(err.message); }
  };

  const setPunto = (i, campo, val) => setForm(f => { const punti = [...f.punti]; punti[i] = { ...punti[i], [campo]: val }; return { ...f, punti }; });
  const aggiungiPunto = () => setForm(f => ({ ...f, punti: [...f.punti, { icona: '', testo: '' }] }));
  const rimuoviPunto = (i) => setForm(f => ({ ...f, punti: f.punti.filter((_, idx) => idx !== i) }));

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('adminNovita.titolo')}</h1>
        <button onClick={() => apriForm()} className="btn-primario">{t('adminNovita.nuova')}</button>
      </div>

      <AnimatePresence>
        {mostraForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
            <div className="glass-card p-card-inner flex flex-col gap-3">
              <div>
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <button type="button" onClick={() => setPickerAperto(pickerAperto === 'icona' ? null : 'icona')}
                    className="campo-input text-center text-2xl cursor-pointer" title={t('adminNovita.scegliEmoji')}>{form.icona || '✨'}</button>
                  <input value={form.titolo} onChange={e => setForm(p => ({ ...p, titolo: e.target.value }))} className="campo-input" placeholder={t('adminNovita.titoloCampo')} />
                </div>
                {pickerAperto === 'icona' && <div className="mt-2"><GrigliaEmoji onSelect={e => { setForm(p => ({ ...p, icona: e })); setPickerAperto(null); }} /></div>}
              </div>
              <input value={form.sottotitolo} onChange={e => setForm(p => ({ ...p, sottotitolo: e.target.value }))} className="campo-input" placeholder={t('adminNovita.sottotitolo')} />

              <div className="flex flex-col gap-2">
                <span className="text-xs text-[var(--testo-terziario)] font-bold uppercase tracking-wide">{t('adminNovita.punti')}</span>
                {form.punti.map((p, i) => (
                  <div key={i} className="rounded-xl border border-[var(--bordo)] p-2 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPickerAperto(pickerAperto === `punto-${i}` ? null : `punto-${i}`)}
                        className="w-12 h-10 shrink-0 rounded-lg bg-[var(--bg-terziario)] text-xl flex items-center justify-center hover:bg-[var(--bg-secondario)] transition-colors" title={t('adminNovita.scegliEmoji')}>
                        {p.icona || '🙂'}
                      </button>
                      <input value={p.testo} onChange={e => setPunto(i, 'testo', e.target.value)} className="campo-input flex-1 min-w-0" placeholder={t('adminNovita.descrizionePunto')} />
                      <button type="button" onClick={() => rimuoviPunto(i)} className="px-2 text-[var(--pericolo)] shrink-0" title={t('adminNovita.rimuovi')}>✕</button>
                    </div>
                    {pickerAperto === `punto-${i}` && <GrigliaEmoji onSelect={e => { setPunto(i, 'icona', e); setPickerAperto(null); }} />}
                  </div>
                ))}
                <button onClick={aggiungiPunto} className="btn-secondario text-sm self-start">{t('adminNovita.nuovoPunto')}</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={form.ctaTesto} onChange={e => setForm(p => ({ ...p, ctaTesto: e.target.value }))} className="campo-input" placeholder={t('adminNovita.ctaTesto')} />
                <input value={form.ctaRotta} onChange={e => setForm(p => ({ ...p, ctaRotta: e.target.value }))} className="campo-input" placeholder={t('adminNovita.ctaRotta')} />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">{t('adminNovita.colore1')} <input type="color" value={form.coloreInizio} onChange={e => setForm(p => ({ ...p, coloreInizio: e.target.value }))} className="w-10 h-8 rounded bg-transparent" /></label>
                <label className="flex items-center gap-2">{t('adminNovita.colore2')} <input type="color" value={form.coloreFine} onChange={e => setForm(p => ({ ...p, coloreFine: e.target.value }))} className="w-10 h-8 rounded bg-transparent" /></label>
                <label className="flex items-center gap-2">{t('adminNovita.ordine')} <input type="number" value={form.ordine} onChange={e => setForm(p => ({ ...p, ordine: e.target.value }))} className="campo-input w-20" /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.attiva} onChange={e => setForm(p => ({ ...p, attiva: e.target.checked }))} /> {t('adminNovita.attiva')}</label>
              </div>

              <div className="flex gap-2">
                <button onClick={salva} disabled={!form.titolo} className="btn-primario disabled:opacity-50">{editId ? t('comune.salva') : t('adminNovita.crea')}</button>
                <button onClick={() => setMostraForm(false)} className="btn-secondario">{t('comune.annulla')}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {caricamento ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
      ) : lista.length === 0 ? (
        <p className="text-center text-[var(--testo-terziario)] py-12">{t('adminNovita.nessuna')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map(n => (
            <div key={n.id} className="glass-card px-card-inner py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `linear-gradient(135deg, ${n.coloreInizio || '#8b5cf6'}, ${n.coloreFine || '#06b6d4'})` }}>{n.icona || '✨'}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{n.titolo}</p>
                <p className="text-xs text-[var(--testo-terziario)] truncate">{t('adminNovita.sottotitoloOrdine', { sottotitolo: n.sottotitolo || '—', ordine: n.ordine })}</p>
              </div>
              <button onClick={() => toggleAttiva(n)} className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${n.attiva ? 'bg-[var(--successo-dim)] text-[var(--successo)]' : 'bg-[var(--bg-terziario)] text-[var(--testo-terziario)]'}`}>{n.attiva ? t('adminNovita.attiva') : t('adminNovita.nascosta')}</button>
              <button onClick={() => apriForm(n)} className="p-2 text-[var(--testo-secondario)] shrink-0" title={t('comune.modifica')}>✏️</button>
              <button onClick={() => elimina(n.id)} className="p-2 text-[var(--pericolo)] shrink-0" title={t('comune.elimina')}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
