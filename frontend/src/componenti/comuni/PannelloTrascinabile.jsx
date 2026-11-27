// ============================================
// GymMaster — Swipeable tab panel
// ============================================
//
// The panel under a tab island (IsolaSchede): a swipe to the left or to the
// right moves to the next or the previous tab, and the island's indicator
// follows the finger through `progresso`. Only touch and pen swipe (with the
// mouse: click or keyboard on the tabs). A swipe that starts in the band near
// the screen edges is left to the system (back gesture), and a vertical move
// scrolls the page as usual. With "reduce motion" nothing slides: the tab
// changes directly.

import { useRef } from 'react';
import { motion, animate, useDragControls, useMotionValue, useReducedMotion } from 'framer-motion';
import { schedaDopoTrascinamento, posizioneDuranteTrascinamento } from '../../utils/trascinamento.js';

const BORDO_LIBERO = 24; // px from each screen edge
const MOLLA = { type: 'spring', stiffness: 420, damping: 38 };

export default function PannelloTrascinabile({ indice, conteggio, progresso, onCambia, children, className = '', ...resto }) {
  const controlli = useDragControls();
  const x = useMotionValue(0);
  const ref = useRef(null);
  const larghezza = useRef(1);
  const ridotto = useReducedMotion();

  const inizia = (e) => {
    if (conteggio < 2 || e.pointerType === 'mouse') return;
    if (e.clientX < BORDO_LIBERO || e.clientX > window.innerWidth - BORDO_LIBERO) return;
    larghezza.current = ref.current?.offsetWidth || 1;
    progresso?.stop();
    controlli.start(e);
  };

  const torna = (verso) => {
    if (ridotto) { progresso?.jump(verso); return; }
    if (progresso) animate(progresso, verso, MOLLA);
  };

  return (
    <motion.div
      ref={ref}
      {...resto}
      className={`dash-pannello-trascinabile ${className}`}
      style={{ x }}
      drag="x"
      dragControls={controlli}
      dragListener={false}
      dragDirectionLock
      dragMomentum={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: indice < conteggio - 1 ? 0.9 : 0.15, right: indice > 0 ? 0.9 : 0.15 }}
      onPointerDown={inizia}
      onDrag={(_, info) => progresso?.set(posizioneDuranteTrascinamento(indice, info.offset.x, larghezza.current, conteggio))}
      onDragEnd={(_, info) => {
        const nuova = schedaDopoTrascinamento(indice, info.offset.x, info.velocity.x, larghezza.current, conteggio);
        if (nuova !== indice) {
          x.jump(0);
          onCambia(nuova);
        } else {
          if (ridotto) x.jump(0); else animate(x, 0, MOLLA);
          torna(indice);
        }
      }}
    >
      {children}
    </motion.div>
  );
}
