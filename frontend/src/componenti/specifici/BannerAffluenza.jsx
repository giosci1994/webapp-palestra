// ============================================
// GymMaster — "How busy is the gym right now?"
// Asked once per workout, at the top of the live workout (pagine/WorkoutLive.jsx):
// the answers, put together, tell everyone when the gym is quiet.
// When it shows: utils/bannerAffluenza.js
// ============================================

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { api } from '../../config/api.js';
import { useLingua } from '../../hooks/useLingua.js';
import {
  LIVELLI_AFFLUENZA, MS_GRAZIE, mostraBannerAffluenza, bannerChiusoQui, segnaBannerChiuso
} from '../../utils/bannerAffluenza.js';

// The colours of today's crowd scale: 0-1 low, 2 medium, 3 high
const BANDA = ['basso', 'basso', 'medio', 'alto'];

/**
 * @param {object} p
 * @param {{ id: number, dataInizio: string, dataFine?: string|null, affluenzaSegnalata?: boolean }} p.sessione
 * @param {{ palestraId?: number|null } | null} p.utente
 */
export default function BannerAffluenza({ sessione, utente }) {
  const { t } = useLingua();
  // Decided once, when the workout opens: 'domanda' | 'invio' | 'grazie' | 'chiuso'
  const [fase, setFase] = useState(() => (
    mostraBannerAffluenza({ sessione, utente, chiusoQui: bannerChiusoQui(sessione?.id) }) ? 'domanda' : 'chiuso'
  ));

  useEffect(() => {
    if (fase !== 'grazie') return undefined;
    const timer = setTimeout(() => setFase('chiuso'), MS_GRAZIE);
    return () => clearTimeout(timer);
  }, [fase]);

  // Skip, "I'm not at the gym", ×: nothing is saved, and it does not come back for this workout
  const chiudi = () => {
    segnaBannerChiuso(sessione.id);
    setFase('chiuso');
  };

  // One try only: without a network, or if the server says no (already
  // reported, too soon, too many), it goes away without a word
  const segnala = (livello) => {
    segnaBannerChiuso(sessione.id);
    setFase('invio');
    api.post(`/sessioni/${sessione.id}/affluenza`, { livello })
      .then(() => setFase('grazie'))
      .catch(() => setFase('chiuso'));
  };

  const tastoTesto = 'min-h-[44px] px-3 text-sm font-medium text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] rounded-[var(--raggio-md)] disabled:opacity-60';

  return (
    <AnimatePresence>
      {fase !== 'chiuso' && (
        <motion.section
          key="banner-affluenza"
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          aria-label={t('bannerAffluenza.domanda')}
          className="rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-secondario)] shadow-sm overflow-hidden"
        >
          <div aria-live="polite">
            {fase === 'grazie' ? (
              <p className="px-4 py-4 text-sm text-center text-[var(--successo)] font-medium">{t('bannerAffluenza.grazie')}</p>
            ) : (
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="pt-2.5 pl-1 text-sm font-semibold text-[var(--testo-primario)]">{t('bannerAffluenza.domanda')}</p>
                  <button type="button" onClick={chiudi} disabled={fase === 'invio'}
                          aria-label={t('bannerAffluenza.etichettaChiudi')}
                          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] disabled:opacity-60">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {LIVELLI_AFFLUENZA.map(livello => {
                    const nome = t(`bannerAffluenza.livelli.${livello}`);
                    const banda = BANDA[livello];
                    return (
                      <button key={livello} type="button" onClick={() => segnala(livello)} disabled={fase === 'invio'}
                              aria-label={t('bannerAffluenza.ariaLivello', { livello: nome })}
                              className="min-h-[44px] px-2 py-2 rounded-[var(--raggio-md)] border text-sm font-semibold transition-colors disabled:opacity-60"
                              style={{
                                borderColor: `var(--livello-${banda}-testo)`,
                                color: `var(--livello-${banda}-testo)`,
                                background: `var(--livello-${banda}-dim)`
                              }}>
                        {nome}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 mt-1">
                  <button type="button" onClick={chiudi} disabled={fase === 'invio'} className={tastoTesto}>
                    {t('bannerAffluenza.nonInPalestra')}
                  </button>
                  <button type="button" onClick={chiudi} disabled={fase === 'invio'} className={tastoTesto}>
                    {t('bannerAffluenza.salta')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
