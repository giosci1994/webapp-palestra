// ============================================
// GymMaster — A set done, that can be swiped (live workout)
// ============================================
//
// A row of "Sets done": swiped to the left it deletes the set, to the right
// it copies it (utils/scorriSerie.js decides). Under the row the colour and
// icon of the action show while the finger moves. The ⋯ button does the same
// without swiping (screen readers, keyboard, whoever prefers a tap).
// Touches near the screen edges are left to the system gestures, vertical
// movement stays a scroll (touch-action: pan-y), and the page swipe never
// starts here (data-senza-gesto). With "reduce motion" the row does not fly
// away: the action happens on release.

import { useEffect, useRef, useState } from 'react';
import { motion, animate, useDragControls, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Copy, Ellipsis, Trash2 } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { azioneDelGesto } from '../../utils/scorriSerie.js';

/**
 * @param {object} props
 * @param {React.ReactNode} props.etichetta - left side: "Set 2 ✓", "↳ Drop"
 * @param {React.ReactNode} props.valore - right side: "80 kg × 8"
 * @param {string} props.nome - the set for screen readers: "set 2"
 * @param {string} props.classe - the row's colours and indent
 * @param {boolean} props.attivo - swipe and menu on (off when the workout is closed)
 * @param {boolean} props.copiabile - false for a drop set
 * @param {() => void} props.onElimina
 * @param {() => boolean} props.onCopia - false if the copy could not be logged
 */
export default function RigaSerieScorrevole({ etichetta, valore, nome, classe, attivo, copiabile, onElimina, onCopia }) {
  const { t } = useLingua();
  const ridotto = useReducedMotion();
  const controlli = useDragControls();
  const x = useMotionValue(0);
  const riga = useRef(null);
  const inizioX = useRef(0);
  const [menuAperto, setMenuAperto] = useState(false);
  const menu = useRef(null);
  const pulsanteMenu = useRef(null);

  // What shows under the row: green copy on the left (row going right), red bin on the right
  const opacitaCopia = useTransform(x, [0, 48], [0, 1]);
  const opacitaElimina = useTransform(x, [-48, 0], [1, 0]);

  // The menu (inline under the row: the list around it clips anything that
  // sticks out) closes with Escape and with a tap outside it
  useEffect(() => {
    if (!menuAperto) return;
    const fuori = e => {
      if (!menu.current?.contains(e.target) && !pulsanteMenu.current?.contains(e.target)) setMenuAperto(false);
    };
    const tasto = e => {
      if (e.key !== 'Escape') return;
      setMenuAperto(false);
      pulsanteMenu.current?.focus();
    };
    document.addEventListener('pointerdown', fuori);
    document.addEventListener('keydown', tasto);
    menu.current?.querySelector('button:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('pointerdown', fuori);
      document.removeEventListener('keydown', tasto);
    };
  }, [menuAperto]);

  const inizia = e => {
    if (!attivo || e.target.closest('button')) return;
    inizioX.current = e.clientX;
    controlli.start(e);
  };

  const rilascia = (_, info) => {
    const azione = azioneDelGesto({
      inizioX: inizioX.current,
      larghezzaSchermo: window.innerWidth,
      dx: info.offset.x,
      dy: info.offset.y,
      velocita: info.velocity.x,
      larghezza: riga.current?.offsetWidth ?? window.innerWidth
    });
    const torna = () => (ridotto ? x.set(0) : animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 }));
    if (azione === 'elimina') {
      if (ridotto) onElimina();
      else animate(x, -(riga.current?.offsetWidth ?? 400), { duration: 0.18, onComplete: onElimina });
      return;
    }
    if (azione === 'copia' && copiabile) onCopia();
    torna();
  };

  const scegli = azione => {
    setMenuAperto(false);
    if (azione === 'copia') onCopia();
    else onElimina();
  };

  return (
    <div className="relative" data-senza-gesto>
      {/* Under the row: the action the swipe is going towards */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-between px-4 rounded-[var(--raggio-sm)] overflow-hidden">
        <motion.span style={{ opacity: copiabile ? opacitaCopia : 0 }} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--successo)]">
          <Copy size={16} /> {t('workoutLive.scorri.copia')}
        </motion.span>
        <motion.span style={{ opacity: opacitaElimina }} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--pericolo)]">
          {t('workoutLive.scorri.elimina')} <Trash2 size={16} />
        </motion.span>
      </div>
      <motion.div
        ref={riga}
        drag={attivo ? 'x' : false}
        dragListener={false}
        dragControls={controlli}
        dragDirectionLock
        dragMomentum={false}
        onPointerDown={inizia}
        onDragEnd={rilascia}
        style={{ x, touchAction: 'pan-y' }}
        className={`relative flex items-center justify-between gap-2 pl-3 pr-1 py-1 rounded-[var(--raggio-sm)] ${classe}`}
      >
        <span className="text-sm font-medium py-1">{etichetta}</span>
        <span className="flex items-center gap-1">
          <span className="text-sm">{valore}</span>
          {attivo && (
            <button
              ref={pulsanteMenu}
              type="button"
              onClick={() => setMenuAperto(v => !v)}
              aria-label={t('workoutLive.scorri.azioni', { nome })}
              aria-haspopup="menu"
              aria-expanded={menuAperto}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--raggio-sm)] text-[var(--testo-terziario)] hover:text-[var(--testo-primario)]"
            >
              <Ellipsis size={18} />
            </button>
          )}
        </span>
      </motion.div>
      {menuAperto && (
        <div ref={menu} role="menu" aria-label={t('workoutLive.scorri.azioni', { nome })}
             className="flex justify-end gap-1 mt-1 p-1 rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-secondario)]">
          <button type="button" role="menuitem" disabled={!copiabile} onClick={() => scegli('copia')}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-left rounded-[var(--raggio-sm)] hover:bg-[var(--bg-terziario)] disabled:opacity-40">
            <Copy size={16} /> {t('workoutLive.scorri.copia')}
          </button>
          <button type="button" role="menuitem" onClick={() => scegli('elimina')}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-left rounded-[var(--raggio-sm)] text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)]">
            <Trash2 size={16} /> {t('workoutLive.scorri.elimina')}
          </button>
        </div>
      )}
    </div>
  );
}
