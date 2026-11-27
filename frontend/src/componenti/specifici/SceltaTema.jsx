// ============================================
// GymMaster — Theme picker (Profile)
// ============================================
//
// Automatic (the system setting), light or dark. The choice applies at once
// and is kept on this phone (utils/tema.js).

import { useSyncExternalStore } from 'react';
import { SunMoon } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { TEMI, iscriviTema, temaScelto, scegliTema } from '../../utils/tema.js';

export default function SceltaTema() {
  const { t } = useLingua();
  const scelta = useSyncExternalStore(iscriviTema, temaScelto);

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-card-inner border-b border-[var(--bordo-light)]">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <SunMoon size={20} className="text-[var(--accent)]" aria-hidden="true" /> {t('tema.titolo')}
        </h3>
      </div>
      <div className="p-card-inner">
        <p className="text-sm text-[var(--testo-secondario)] mb-3">{t('tema.descrizione')}</p>
        <select value={scelta} onChange={e => scegliTema(e.target.value)} className="campo-input" aria-label={t('tema.titolo')}>
          {TEMI.map(v => <option key={v} value={v}>{t(`tema.${v}`)}</option>)}
        </select>
      </div>
    </div>
  );
}
