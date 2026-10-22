// ============================================
// GymMaster — Workout in progress bar
// At the top of every page while a workout is open, so whoever left it finds
// it again instead of starting another one
// ============================================

import { Dumbbell, RotateCcw } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { useAllenamentoInCorso } from '../../contesti/AllenamentoInCorsoContesto.jsx';
import { formattaDataRelativa, titoloAllenamento } from '../../utils/formattatori.js';

export default function BarraAllenamentoInCorso() {
  const { t } = useLingua();
  const { inCorso, riprendi } = useAllenamentoInCorso();
  if (!inCorso) return null;

  return (
    <div role="status" className="glass-card mb-4 px-4 py-3 flex items-center gap-3 border border-[var(--accent)]">
      {/* Not on a phone: the room goes to the text */}
      <span className="shrink-0 w-10 h-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] hidden sm:flex items-center justify-center">
        <Dumbbell size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t('allenamentoInCorso.etichetta')}</p>
        <p className="text-sm font-semibold truncate">{titoloAllenamento(inCorso)}</p>
        <p className="text-xs text-[var(--testo-secondario)] truncate">
          {t('allenamentoInCorso.iniziato', { quando: formattaDataRelativa(inCorso.dataInizio) })}
          {' · '}
          {t('comune.serie', { count: inCorso.serie })}
        </p>
      </div>
      <button type="button" onClick={() => riprendi(inCorso)} className="btn-primario shrink-0 !px-4 !py-2 text-sm">
        <RotateCcw size={16} /> {t('allenamentoInCorso.riprendi')}
      </button>
    </div>
  );
}
