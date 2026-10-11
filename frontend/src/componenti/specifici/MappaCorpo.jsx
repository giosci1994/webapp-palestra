// ============================================
// GymMaster — Muscle map
// Front/back body outline with the muscles colored by the sets done
// ============================================
//
// The outline is the only way to pick a group: so every muscle is a button
// for the keyboard too (Tab, Enter or Space) and for screen readers.

import { useLingua } from '../../hooks/useLingua.js';
import { FRONTE, RETRO } from './sagomaCorpo.js';
import { COLORE_NON_ALLENATO } from '../../utils/costanti.js';

// Parts of the outline that do not match a trainable muscle
const DECORATIVI = new Set(['head', 'neck', 'knees']);

/**
 * @param {object} p
 * @param {Record<string, string>} p.colori - zone → fill color (missing: the untrained gray)
 * @param {Record<string, string>} p.etichette - muscle → description (tooltip and screen readers)
 * @param {Set<string>} p.evidenziati - muscles of the selected group
 * @param {(muscolo: string) => void} p.onTocca
 */
export default function MappaCorpo({ colori, etichette, evidenziati, onTocca }) {
  const { t } = useLingua();
  // `vista` and `descrizione` are translation keys: the caption and the screen reader label
  const figura = (dati, vista, descrizione) => {
    return (
      <figure className="flex-1 flex flex-col items-center gap-1.5 min-w-0 max-w-[160px]">
        <svg viewBox="0 0 100 200" className="mappa-muscoli w-full h-auto" role="group" aria-label={t(descrizione)}>
          {dati.map(({ muscolo, punti }) => {
            const decorativo = DECORATIVI.has(muscolo);
            const selezionato = evidenziati.has(muscolo);
            return (
              <g
                key={muscolo}
                {...(decorativo ? { 'aria-hidden': true } : {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': etichette[muscolo],
                  'aria-pressed': selezionato,
                  onClick: () => onTocca(muscolo),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTocca(muscolo); }
                  },
                })}
                style={{ cursor: decorativo ? 'default' : 'pointer' }}
              >
                {!decorativo && etichette[muscolo] && <title>{etichette[muscolo]}</title>}
                {punti.map((p, i) => (
                  <polygon
                    key={i}
                    points={p}
                    fill={colori[muscolo] || COLORE_NON_ALLENATO}
                    // Border in the background color: it separates neighboring muscles
                    stroke="var(--bg-primario)"
                    strokeWidth={0.4}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          })}
          {/* Selection outline in a separate layer, above everything: moving the
              muscle to the end of the drawing would make it lose keyboard focus */}
          <g aria-hidden="true" pointerEvents="none">
            {dati.filter(({ muscolo }) => evidenziati.has(muscolo)).flatMap(({ muscolo, punti }) =>
              punti.map((p, i) => (
                <polygon key={`${muscolo}-${i}`} points={p} fill="none" stroke="var(--testo-primario)" strokeWidth={1} strokeLinejoin="round" />
              ))
            )}
          </g>
        </svg>
        <figcaption className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t(vista)}</figcaption>
      </figure>
    );
  };

  return (
    <div className="flex items-start justify-center gap-6">
      {figura(FRONTE, 'mappaCorpo.fronte', 'mappaCorpo.ariaFronte')}
      {figura(RETRO, 'mappaCorpo.retro', 'mappaCorpo.ariaRetro')}
    </div>
  );
}
