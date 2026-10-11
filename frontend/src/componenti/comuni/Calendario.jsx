// ============================================
// GymMaster — Month/week calendar
// ============================================
//
// Component shared by the dashboard and the schedule page: the two used to
// show two almost identical grids, written twice.
//
// On the phone the month view squeezes the days so much that tapping them is
// awkward, so the week is the default mode there.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aStringaData, lunediDi } from '../../utils/formattatori.js';
import { localeCorrente } from '../../i18n/index.js';
import { useLingua } from '../../hooks/useLingua.js';

/** Initials of the weekdays in the current language, Monday first ("M T W T F S S") */
function giorniBrevi() {
  const formato = new Intl.DateTimeFormat(localeCorrente(), { weekday: 'narrow' });
  const lunedi = lunediDi(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunedi);
    d.setDate(lunedi.getDate() + i);
    return formato.format(d);
  });
}

/**
 * Label of the period shown.
 * Short version for the phone: "September 2026" does not fit next to the
 * month/week selector and was cut to "Septemb…".
 */
function etichetta(ancora, modo, breve = false) {
  if (modo === 'mese') {
    return ancora.toLocaleString(localeCorrente(), { month: breve ? 'short' : 'long', year: 'numeric' });
  }
  const inizio = lunediDi(ancora);
  const fine = new Date(inizio);
  fine.setDate(fine.getDate() + 6);
  const stessoMese = inizio.getMonth() === fine.getMonth();
  const da = inizio.toLocaleDateString(localeCorrente(), { day: 'numeric', ...(stessoMese ? {} : { month: 'short' }) });
  const a = fine.toLocaleDateString(localeCorrente(), { day: 'numeric', month: 'short' });
  return `${da} – ${a}`;
}

/**
 * @param {object} p
 * @param {'mese'|'settimana'} p.modo
 * @param {Date} p.ancora - date that defines the period shown
 * @param {(nuova: Date) => void} p.onCambiaAncora
 * @param {(modo: 'mese'|'settimana') => void} [p.onCambiaModo] - omitted: no selector
 * @param {Record<string, {colore: string}[]>} [p.marcatori] - dots per day
 * @param {string} [p.giornoSelezionato] - "YYYY-MM-DD"
 * @param {(giorno: string) => void} [p.onSelezionaGiorno] - omitted: days are not clickable
 */
export default function Calendario({
  modo = 'mese',
  ancora,
  onCambiaAncora,
  onCambiaModo,
  marcatori = {},
  giornoSelezionato,
  onSelezionaGiorno,
}) {
  const { t } = useLingua();
  const scorri = (delta) => {
    const nuova = new Date(ancora);
    if (modo === 'mese') nuova.setMonth(nuova.getMonth() + delta);
    else nuova.setDate(nuova.getDate() + delta * 7);
    onCambiaAncora(nuova);
  };

  const oggi = aStringaData(new Date());
  const cliccabile = typeof onSelezionaGiorno === 'function';

  // Cells of the period: the month starts on Monday and has leading blanks,
  // the week is a single row.
  const celle = [];
  if (modo === 'mese') {
    const anno = ancora.getFullYear(), m = ancora.getMonth();
    const primo = new Date(anno, m, 1).getDay();          // 0 = Sunday
    const offset = primo === 0 ? 6 : primo - 1;
    const giorniMese = new Date(anno, m + 1, 0).getDate();
    for (let i = 0; i < offset; i++) celle.push(null);
    for (let g = 1; g <= giorniMese; g++) celle.push(new Date(anno, m, g));
  } else {
    const inizio = lunediDi(ancora);
    for (let i = 0; i < 7; i++) {
      const d = new Date(inizio);
      d.setDate(inizio.getDate() + i);
      celle.push(d);
    }
  }

  return (
    <div>
      {/* Header: navigation and, if requested, the mode selector */}
      <div className="flex items-center justify-between gap-2 mb-4 bg-[rgba(0,0,0,0.2)] p-2 rounded-[var(--raggio-md)] border border-[var(--bordo-light)]">
        <button
          onClick={() => scorri(-1)}
          aria-label={modo === 'mese' ? t('calendario.mesePrecedente') : t('calendario.settimanaPrecedente')}
          className="p-2 rounded hover:bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-white transition-colors shrink-0"
        >
          <ChevronLeft size={20} />
        </button>

        <span className="font-bold capitalize tracking-wide text-center min-w-0 truncate text-sm sm:text-base">
          <span className="sm:hidden">{etichetta(ancora, modo, true)}</span>
          <span className="hidden sm:inline">{etichetta(ancora, modo)}</span>
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {onCambiaModo && (
            <div className="flex rounded-[var(--raggio-sm)] overflow-hidden border border-[var(--bordo-light)] mr-1">
              {['mese', 'settimana'].map(v => (
                <button
                  key={v}
                  onClick={() => onCambiaModo(v)}
                  aria-pressed={modo === v}
                  className="px-2 py-1 text-[11px] font-bold transition-colors"
                  style={modo === v
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { color: 'var(--testo-terziario)' }}
                >
                  {v === 'mese' ? t('calendario.modoMese') : t('calendario.modoSettimana')}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => scorri(1)}
            aria-label={modo === 'mese' ? t('calendario.meseSuccessivo') : t('calendario.settimanaSuccessiva')}
            className="p-2 rounded hover:bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-white transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {giorniBrevi().map((g, i) => (
          <div key={i} className="text-center text-xs font-bold text-[var(--testo-terziario)] pb-1">{g}</div>
        ))}

        {celle.map((data, i) => {
          if (!data) return <div key={`v-${i}`} />;

          const chiave = aStringaData(data);
          const pallini = marcatori[chiave] || [];
          const scelto = chiave === giornoSelezionato;
          const eOggi = chiave === oggi;

          // In week mode the cells are taller: there is room and tapping is easier
          const altezza = modo === 'settimana' ? 'h-16' : 'h-12';

          const classi = `relative ${altezza} rounded-[var(--raggio-md)] text-sm flex flex-col items-center justify-center border transition-colors ${
            scelto
              ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--testo-primario)] font-bold'
              : eOggi
                ? 'border-[var(--bordo-light)] bg-[var(--bg-terziario)] text-[var(--testo-primario)] font-bold'
                : `border-transparent text-[var(--testo-secondario)] ${cliccabile ? 'hover:bg-[var(--bg-terziario)]' : ''}`
          }`;

          const contenuto = (
            <>
              {modo === 'settimana' && (
                <span className="text-[10px] text-[var(--testo-terziario)] leading-none mb-0.5">
                  {data.toLocaleDateString(localeCorrente(), { month: 'short' })}
                </span>
              )}
              <span>{data.getDate()}</span>
              {pallini.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {pallini.slice(0, 3).map((p, idx) => (
                    <span key={idx} className="w-1.5 h-1.5 rounded-full" style={{ background: p.colore }} />
                  ))}
                </span>
              )}
            </>
          );

          return cliccabile ? (
            <button key={chiave} type="button" onClick={() => onSelezionaGiorno(chiave)} className={classi}>
              {contenuto}
            </button>
          ) : (
            <div key={chiave} className={classi}>{contenuto}</div>
          );
        })}
      </div>
    </div>
  );
}
