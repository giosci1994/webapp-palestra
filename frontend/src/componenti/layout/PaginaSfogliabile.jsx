// ============================================
// GymMaster — Pages that turn like a book
// ============================================
//
// Wraps the page of the layout (the router's outlet):
// - transition: forward, the new page comes in from the right over the old
//   one; back, the old page slides away to the right and the previous one
//   reappears under it. None between full-screen pages and with "reduce
//   motion";
// - swipe (touch and pen only): on the pages of the bottom bar the page
//   follows the finger and a swipe past the threshold opens the next or the
//   previous page in the bar's order. A page with tabs (the Dashboard, through
//   hooks/useSchedeSfogliabili.js) swipes through its tabs first. Off on the Workout
//   page, on fields, charts, maps, the calendar and anything that scrolls
//   sideways (utils/gestoPagine.js), and in the bands near the screen edges,
//   left to the system;
// - iOS installed app (no system back gesture there): a swipe from the left
//   edge goes back.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom';
import { SchedeContesto } from '../../hooks/useSchedeSfogliabili.js';
import { AnimatePresence, motion, animate, useMotionValue, useReducedMotion } from 'framer-motion';
import {
  BORDO_LIBERO, destinazioneGesto, direzioneMovimento, direzioneTransizione, escluso, gestoAttivo,
  immersiva, nelBordo, sostituisceStoria, superaSoglia
} from '../../utils/gestoPagine.js';
import { schedaDopoTrascinamento, posizioneDuranteTrascinamento } from '../../utils/trascinamento.js';

const MOLLA = { type: 'spring', stiffness: 420, damping: 38 };
const SCORRI = { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.32 };
const IMMEDIATO = { duration: 0 };

// iOS installed app: the only case without a system "back" swipe
const iosInstallata = () => typeof navigator !== 'undefined' && navigator.standalone === true;

const varianti = {
  entra: ({ direzione, ridotto }) => (ridotto || direzione === 'nessuna'
    ? { x: 0, zIndex: 1 }
    : direzione === 'avanti' ? { x: '100%', zIndex: 2 } : { x: '-25%', zIndex: 0 }),
  fermo: ({ direzione, ridotto }) => ({
    x: 0, zIndex: 1,
    transition: ridotto || direzione === 'nessuna' ? IMMEDIATO : SCORRI
  }),
  esce: ({ direzione, ridotto }) => (ridotto || direzione === 'nessuna'
    ? { opacity: 0, transition: IMMEDIATO }
    : direzione === 'avanti'
      ? { x: '-25%', zIndex: 0, transition: SCORRI }
      : { x: '100%', zIndex: 2, transition: SCORRI })
};

// One page in the stack: the outer layer runs the transition, the inner one
// follows the finger. On mount it hands its finger offset to the gesture; a
// page leaving keeps its own, so it goes on from where the finger left it.
function Foglio({ children, custom, ditoAttivoRef }) {
  const dito = useMotionValue(0);
  useLayoutEffect(() => {
    ditoAttivoRef.current = dito;
    return () => { if (ditoAttivoRef.current === dito) ditoAttivoRef.current = null; };
  }, [ditoAttivoRef, dito]);
  return (
    <motion.div className="pagina-foglio" custom={custom} variants={varianti} initial="entra" animate="fermo" exit="esce">
      <motion.div className="pagina-foglio-dentro" style={{ x: dito }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export default function PaginaSfogliabile({ avvolgi }) {
  const location = useLocation();
  const tipo = useNavigationType();
  const navigate = useNavigate();
  const ridotto = useReducedMotion();
  const percorso = location.pathname;
  const outlet = useOutlet();
  const schede = useRef(null);
  const contenitore = useRef(null);
  const gesto = useRef(null);
  // The finger offset of the page shown (each Foglio has its own)
  const ditoAttivo = useRef(null);

  // The transition direction is decided when the path changes
  const [stato, setStato] = useState({ percorso, direzione: 'nessuna' });
  if (stato.percorso !== percorso) {
    const direzione = immersiva(stato.percorso) || immersiva(percorso)
      ? 'nessuna'
      : direzioneTransizione(stato.percorso, percorso, tipo);
    setStato({ percorso, direzione });
  }
  const custom = { direzione: stato.direzione, ridotto: !!ridotto };

  // What the window listeners read: the latest values of this render
  const attuale = useRef({ percorso, ridotto, navigate });
  useLayoutEffect(() => { attuale.current = { percorso, ridotto, navigate }; });

  // On the window, so a touch in the band near the screen edge (outside the
  // page column) is seen too: the iOS back swipe starts there
  useEffect(() => {
    const chiudi = () => { gesto.current = null; };

    const inizia = (e) => {
      const { percorso } = attuale.current;
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const larghezza = window.innerWidth;
      const indietroIos = iosInstallata() && e.clientX < BORDO_LIBERO && !/^\/allenamento\/.+/.test(percorso);
      if (!indietroIos) {
        if (!gestoAttivo(percorso) || nelBordo(e.clientX, larghezza)) return;
        // Only on the page: not on the bottom bar, windows or bubbles outside it
        if (!contenitore.current?.contains(e.target) || escluso(e.target, contenitore.current)) return;
      }
      gesto.current = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, larghezza, indietroIos, modo: null, percorso };
    };

    const muovi = (e) => {
      const g = gesto.current;
      if (!g || !e.isPrimary) return;
      const { percorso } = g;
      const { ridotto } = attuale.current;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.modo) {
        const dir = direzioneMovimento(dx, dy);
        if (!dir) return;
        if (dir === 'verticale') { chiudi(); return; }
        const verso = dx < 0 ? 1 : -1;
        if (g.indietroIos) {
          if (verso !== -1) { chiudi(); return; }
          g.modo = 'indietro';
        } else {
          const registrate = schede.current?.percorso === percorso ? schede.current : null;
          const dest = destinazioneGesto(percorso, verso, registrate);
          if (!dest) { chiudi(); return; }
          g.verso = verso;
          g.dest = dest;
          g.modo = dest.tipo === 'scheda' ? 'scheda' : 'pagina';
          g.schede = registrate;
          if (g.modo === 'scheda') g.schede.progresso?.stop();
        }
      }
      g.ultimoX = e.clientX;
      g.ultimoT = e.timeStamp;
      if (ridotto) return;
      if (g.modo === 'scheda') {
        g.schede.x?.set(dx);
        g.schede.progresso?.set(posizioneDuranteTrascinamento(g.schede.indice, dx, g.larghezza, g.schede.conteggio));
      } else {
        const fermo = g.modo === 'pagina' && (g.dest.tipo === 'fermo' || Math.sign(-dx) !== g.verso);
        ditoAttivo.current?.set(fermo ? dx * 0.2 : dx);
      }
    };

    const finisci = (e, annullato = false) => {
      const g = gesto.current;
      if (!g || !e.isPrimary) return;
      chiudi();
      if (!g.modo) return;
      const { ridotto, navigate } = attuale.current;
      const { percorso } = g;
      const dx = e.clientX - g.x0;
      const durata = Math.max(e.timeStamp - (g.ultimoT ?? g.t0), 1);
      // Speed of the last stretch, px/s (a quick flick counts)
      const vx = g.ultimoX != null ? ((e.clientX - g.ultimoX) / durata) * 1000 + (dx / Math.max(e.timeStamp - g.t0, 1)) * 1000 * 0.5 : 0;
      // A swipe must not also click what it started on
      const blocca = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', blocca, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', blocca, { capture: true }), 400);

      const dito = ditoAttivo.current;
      const torna = () => { if (dito) (ridotto ? dito.jump(0) : animate(dito, 0, MOLLA)); };

      if (g.modo === 'scheda') {
        const s = g.schede;
        const nuova = annullato ? s.indice : schedaDopoTrascinamento(s.indice, dx, vx, g.larghezza, s.conteggio);
        if (nuova !== s.indice) {
          s.x?.jump(0);
          s.onCambia(nuova);
        } else {
          if (ridotto) { s.x?.jump(0); s.progresso?.jump(s.indice); } else { animate(s.x, 0, MOLLA); animate(s.progresso, s.indice, MOLLA); }
        }
        return;
      }
      const verso = g.modo === 'indietro' ? -1 : g.verso;
      const valido = !annullato && Math.sign(-dx) === verso && superaSoglia(dx, vx, g.larghezza);
      if (g.modo === 'indietro') {
        if (valido && (window.history.state?.idx ?? 0) > 0) navigate(-1); else torna();
        return;
      }
      if (valido && g.dest.tipo === 'pagina') {
        navigate(g.dest.percorso, { replace: sostituisceStoria(percorso, g.dest.percorso) });
      } else {
        torna();
      }
    };

    const su = (e) => finisci(e);
    const annulla = (e) => finisci(e, true);
    window.addEventListener('pointerdown', inizia);
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', su);
    window.addEventListener('pointercancel', annulla);
    return () => {
      window.removeEventListener('pointerdown', inizia);
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', su);
      window.removeEventListener('pointercancel', annulla);
    };
  }, []);

  return (
    <SchedeContesto.Provider value={schede}>
      <div ref={contenitore} className="pagine-sfogliabili">
        <AnimatePresence initial={false} custom={custom}>
          <Foglio key={percorso} custom={custom} ditoAttivoRef={ditoAttivo}>
            {avvolgi(outlet)}
          </Foglio>
        </AnimatePresence>
      </div>
    </SchedeContesto.Provider>
  );
}
