// ============================================
// GymMaster — Mappa muscolare
// Sagoma fronte/retro con i muscoli colorati in base alle serie fatte
// ============================================
//
// La sagoma e' l'unico modo per scegliere un gruppo: ogni muscolo e' quindi
// un pulsante anche da tastiera (Tab, Invio o Spazio) e per i lettori di schermo.

import { FRONTE, RETRO } from './sagomaCorpo.js';
import { COLORE_NON_ALLENATO } from '../../utils/costanti.js';

// Parti della sagoma che non corrispondono a un muscolo allenabile
const DECORATIVI = new Set(['head', 'neck', 'knees']);

/**
 * @param {object} p
 * @param {Record<string, string>} p.colori - zona → colore di riempimento (assente: grigio del non allenato)
 * @param {Record<string, string>} p.etichette - muscolo → descrizione (suggerimento e lettori di schermo)
 * @param {Set<string>} p.evidenziati - muscoli del gruppo selezionato
 * @param {(muscolo: string) => void} p.onTocca
 */
export default function MappaCorpo({ colori, etichette, evidenziati, onTocca }) {
  const figura = (dati, vista) => {
    return (
      <figure className="flex-1 flex flex-col items-center gap-1.5 min-w-0 max-w-[160px]">
        <svg viewBox="0 0 100 200" className="mappa-muscoli w-full h-auto" role="group" aria-label={`Muscoli, vista ${vista.toLowerCase()}`}>
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
                    // Bordo col colore dello sfondo: separa i muscoli vicini
                    stroke="var(--bg-primario)"
                    strokeWidth={0.4}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          })}
          {/* Contorno della selezione in un livello a parte, sopra tutto: spostare
              il muscolo in fondo al disegno gli farebbe perdere il focus da tastiera */}
          <g aria-hidden="true" pointerEvents="none">
            {dati.filter(({ muscolo }) => evidenziati.has(muscolo)).flatMap(({ muscolo, punti }) =>
              punti.map((p, i) => (
                <polygon key={`${muscolo}-${i}`} points={p} fill="none" stroke="var(--testo-primario)" strokeWidth={1} strokeLinejoin="round" />
              ))
            )}
          </g>
        </svg>
        <figcaption className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{vista}</figcaption>
      </figure>
    );
  };

  return (
    <div className="flex items-start justify-center gap-6">
      {figura(FRONTE, 'Fronte')}
      {figura(RETRO, 'Retro')}
    </div>
  );
}
