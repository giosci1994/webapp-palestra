// ============================================
// GymMaster — The star of a favorite plan
// ============================================
//
// A button of its own inside cards that open something on a tap: the tap on
// the star does not reach the card.

import { Star } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';

/** @param {{ attiva: boolean, onCambia: () => void, className?: string }} props */
export default function StellaPreferita({ attiva, onCambia, className = '' }) {
  const { t } = useLingua();
  const testo = attiva ? t('schedeAllenamento.togliPreferite') : t('schedeAllenamento.aggiungiPreferite');
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onCambia(); }}
      aria-pressed={attiva}
      aria-label={testo}
      title={testo}
      className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-terziario)] ${
        attiva ? 'text-[#EAB308]' : 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)]'
      } ${className}`}
    >
      <Star size={18} fill={attiva ? 'currentColor' : 'none'} />
    </button>
  );
}
