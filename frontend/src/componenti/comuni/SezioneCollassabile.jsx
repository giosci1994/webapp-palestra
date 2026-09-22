// ============================================
// GymMaster — Sezione richiudibile
// ============================================
//
// Sul telefono la dashboard è una colonna lunga: poter chiudere le sezioni che
// non servono in quel momento fa risalire in alto quelle che servono.
//
// Lo stato viene ricordato nel browser, così la scelta resta fra una visita e
// l'altra invece di doverla rifare ogni volta.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const PREFISSO = 'gymmaster:sezione:';

function leggiStato(chiave, predefinito) {
  try {
    const v = localStorage.getItem(PREFISSO + chiave);
    return v === null ? predefinito : v === 'aperta';
  } catch {
    // Navigazione privata o storage bloccato: si parte dal valore di default
    return predefinito;
  }
}

/**
 * @param {object} p
 * @param {string} p.chiave - identificativo per ricordare aperta/chiusa
 * @param {string} p.titolo
 * @param {React.ComponentType<{size?: number, className?: string}>} [p.Icona]
 * @param {React.ReactNode} [p.azione] - contenuto a destra dell'intestazione
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
      try { localStorage.setItem(PREFISSO + chiave, nuovo ? 'aperta' : 'chiusa'); } catch { /* storage non disponibile */ }
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

        {/* L'azione non deve far scattare l'apertura/chiusura */}
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
