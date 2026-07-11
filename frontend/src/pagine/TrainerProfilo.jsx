// ============================================
// GymMaster — Profilo pubblico Personal Trainer
// Valuta un PT (bio, stats, schede pubbliche) e iscriviti.
// ============================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, ClipboardList, Building, Award, ChevronRight } from 'lucide-react';

export default function TrainerProfilo() {
  const { id } = useParams();
  const naviga = useNavigate();
  const [pt, setPt] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [mioPT, setMioPT] = useState(undefined);
  const [iscrivendo, setIscrivendo] = useState(false);

  useEffect(() => {
    setCaricamento(true);
    api.get(`/utenti/personal-trainers/${id}`).then(r => setPt(r.dati)).catch(() => setPt(null)).finally(() => setCaricamento(false));
    api.get('/utenti/mio-pt').then(r => setMioPT(r.dati)).catch(() => setMioPT(null));
  }, [id]);

  const iscriviti = async () => {
    try {
      setIscrivendo(true);
      await api.post('/utenti/iscrizione-pt', { trainerId: parseInt(id) });
      const r = await api.get('/utenti/mio-pt'); setMioPT(r.dati);
      alert('Richiesta inviata! 🎉');
    } catch (err) { alert(err.message); } finally { setIscrivendo(false); }
  };

  if (caricamento) {
    return <div className="flex justify-center py-32"><div className="w-12 h-12 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>;
  }
  if (!pt) {
    return (
      <div className="py-16 text-center text-[var(--testo-terziario)]">
        <p>Personal Trainer non trovato.</p>
        <button onClick={() => naviga(-1)} className="btn-secondario mt-4">← Indietro</button>
      </div>
    );
  }

  const giaIscritto = mioPT && mioPT.trainer?.id === pt.id;
  const iscrittoAltrove = mioPT && mioPT.trainer && mioPT.trainer.id !== pt.id;
  const specs = (() => { try { return pt.specializzazioni ? JSON.parse(pt.specializzazioni) : []; } catch { return []; } })();

  return (
    <div className="py-2 pb-12 flex flex-col gap-6">
      <button onClick={() => naviga(-1)} className="flex items-center gap-2 text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors self-start">
        <ArrowLeft size={18} /> Indietro
      </button>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-card-inner relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: 'linear-gradient(135deg, var(--accent), transparent 70%)' }} />
        <div className="relative flex items-center gap-5">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {pt.immagineProfilo ? <img src={pt.immagineProfilo} alt="" className="w-full h-full object-cover" /> : pt.nome?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">Personal Trainer</p>
            <h1 className="text-2xl font-extrabold truncate">{pt.nome}</h1>
            {pt.palestra && <p className="text-sm text-[var(--testo-terziario)] flex items-center gap-1 mt-1"><Building size={14} /> {pt.palestra.nomeCatena} · {pt.palestra.citta}</p>}
          </div>
        </div>
        {pt.bio && <p className="relative text-sm text-[var(--testo-secondario)] mt-4 leading-relaxed">{pt.bio}</p>}
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icona: <Users size={20} className="text-[var(--accent)]" />, valore: pt._count?.clientiComePT || 0, label: 'Clienti' },
          { icona: <ClipboardList size={20} className="text-blue-400" />, valore: pt._count?.schedeCreate || 0, label: 'Schede' },
          { icona: <Award size={20} className="text-green-400" />, valore: pt.anniEsperienza != null ? `${pt.anniEsperienza} anni` : '—', label: 'Esperienza' },
        ].map((s, i) => (
          <div key={i} className="glass-card p-card-inner text-center">
            <div className="flex justify-center mb-1">{s.icona}</div>
            <p className="text-lg font-extrabold truncate">{s.valore}</p>
            <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* CTA iscrizione */}
      {giaIscritto ? (
        <div className="glass-card p-card-inner text-center text-sm text-[var(--successo)] font-bold">✅ Sei iscritto con questo Personal Trainer</div>
      ) : iscrittoAltrove ? (
        <div className="glass-card p-card-inner text-center text-sm text-[var(--testo-terziario)]">Sei già iscritto con un altro PT. Termina quel rapporto dal Profilo per cambiarlo.</div>
      ) : (
        <button onClick={iscriviti} disabled={iscrivendo} className="btn-primario w-full disabled:opacity-50">{iscrivendo ? 'Invio richiesta...' : '＋ Iscriviti a questo PT'}</button>
      )}

      {/* Dettagli professionali */}
      {(specs.length > 0 || pt.certificazioni || pt.tariffaIndicativa || pt.contattoPubblico) && (
        <div className="glass-card p-card-inner flex flex-col gap-4">
          {specs.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-2">Specializzazioni</p>
              <div className="flex flex-wrap gap-2">
                {specs.map(s => <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--accent-dim)] text-[var(--accent)]">{s}</span>)}
              </div>
            </div>
          )}
          {pt.certificazioni && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)] mb-1">Certificazioni</p>
              <p className="text-sm text-[var(--testo-secondario)] whitespace-pre-line">{pt.certificazioni}</p>
            </div>
          )}
          {(pt.tariffaIndicativa || pt.contattoPubblico) && (
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {pt.tariffaIndicativa && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)]">Tariffa</p>
                  <p className="text-sm text-[var(--testo-secondario)]">{pt.tariffaIndicativa}</p>
                </div>
              )}
              {pt.contattoPubblico && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--testo-terziario)]">Contatto</p>
                  <p className="text-sm text-[var(--testo-secondario)] break-all">{pt.contattoPubblico}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Schede pubbliche */}
      <div className="glass-card overflow-hidden">
        <div className="p-card-inner border-b border-[var(--bordo-light)]">
          <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardList size={20} className="text-[var(--accent)]" /> Schede pubbliche</h3>
        </div>
        {pt.schede?.length > 0 ? (
          <div className="divide-y divide-[var(--bordo-light)]">
            {pt.schede.map(s => (
              <Link key={s.id} to={`/schede/${s.id}`} className="flex items-center justify-between px-card-inner py-4 hover:bg-[var(--bg-terziario)] transition-colors group">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{s.titolo}</p>
                  <p className="text-xs text-[var(--testo-terziario)]">{s.livello} · {s._count?.esercizi || 0} esercizi · {s._count?.sessioni || 0} sessioni</p>
                </div>
                <ChevronRight size={18} className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-card-inner text-center text-sm text-[var(--testo-terziario)]">Questo PT non ha ancora schede pubbliche.</p>
        )}
      </div>
    </div>
  );
}
