// ============================================
// GymMaster — Actions carousel
// Sliding banner that gathers the dashboard's contextual prompts
// (find a personal trainer, unread messages, AI tip) in a single section.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';

const DURATA_SLIDE = 6000;

/**
 * Auto-scrolling banner.
 *
 * Each slide is { id, Icona, titolo, sottotitolo, etichetta, a?, onClick?, disabilitato? }:
 * with `a` it becomes a Link, with `onClick` a button.
 *
 * The caller passes only the relevant slides — if the array is empty the
 * component renders nothing, so the dashboard does not show an empty box.
 *
 * The slides all stay mounted, stacked in the same grid cell.
 * They used to take turns with AnimatePresence, and that cost two things:
 *
 *  - the banner's height followed the current slide's (the subtitles have
 *    different lengths), so the whole page shifted by a few pixels every
 *    six seconds;
 *  - the card was unmounted and mounted again from scratch on every turn,
 *    and with it its `backdrop-filter` compositing layer, which is the same
 *    effect used by the bottom navigation bar.
 *
 * Stacked, the slides never change size and are never unmounted:
 * only their opacity (and a small sideways shift) changes.
 */
export default function CaroselloAzioni({ slide = [] }) {
  const { t } = useLingua();
  const [indice, setIndice] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const timer = useRef(null);

  const totale = slide.length;

  // If the slides change (e.g. the messages all become read) the stored
  // index can end up outside the array: it is clamped here, instead of
  // fixing it with an effect that would cause a second render.
  const attuale = totale > 0 ? Math.min(indice, totale - 1) : 0;

  useEffect(() => {
    if (totale <= 1 || inPausa) return;
    timer.current = setTimeout(() => setIndice((attuale + 1) % totale), DURATA_SLIDE);
    return () => clearTimeout(timer.current);
  }, [attuale, totale, inPausa]);

  if (totale === 0) return null;

  const vaiA = (i) => setIndice((i + totale) % totale);

  const contenuto = (s) => {
    const { Icona } = s;
    return (
      <>
        {/* Accent tint: same visual signature as the other prompts */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ background: 'linear-gradient(120deg, var(--accent), transparent 60%)' }}
        />
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {Icona && <Icona size={24} />}
        </div>
        <div className="flex-1 min-w-0 relative text-left">
          <p className="font-bold text-sm md:text-base truncate">{s.titolo}</p>
          <p className="text-xs text-[var(--testo-secondario)] line-clamp-2">{s.sottotitolo}</p>
        </div>
        <span className="text-xs text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors items-center gap-1 shrink-0 relative hidden sm:flex">
          {s.etichetta}
          <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </span>
        <ChevronRight size={20} className="text-[var(--testo-terziario)] shrink-0 relative sm:hidden" />
      </>
    );
  };

  const classiCard =
    'glass-card p-card-inner flex items-center gap-4 hover:border-[var(--accent)] transition-colors group relative overflow-hidden w-full h-full';

  return (
    <div
      className="mb-8 md:mb-12"
      onMouseEnter={() => setInPausa(true)}
      onMouseLeave={() => setInPausa(false)}
      onFocusCapture={() => setInPausa(true)}
      onBlurCapture={() => setInPausa(false)}
    >
      {/* Clipping window: the negative margin leaves room for the card's
          shadow, the clipping keeps the moving slide from spilling past
          the edge of the screen. */}
      <div className="-mx-2 -my-2 px-2 py-2 overflow-hidden">
        <div className="grid">
          {slide.map((s, i) => {
            const attiva = i === attuale;
            return (
              <motion.div
                key={s.id}
                className="col-start-1 row-start-1"
                initial={false}
                animate={{ opacity: attiva ? 1 : 0, x: attiva ? 0 : (i < attuale ? -16 : 16) }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                style={{ pointerEvents: attiva ? 'auto' : 'none' }}
                // Hidden slides stay in the DOM but out of reach of the
                // keyboard and screen readers.
                inert={!attiva || undefined}
                drag={attiva && totale > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) vaiA(attuale + 1);
                  else if (info.offset.x > 60) vaiA(attuale - 1);
                }}
              >
                {s.a ? (
                  <Link to={s.a} className={classiCard}>{contenuto(s)}</Link>
                ) : (
                  <button type="button" onClick={s.onClick} disabled={s.disabilitato} className={`${classiCard} disabled:opacity-60`}>
                    {contenuto(s)}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Indicators: only with more than one slide */}
      {totale > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => vaiA(attuale - 1)}
            aria-label={t('caroselloAzioni.precedente')}
            className="p-1 rounded-full text-[var(--testo-terziario)] hover:text-[var(--accent)] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1.5">
            {slide.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => vaiA(i)}
                aria-label={t('caroselloAzioni.vaiA', { titolo: s.titolo })}
                aria-current={i === attuale}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === attuale ? 20 : 6,
                  background: i === attuale ? 'var(--accent)' : 'var(--testo-terziario)',
                  opacity: i === attuale ? 1 : 0.4
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => vaiA(attuale + 1)}
            aria-label={t('caroselloAzioni.successiva')}
            className="p-1 rounded-full text-[var(--testo-terziario)] hover:text-[var(--accent)] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
