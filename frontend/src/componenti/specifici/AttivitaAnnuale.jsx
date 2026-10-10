// ============================================
// GymMaster — Attivita' dell'ultimo anno
// Un quadretto per giorno, come i contributi di GitHub
// ============================================

import { useMemo, useRef, useEffect, useState } from 'react';
import { grigliaAttivita, SETTIMANE_ATTIVITA } from '../../utils/attivita.js';
import { SCALA_ALLENAMENTO, COLORE_NON_ALLENATO } from '../../utils/costanti.js';

const CELLA = 12;   // px
const SPAZIO = 3;   // px fra i quadretti
const GIORNI_SETTIMANA = ['Lun', '', 'Mer', '', 'Ven', '', ''];

const colore = gradino => (gradino ? SCALA_ALLENAMENTO[gradino - 1] : COLORE_NON_ALLENATO);
const numero = n => n.toLocaleString('it-IT');
const dataLunga = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function descrivi(g) {
  if (!g.allenamenti) return `${dataLunga(g.giorno)}: riposo`;
  return `${dataLunga(g.giorno)}: ${numero(g.allenamenti)} ${g.allenamenti === 1 ? 'allenamento' : 'allenamenti'}, ${numero(g.serie)} serie`;
}

/**
 * @param {object} p
 * @param {{giorno: string, allenamenti: number, serie: number}[]} p.giorni - i giorni con almeno un allenamento
 */
export default function AttivitaAnnuale({ giorni = [] }) {
  const griglia = useMemo(() => grigliaAttivita(giorni), [giorni]);
  const [scelto, setScelto] = useState(null);
  const scorrimento = useRef(null);

  // Su telefono la griglia scorre in orizzontale: si parte dalle settimane recenti
  useEffect(() => {
    const el = scorrimento.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const larghezza = SETTIMANE_ATTIVITA * (CELLA + SPAZIO) - SPAZIO;

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">Attività dell'ultimo anno</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1">Un quadretto per giorno: più è chiaro, più serie hai completato.</p>

      <div className="flex gap-6 mt-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Allenamenti</p>
          <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(griglia.allenamenti)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Giorni attivi</p>
          <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(griglia.giorniAttivi)}</p>
        </div>
      </div>

      <div ref={scorrimento} className="overflow-x-auto no-scrollbar pb-1">
        <div className="flex gap-2 w-max">
          {/* Giorni della settimana, allineati alle righe */}
          <div className="grid shrink-0 text-[9px] text-[var(--testo-terziario)]"
               style={{ gridTemplateRows: `repeat(8, ${CELLA}px)`, rowGap: SPAZIO }}>
            <span />
            {GIORNI_SETTIMANA.map((g, i) => <span key={i} className="leading-[12px]">{g}</span>)}
          </div>

          <div>
            {/* Mesi, sopra la settimana che ne contiene il primo giorno */}
            <div className="relative text-[9px] text-[var(--testo-terziario)]" style={{ height: CELLA, width: larghezza, marginBottom: SPAZIO }}>
              {griglia.mesi.map(m => (
                <span key={m.colonna} className="absolute leading-[12px]" style={{ left: m.colonna * (CELLA + SPAZIO) }}>{m.etichetta}</span>
              ))}
            </div>

            <div className="grid grid-flow-col"
                 style={{ gridTemplateRows: `repeat(7, ${CELLA}px)`, gridAutoColumns: `${CELLA}px`, gap: SPAZIO }}>
              {griglia.settimane.flat().map((g, i) => g ? (
                <button
                  key={g.giorno}
                  type="button"
                  onClick={() => setScelto(g)}
                  title={descrivi(g)}
                  aria-label={descrivi(g)}
                  className="rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    background: colore(g.gradino),
                    outline: scelto?.giorno === g.giorno ? '2px solid var(--testo-primario)' : g.oggi ? '1px solid var(--testo-secondario)' : 'none',
                    outlineOffset: 1
                  }}
                />
              ) : <span key={`dopo-${i}`} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Dettaglio del giorno toccato e legenda */}
      <div className="flex items-center justify-between gap-x-4 gap-y-2 mt-3 flex-wrap text-[11px] text-[var(--testo-secondario)]">
        <p className="first-letter:uppercase">{scelto ? descrivi(scelto) : 'Tocca un giorno per i dettagli.'}</p>
        <div className="flex items-center gap-1" aria-hidden="true">
          <span className="mr-1 text-[var(--testo-terziario)]">Meno</span>
          {[0, 1, 2, 3, 4, 5].map(gradino => (
            <span key={gradino} className="rounded-[3px]" style={{ width: CELLA, height: CELLA, background: colore(gradino) }} />
          ))}
          <span className="ml-1 text-[var(--testo-terziario)]">Più</span>
        </div>
      </div>
    </div>
  );
}
