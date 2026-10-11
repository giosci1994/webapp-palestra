// ============================================
// GymMaster — Spinner component
// Loading indicator
// ============================================

import { useLingua } from '../../hooks/useLingua.js';

export default function Spinner({ dimensione = 'md', className = '' }) {
  const { t } = useLingua();
  const dimensioni = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
    xl: 'w-16 h-16 border-4'
  };

  return (
    <div
      className={`${dimensioni[dimensione]} border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota ${className}`}
      role="status"
      aria-label={t('comune.caricamento')}
    />
  );
}

/** Full-page centered spinner */
export function SpinnerPagina() {
  const { t } = useLingua();

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Spinner dimensione="xl" />
        <p className="text-[var(--testo-secondario)] text-sm">{t('comune.caricamento')}</p>
      </div>
    </div>
  );
}
