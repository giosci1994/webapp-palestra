// ============================================
// GymMaster — Collapsible section
// ============================================
//
// On the phone the dashboard is a long column: closing the sections that are
// not needed right now brings the ones that are needed up to the top.
//
// The state is remembered in the browser, so the choice stays from one visit
// to the next instead of having to make it again every time.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const PREFISSO = 'gymmaster:sezione:';

function leggiStato(chiave, predefinito) {
  try {
    const v = localStorage.getItem(PREFISSO + chiave);
    return v === null ? predefinito : v === 'aperta';
  } catch {
    // Private browsing or blocked storage: start from the default value
    return predefinito;
  }
}

/**
 * @param {object} p
 * @param {string} p.chiave - identifier used to remember open/closed
 * @param {string} p.titolo
 * @param {React.ComponentType<{size?: number, className?: string}>} [p.Icona]
 * @param {React.ReactNode} [p.azione] - content on the right of the header
 * @param {boolean} [p.apertaDiDefault=true]
 * @param {React.ReactNode} p.children
 */
export default function SezioneCollassabile({
  chiave,
  titolo,
  Icona,
  azione,
  apertaDiDefault = true,
  children,
}) {
  const [aperta, setAperta] = useState(() => leggiStato(chiave, apertaDiDefault));

  const alterna = useCallback(() => {
    setAperta(prec => {
      const nuovo = !prec;
      try { localStorage.setItem(PREFISSO + chiave, nuovo ? 'aperta' : 'chiusa'); } catch { /* storage not available */ }
      return nuovo;
    });
  }, [chiave]);

  const idContenuto = `sezione-${chiave}`;

  return (
    <div className="glass-card overflow-hidden">
      <div className={`p-card-inner flex justify-between items-center gap-3 ${aperta ? 'border-b border-[var(--bordo-light)]' : ''}`}>
        <button
          type="button"
          onClick={alterna}
          aria-expanded={aperta}
          aria-controls={idContenuto}
          className="flex items-center gap-2 min-w-0 flex-1 text-left group"
        >
          {Icona && <Icona size={20} className="text-[var(--testo-secondario)] shrink-0" />}
          <h3 className="font-bold text-lg truncate group-hover:text-[var(--accent)] transition-colors">{titolo}</h3>
          <motion.span
            animate={{ rotate: aperta ? 0 : -90 }}
            transition={{ duration: 0.18 }}
            className="text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors shrink-0"
          >
            <ChevronDown size={18} />
          </motion.span>
        </button>

        {/* The action must not trigger opening/closing */}
        {azione && <div onClick={(e) => e.stopPropagation()} className="shrink-0">{azione}</div>}
      </div>

      <AnimatePresence initial={false}>
        {aperta && (
          <motion.div
            id={idContenuto}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
