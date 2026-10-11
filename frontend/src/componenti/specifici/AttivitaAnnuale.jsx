// ============================================
// GymMaster — Activity over the last year
// One square per day, like GitHub contributions
// ============================================

import { useMemo, useRef, useEffect, useState } from 'react';
import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';
import { grigliaAttivita, SETTIMANE_ATTIVITA } from '../../utils/attivita.js';
import { SCALA_ALLENAMENTO, COLORE_NON_ALLENATO } from '../../utils/costanti.js';

const CELLA = 12;   // px
const SPAZIO = 3;   // px between the squares
// Rows labeled with their day (0 = Monday): Monday, Wednesday and Friday
const GIORNI_SETTIMANA = [0, null, 2, null, 4, null, null];

const colore = gradino => (gradino ? SCALA_ALLENAMENTO[gradino - 1] : COLORE_NON_ALLENATO);
const numero = n => n.toLocaleString(localeCorrente());
const dataLunga = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeCorrente(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Short name of a weekday in the current language (0 = Monday), with the first letter capitalized. */
function nomeGiorno(indice) {
  const locale = localeCorrente();
  // 1 January 2024 was a Monday
  const nome = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + indice)));
  return nome.charAt(0).toLocaleUpperCase(locale) + nome.slice(1);
}

function descrivi(g, t) {
  const data = dataLunga(g.giorno);
  if (!g.allenamenti) return t('attivitaAnnuale.riposo', { data });
  return t('attivitaAnnuale.giornoAttivo', {
    data,
    allenamenti: t('attivitaAnnuale.nAllenamenti', { count: g.allenamenti, numero: numero(g.allenamenti) }),
    serie: t('comune.serie', { count: g.serie })
  });
}

/**
 * @param {object} p
 * @param {{giorno: string, allenamenti: number, serie: number}[]} p.giorni - the days with at least one workout
 */
export default function AttivitaAnnuale({ giorni = [] }) {
  const { t, lingua } = useLingua();
  // The month names depend on the language: today's date is the default
  const griglia = useMemo(() => grigliaAttivita(giorni, undefined, lingua), [giorni, lingua]);
  const [scelto, setScelto] = useState(null);
  const scorrimento = useRef(null);

  // On the phone the grid scrolls horizontally: it starts from the recent weeks
  useEffect(() => {
    const el = scorrimento.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const larghezza = SETTIMANE_ATTIVITA * (CELLA + SPAZIO) - SPAZIO;

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">{t('attivitaAnnuale.titolo')}</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('attivitaAnnuale.descrizione')}</p>

      <div className="flex gap-6 mt-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t('attivitaAnnuale.allenamenti')}</p>
          <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(griglia.allenamenti)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t('attivitaAnnuale.giorniAttivi')}</p>
          <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(griglia.giorniAttivi)}</p>
        </div>
      </div>

      <div ref={scorrimento} className="overflow-x-auto no-scrollbar pb-1">
        <div className="flex gap-2 w-max">
          {/* Days of the week, aligned with the rows */}
          <div className="grid shrink-0 text-[9px] text-[var(--testo-terziario)]"
               style={{ gridTemplateRows: `repeat(8, ${CELLA}px)`, rowGap: SPAZIO }}>
            <span />
            {GIORNI_SETTIMANA.map((g, i) => <span key={i} className="leading-[12px]">{g == null ? '' : nomeGiorno(g)}</span>)}
          </div>

          <div>
            {/* Months, above the week that holds their first day */}
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
                  title={descrivi(g, t)}
                  aria-label={descrivi(g, t)}
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

      {/* Details of the tapped day and legend */}
      <div className="flex items-center justify-between gap-x-4 gap-y-2 mt-3 flex-wrap text-[11px] text-[var(--testo-secondario)]">
        <p className="first-letter:uppercase">{scelto ? descrivi(scelto, t) : t('attivitaAnnuale.tocca')}</p>
        <div className="flex items-center gap-1" aria-hidden="true">
          <span className="mr-1 text-[var(--testo-terziario)]">{t('attivitaAnnuale.meno')}</span>
          {[0, 1, 2, 3, 4, 5].map(gradino => (
            <span key={gradino} className="rounded-[3px]" style={{ width: CELLA, height: CELLA, background: colore(gradino) }} />
          ))}
          <span className="ml-1 text-[var(--testo-terziario)]">{t('attivitaAnnuale.piu')}</span>
        </div>
      </div>
    </div>
  );
}
