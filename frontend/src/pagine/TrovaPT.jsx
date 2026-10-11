// ============================================
// GymMaster — Find a Personal Trainer
// Discovery page: list of personal trainers with search, link to the public profile.
// ============================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { ArrowLeft, Users, ClipboardList, Search } from 'lucide-react';

export default function TrovaPT() {
  const { t } = useLingua();
  const naviga = useNavigate();
  const [trainers, setTrainers] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/utenti/personal-trainers').then(r => setTrainers(r.dati || [])).catch(() => setTrainers([]));
  }, []);

  const filtrati = (trainers || []).filter(pt =>
    !q || pt.nome?.toLowerCase().includes(q.toLowerCase()) || pt.bio?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="py-2 pb-12 flex flex-col gap-6">
      <button onClick={() => naviga(-1)} className="flex items-center gap-2 text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors self-start">
        <ArrowLeft size={18} /> {t('comune.indietro')}
      </button>

      <div>
        <h1 className="text-2xl font-extrabold">{t('trovaPT.titolo')}</h1>
        <p className="text-sm text-[var(--testo-secondario)] mt-1">{t('trovaPT.sottotitolo')}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--testo-terziario)] pointer-events-none" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('trovaPT.cercaPlaceholder')} className="campo-input w-full !pl-11" />
      </div>

      {trainers === null ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" /></div>
      ) : filtrati.length === 0 ? (
        <div className="glass-card p-card-inner text-center text-sm text-[var(--testo-terziario)]">
          {trainers.length === 0 ? t('trovaPT.nessunPT') : t('trovaPT.nessunRisultato')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtrati.map(pt => (
            <Link key={pt.id} to={`/trainer/${pt.id}`} className="glass-card p-card-inner flex items-center gap-4 hover:border-[var(--accent)] transition-colors group">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {pt.immagineProfilo ? <img src={pt.immagineProfilo} alt="" className="w-full h-full object-cover" /> : pt.nome?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate group-hover:text-[var(--accent)] transition-colors">{pt.nome}</p>
                <p className="text-xs text-[var(--testo-terziario)] flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><Users size={12} /> {t('trovaPT.clienti', { count: pt._count?.clientiComePT || 0 })}</span>
                  <span className="flex items-center gap-1"><ClipboardList size={12} /> {t('trovaPT.schede', { count: pt._count?.schedeCreate || 0 })}</span>
                </p>
                {pt.bio && <p className="text-xs text-[var(--testo-secondario)] mt-1 line-clamp-2">{pt.bio}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
