import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminPalestre() {
  const { t } = useLingua();
  const [palestre, setPalestre] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraForm, setMostraForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nomeCatena: '', citta: '', indirizzo: '', nazione: 'Italia', googlePlaceId: '' });

  // On first load with the spinner; after an edit the list updates in place
  const caricaPalestre = useCallback(() => api.get('/palestre')
    .then(r => setPalestre(r.dati || []))
    .catch(err => console.error(err))
    .finally(() => setCaricamento(false)), []);

  useEffect(() => { caricaPalestre(); }, [caricaPalestre]);

  const apriForm = (p = null) => {
    if (p) { setEditId(p.id); setForm({ nomeCatena: p.nomeCatena, citta: p.citta, indirizzo: p.indirizzo, nazione: p.nazione, googlePlaceId: p.googlePlaceId || '' }); }
    else { setEditId(null); setForm({ nomeCatena: '', citta: '', indirizzo: '', nazione: 'Italia', googlePlaceId: '' }); }
    setMostraForm(true);
  };

  const salva = async () => {
    try {
      if (editId) await api.put(`/admin/palestre/${editId}`, form);
      else await api.post('/admin/palestre', form);
      setMostraForm(false); caricaPalestre();
    } catch (err) { alert(err.message); }
  };

  const elimina = async (id) => {
    if (!confirm(t('adminPalestre.confermaElimina'))) return;
    try { await api.delete(`/admin/palestre/${id}`); caricaPalestre(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('adminPalestre.titolo')}</h1>
        <button onClick={() => apriForm()} className="btn-primario">{t('adminPalestre.nuova')}</button>
      </div>
      <AnimatePresence>
        {mostraForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
            <div className="glass-card p-card-inner">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={form.nomeCatena} onChange={e => setForm(p => ({...p, nomeCatena: e.target.value}))} className="campo-input" placeholder={t('adminPalestre.nomeCatena')} />
                <input type="text" value={form.citta} onChange={e => setForm(p => ({...p, citta: e.target.value}))} className="campo-input" placeholder={t('adminPalestre.citta')} />
                <input type="text" value={form.indirizzo} onChange={e => setForm(p => ({...p, indirizzo: e.target.value}))} className="campo-input" placeholder={t('adminPalestre.indirizzo')} />
                <input type="text" value={form.nazione} onChange={e => setForm(p => ({...p, nazione: e.target.value}))} className="campo-input" placeholder={t('adminPalestre.nazione')} />
              </div>
              <input type="text" value={form.googlePlaceId} onChange={e => setForm(p => ({...p, googlePlaceId: e.target.value}))} className="campo-input mt-3" placeholder={t('adminPalestre.googlePlaceId')} />
              <div className="flex gap-2 mt-3">
                <button onClick={salva} disabled={!form.nomeCatena || !form.citta || !form.indirizzo} className="btn-primario">{editId ? t('comune.salva') : t('adminPalestre.crea')}</button>
                <button onClick={() => setMostraForm(false)} className="btn-secondario">{t('comune.annulla')}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {caricamento ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {palestre.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="glass-card p-card-inner group hover:border-[var(--bordo-hover)] transition-all">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold">{p.nomeCatena}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => apriForm(p)} className="text-xs text-[var(--accent)]">✏️</button>
                  <button onClick={() => elimina(p.id)} className="text-xs text-[var(--pericolo)]">🗑️</button>
                </div>
              </div>
              <p className="text-sm text-[var(--testo-secondario)]">📍 {p.indirizzo}, {p.citta}</p>
              <p className="text-xs text-[var(--testo-terziario)] mt-1">{p.nazione} {p.attrezzature?.length > 0 ? `· 🔧 ${p.attrezzature.length}` : ''} {p.googlePlaceId ? t('adminPalestre.affluenzaAttiva') : ''}</p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
