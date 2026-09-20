// ============================================
// GymMaster — Carosello Azioni
// Banner scorrevole che raccoglie gli inviti contestuali della dashboard
// (trova un PT, messaggi non letti, consiglio AI) in un'unica sezione.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const DURATA_SLIDE = 6000;

/**
 * Banner a scorrimento automatico.
 *
 * Ogni slide e' { id, Icona, titolo, sottotitolo, etichetta, a?, onClick?, disabilitato? }:
 * con `a` diventa un Link, con `onClick` un bottone.
 *
 * Il chiamante passa solo le slide pertinenti — se l'array e' vuoto il
 * componente non rende nulla, cosi' la dashboard non mostra un riquadro vuoto.
 */
export default function CaroselloAzioni({ slide = [] }) {
  const [indice, setIndice] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const timer = useRef(null);

  const totale = slide.length;

  // Se le slide cambiano (es. i messaggi diventano tutti letti) l'indice
  // corrente potrebbe puntare fuori dall'array.
  useEffect(() => {
    if (indice > totale - 1) setIndice(0);
  }, [totale, indice]);

  useEffect(() => {
    if (totale <= 1 || inPausa) return;
    timer.current = setTimeout(() => setIndice(i => (i + 1) % totale), DURATA_SLIDE);
    return () => clearTimeout(timer.current);
  }, [indice, totale, inPausa]);

  if (totale === 0) return null;

  const vaiA = (i) => setIndice((i + totale) % totale);
  const corrente = slide[Math.min(indice, totale - 1)];
  const { Icona } = corrente;

  const contenuto = (
    <>
      {/* Velatura d'accento: stessa cifra stilistica degli altri inviti */}
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
        <p className="font-bold text-sm md:text-base truncate">{corrente.titolo}</p>
        <p className="text-xs text-[var(--testo-secondario)] line-clamp-2">{corrente.sottotitolo}</p>
      </div>
      <span className="text-xs text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors items-center gap-1 shrink-0 relative hidden sm:flex">
        {corrente.etichetta}
        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </span>
      <ChevronRight size={20} className="text-[var(--testo-terziario)] shrink-0 relative sm:hidden" />
    </>
  );

  const classiCard =
    'glass-card p-card-inner flex items-center gap-4 hover:border-[var(--accent)] transition-colors group relative overflow-hidden w-full';

  return (
    <div
      className="mb-8 md:mb-12"
      onMouseEnter={() => setInPausa(true)}
      onMouseLeave={() => setInPausa(false)}
      onFocusCapture={() => setInPausa(true)}
      onBlurCapture={() => setInPausa(false)}
    >
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={corrente.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            drag={totale > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) vaiA(indice + 1);
              else if (info.offset.x > 60) vaiA(indice - 1);
            }}
          >
            {corrente.a ? (
              <Link to={corrente.a} className={classiCard}>{contenuto}</Link>
            ) : (
              <button type="button" onClick={corrente.onClick} disabled={corrente.disabilitato} className={`${classiCard} disabled:opacity-60`}>
                {contenuto}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Indicatori: solo con piu' di una slide */}
      {totale > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => vaiA(indice - 1)}
            aria-label="Slide precedente"
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
                aria-label={`Vai a: ${s.titolo}`}
                aria-current={i === indice}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === indice ? 20 : 6,
                  background: i === indice ? 'var(--accent)' : 'var(--testo-terziario)',
                  opacity: i === indice ? 1 : 0.4
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => vaiA(indice + 1)}
            aria-label="Slide successiva"
            className="p-1 rounded-full text-[var(--testo-terziario)] hover:text-[var(--accent)] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
