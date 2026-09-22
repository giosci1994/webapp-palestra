// ============================================
// GymMaster — Carosello Azioni
// Banner scorrevole che raccoglie gli inviti contestuali della dashboard
// (trova un PT, messaggi non letti, consiglio AI) in un'unica sezione.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
 *
 * Le slide restano tutte montate, impilate nella stessa cella di griglia.
 * Prima si alternavano con AnimatePresence, e questo costava due cose:
 *
 *  - l'altezza del banner seguiva quella della slide di turno (i sottotitoli
 *    hanno lunghezze diverse), quindi l'intera pagina si riassestava di
 *    qualche pixel ogni sei secondi;
 *  - la card veniva smontata e rimontata da capo a ogni giro, e con lei il
 *    suo livello di composizione `backdrop-filter`, che e' lo stesso effetto
 *    usato dalla barra di navigazione in basso.
 *
 * Impilate, le slide non cambiano mai ingombro e non vengono mai smontate:
 * si accende e si spegne solo l'opacita'.
 */
export default function CaroselloAzioni({ slide = [] }) {
  const [indice, setIndice] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const timer = useRef(null);

  const totale = slide.length;

  // Se le slide cambiano (es. i messaggi diventano tutti letti) l'indice
  // memorizzato puo' finire fuori dall'array: viene limitato qui, senza
  // rimetterlo a posto con un effetto che farebbe un secondo render.
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
      {/* Finestra di ritaglio: lo scarto negativo lascia respirare l'ombra
          della card, il ritaglio impedisce alla slide in movimento di
          sbordare oltre il bordo dello schermo. */}
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
                // Le slide nascoste restano nel DOM ma fuori da tastiera e
                // lettori di schermo.
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

      {/* Indicatori: solo con piu' di una slide */}
      {totale > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => vaiA(attuale - 1)}
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
