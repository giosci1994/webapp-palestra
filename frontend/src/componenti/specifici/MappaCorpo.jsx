// ============================================
// GymMaster — Mappa muscolare
// Sagoma fronte/retro con i muscoli colorati in base alle serie fatte
// ============================================
//
// La mappa e' un indice visivo per chi usa il tocco: le stesse informazioni
// sono nell'elenco dei gruppi sotto, che resta il percorso accessibile da
// tastiera e lettore di schermo. Per questo qui i poligoni non sono focusabili.

import { FRONTE, RETRO } from './sagomaCorpo.js';

// Parti della sagoma che non corrispondono a un muscolo allenabile
const DECORATIVI = new Set(['head', 'neck', 'knees']);

/**
 * @param {object} p
 * @param {Record<string, number>} p.intensita - muscolo → 0..1 (assente: mai allenato)
 * @param {Set<string>} p.evidenziati - muscoli del gruppo selezionato
 * @param {(muscolo: string) => void} p.onTocca
 */
export default function MappaCorpo({ intensita, evidenziati, onTocca }) {
  const figura = (dati, vista) => {
    // I muscoli evidenziati si disegnano per ultimi, cosi' il bordo di
    // selezione non viene coperto da quello dei muscoli vicini
    const ordinati = [...dati].sort((a, b) => evidenziati.has(a.muscolo) - evidenziati.has(b.muscolo));

    return (
      <figure className="flex-1 flex flex-col items-center gap-1.5 min-w-0 max-w-[160px]">
        <svg viewBox="0 0 100 200" className="w-full h-auto" aria-hidden="true">
          {ordinati.map(({ muscolo, punti }) => {
            const decorativo = DECORATIVI.has(muscolo);
            const valore = intensita[muscolo] || 0;
            const selezionato = evidenziati.has(muscolo);
            return (
              <g
                key={muscolo}
                onClick={decorativo ? undefined : () => onTocca(muscolo)}
                style={{ cursor: decorativo ? 'default' : 'pointer' }}
              >
                {punti.map((p, i) => (
                  <polygon
                    key={i}
                    points={p}
                    fill={valore > 0 ? 'var(--accent)' : 'var(--corpo-spento, #25253a)'}
                    // Anche il minimo resta ben distinguibile dal non allenato
                    fillOpacity={valore > 0 ? 0.3 + 0.7 * valore : 1}
                    stroke={selezionato ? 'var(--testo-primario)' : 'var(--bg-primario)'}
                    strokeWidth={selezionato ? 1 : 0.4}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          })}
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
