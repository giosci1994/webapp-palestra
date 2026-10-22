// ============================================
// GymMaster — Another workout is open
// The choice before starting a new workout: resume the open one, or close it
// and start the new one (contesti/AllenamentoInCorsoContesto.jsx)
// ============================================

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, RotateCcw, Play } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { formattaDataRelativa } from '../../utils/formattatori.js';

/**
 * @param {object} p
 * @param {{ id: number, dataInizio: string, scheda: { titolo: string }, serie: number } | undefined} p.sessione
 *   the open workout; nothing is shown without it
 */
export default function SceltaAllenamentoInCorso({ sessione, avviando, errore, onRiprendi, onChiudiEInizia, onAnnulla }) {
  const { t } = useLingua();
  const tastoPrincipale = useRef(null);

  useEffect(() => {
    if (!sessione) return undefined;
    tastoPrincipale.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onAnnulla(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [sessione, onAnnulla]);

  return (
    <AnimatePresence>
      {sessione && (
        <motion.div
          key="scelta-allenamento"
          className="fixed inset-0 z-[95] flex items-end md:items-center justify-center md:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onAnnulla}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scelta-allenamento-titolo"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="w-full md:max-w-md rounded-t-[24px] md:rounded-[24px] border border-[var(--vetro-bordo)] shadow-[var(--ombra-modale)] px-5 pt-5 md:p-6"
            style={{ background: 'var(--bg-secondario, #0c0c14)', paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          >
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
              <Dumbbell size={16} />
              {t('allenamentoInCorso.etichetta')}
            </p>
            <h2 id="scelta-allenamento-titolo" className="text-xl font-bold mt-2 leading-snug">
              {t('allenamentoInCorso.scelta.titolo')}
            </h2>

            <div className="mt-3 rounded-2xl bg-[var(--bg-terziario)] px-4 py-3">
              <p className="font-semibold">{sessione.scheda.titolo}</p>
              <p className="text-sm text-[var(--testo-secondario)] mt-0.5">
                {t('allenamentoInCorso.iniziato', { quando: formattaDataRelativa(sessione.dataInizio) })}
                {' · '}
                {t('comune.serie', { count: sessione.serie })}
              </p>
            </div>

            <p className="text-sm text-[var(--testo-secondario)] mt-3">
              {sessione.serie > 0 ? t('allenamentoInCorso.scelta.testo') : t('allenamentoInCorso.scelta.testoVuoto')}
            </p>

            {errore && <p role="alert" className="text-sm text-[var(--pericolo)] mt-3">{errore}</p>}

            <div className="flex flex-col gap-2.5 mt-5">
              <button ref={tastoPrincipale} type="button" onClick={onRiprendi} className="btn-primario w-full">
                <RotateCcw size={18} /> {t('allenamentoInCorso.riprendi')}
              </button>
              <button type="button" onClick={onChiudiEInizia} disabled={avviando} className="btn-secondario w-full disabled:opacity-50">
                <Play size={16} /> {avviando ? t('allenamentoInCorso.scelta.avvio') : t('allenamentoInCorso.scelta.chiudiEInizia')}
              </button>
              <button type="button" onClick={onAnnulla}
                      className="self-center py-1.5 px-3 text-sm font-medium text-[var(--testo-secondario)] hover:text-[var(--testo-primario)]">
                {t('comune.annulla')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
