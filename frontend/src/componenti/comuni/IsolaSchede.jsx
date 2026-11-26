/*
 * The tab island of Kokonut UI (smooth-tab, MIT, @dorianbaffier,
 * https://github.com/kokonut-labs/kokonutui), reduced to the tab list.
 *
 * Changes from the original:
 * - framer-motion (already in the app) instead of the extra `motion` package,
 *   plain JSX instead of TSX, no clsx / tailwind-merge;
 * - colours from the app variables (index.css, IsolaSchede.css), not from the
 *   zinc + `dark:` classes: in Tailwind 4 `dark:` follows the system setting
 *   (prefers-color-scheme), not the app theme, so with a light system the
 *   island turned white on the dark app, and the indicator was a neutral grey
 *   instead of the accent;
 * - the panel and the swipe stay in the page: the island only switches tab;
 *   the page can pass `progresso` (a motion value with the fractional tab
 *   position) to make the indicator follow a swipe;
 * - with "reduce motion" the indicator jumps instead of sliding.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import './IsolaSchede.css';

const MOLLA = { type: 'spring', stiffness: 420, damping: 38 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// The indicator rectangle at a fractional tab position.
function rettangolo(rects, p) {
  const ultimo = rects.length - 1;
  if (ultimo < 0) return null;
  const q = clamp(p, 0, ultimo);
  const i = Math.min(Math.floor(q), Math.max(ultimo - 1, 0));
  const a = rects[i];
  const b = rects[Math.min(i + 1, ultimo)];
  const t = q - i;
  return { left: lerp(a.left, b.left, t), width: lerp(a.width, b.width, t), top: a.top, height: a.height };
}

// idBase: tab i gets the id `${idBase}-${i}`, so the page can label its panel with it.
// progresso: optional motion value shared with the page (0 = first tab, 1.5 = halfway between the second and the third).
export default function IsolaSchede({ items, value, onChange, label, idPannello, idBase, progresso }) {
  const count = items.length;
  const selected = Math.max(items.findIndex((it) => it.id === value), 0);
  const proprio = useMotionValue(selected);
  const progress = progresso || proprio;
  const listaRef = useRef(null);
  const sopraRef = useRef(null);
  const tabRefs = useRef([]);
  const rects = useRef([]);
  const misura = useRef({ width: 0, height: 0 });
  const anim = useRef(null);
  const ridotto = useRef(false);

  // Paints the indicator: the same labels in the accent colour, clipped to the
  // indicator, so each label is right at every point of the slide.
  const dipingi = useCallback((p) => {
    const sopra = sopraRef.current;
    const r = rettangolo(rects.current, p);
    if (!sopra || !r) return;
    const destra = misura.current.width - r.left - r.width;
    const sotto = misura.current.height - r.top - r.height;
    sopra.style.clipPath = `inset(${r.top}px ${destra}px ${sotto}px ${r.left}px round ${r.height / 2}px)`;
  }, []);

  useLayoutEffect(() => {
    const lista = listaRef.current;
    if (!lista) return undefined;
    let vivo = true;
    const misurare = () => {
      if (!vivo) return;
      const box = lista.getBoundingClientRect();
      misura.current = { width: box.width, height: box.height };
      rects.current = tabRefs.current.slice(0, count).map((tab) => {
        const r = tab?.getBoundingClientRect();
        return r ? { left: r.left - box.left, width: r.width, top: r.top - box.top, height: r.height } : { left: 0, width: 0, top: 0, height: 0 };
      });
      dipingi(progress.get());
    };
    misurare();
    const osservatore = new ResizeObserver(misurare);
    osservatore.observe(lista);
    document.fonts?.ready.then(misurare).catch(() => undefined);
    return () => { vivo = false; osservatore.disconnect(); };
  }, [count, dipingi, progress]);

  useEffect(() => {
    const via = progress.on('change', dipingi);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { ridotto.current = query.matches; };
    sync();
    query.addEventListener('change', sync);
    return () => { via(); query.removeEventListener('change', sync); anim.current?.stop(); };
  }, [dipingi, progress]);

  // The selected tab changed (click, keys or from outside): move the indicator.
  useEffect(() => {
    anim.current?.stop();
    if (ridotto.current) { progress.jump(selected); return; }
    anim.current = animate(progress, selected, MOLLA);
  }, [selected, progress]);

  const scegli = (i) => {
    const prossimo = clamp(i, 0, count - 1);
    if (items[prossimo].id !== value) onChange?.(items[prossimo].id);
  };

  const tasti = (e, i) => {
    const mappa = { ArrowRight: (i + 1) % count, ArrowLeft: (i - 1 + count) % count, Home: 0, End: count - 1 };
    const prossimo = mappa[e.key];
    if (prossimo === undefined) return;
    e.preventDefault();
    tabRefs.current[prossimo]?.focus();
    scegli(prossimo);
  };

  return (
    <div className="isola-schede-riga">
      <div ref={listaRef} role="tablist" aria-label={label} className="isola-schede">
        {items.map((it, i) => {
          const Icona = it.icon;
          const attiva = i === selected;
          return (
            <button
              key={it.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              id={`${idBase}-${i}`}
              type="button"
              role="tab"
              aria-selected={attiva}
              aria-controls={idPannello}
              tabIndex={attiva ? 0 : -1}
              onClick={() => scegli(i)}
              onKeyDown={(e) => tasti(e, i)}
              className="isola-scheda"
            >
              {Icona && <Icona aria-hidden="true" className="isola-icona" />}
              <span>{it.title}</span>
            </button>
          );
        })}
        <div ref={sopraRef} aria-hidden="true" className="isola-indicatore" style={{ clipPath: 'inset(0 100% 0 0)' }}>
          {items.map((it) => {
            const Icona = it.icon;
            return (
              <span key={it.id} className="isola-scheda">
                {Icona && <Icona className="isola-icona" />}
                <span>{it.title}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
