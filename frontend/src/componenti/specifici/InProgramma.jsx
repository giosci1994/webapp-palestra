// ============================================
// GymMaster — Planned workouts, on top of the Allenati Ora page
// ============================================
//
// Today's workouts in big cards, ready to start (or to resume, if one was
// already started today), then the next ones of the week. Hidden when the
// calendar has nothing still to do. Silent on errors: the plans below are
// still there to start from.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight, Play, RotateCcw } from 'lucide-react';
import { api } from '../../config/api.js';
import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';
import { nomeGruppo } from '../../utils/formattatori.js';
import { periodoProssimi, prossimiDaFare, giorniDaOggi } from '../../utils/inProgramma.js';

/** "Tomorrow", or the short weekday and the day ("Thu 29") */
function etichettaGiorno(data, t) {
  if (giorniDaOggi(data) === 1) return t('allenamento.inProgramma.domani');
  const testo = new Date(`${data}T12:00:00`).toLocaleDateString(localeCorrente(), { weekday: 'short', day: 'numeric' });
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function DiOggi({ allenamento, onApri }) {
  const { t } = useLingua();
  const naviga = useNavigate();
  const inCorso = allenamento.sessioneInCorso;
  const inizia = () => (inCorso ? naviga(`/allenamento/${inCorso}`) : onApri(allenamento.scheda.id));

  return (
    <div className="glass-card p-5 relative overflow-hidden" style={{ border: '1px solid var(--accent)' }}>
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: 'var(--accent)' }} />
      <div className="relative flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            {inCorso ? t('promemoriaAllenamento.inCorso') : t('allenamento.inProgramma.oggi')}
          </p>
          <h3 className="text-xl font-bold mt-1 leading-snug">{allenamento.scheda.titolo}</h3>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {allenamento.gruppi.map(g => (
              <span key={g} className="text-xs px-2.5 py-1 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">{nomeGruppo(g)}</span>
            ))}
            <span className="text-xs text-[var(--testo-terziario)] ml-1">
              {t('comune.esercizi', { count: allenamento.esercizi })}
              {allenamento.ultimaVolta && ` · ${t('promemoriaAllenamento.ultimaVolta', { minuti: allenamento.ultimaVolta.durataMinuti })}`}
            </span>
          </div>
        </div>
        <button type="button" onClick={inizia} className="btn-primario w-full md:w-auto shrink-0">
          {inCorso ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
          {inCorso ? t('promemoriaAllenamento.riprendi') : t('promemoriaAllenamento.iniziaScheda')}
        </button>
      </div>
    </div>
  );
}

/** @param {{ onApri: (schedaId: number) => void }} props - onApri: opens the plan ready to start */
export default function InProgramma({ onApri }) {
  const { t } = useLingua();
  const [oggi, setOggi] = useState(null);
  const [prossimi, setProssimi] = useState(null);

  useEffect(() => {
    let attivo = true;
    const { da, a } = periodoProssimi();
    api.get('/pianificazione/oggi')
      .then(r => { if (attivo) setOggi(r.dati?.allenamenti || []); })
      .catch(() => { if (attivo) setOggi([]); });
    api.get(`/pianificazione?da=${da}&a=${a}`)
      .then(r => { if (attivo) setProssimi(prossimiDaFare(r.dati || [])); })
      .catch(() => { if (attivo) setProssimi([]); });
    return () => { attivo = false; };
  }, []);

  // Nothing until both have answered, so the page does not jump twice
  if (!oggi || !prossimi || (oggi.length === 0 && prossimi.length === 0)) return null;

  return (
    <section className="mb-8" aria-labelledby="in-programma-titolo">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id="in-programma-titolo" className="text-xl font-bold flex items-center gap-2">
          <CalendarClock size={20} className="text-[var(--accent)]" /> {t('allenamento.inProgramma.titolo')}
        </h2>
        <Link to="/pianificazione" className="text-sm font-semibold text-[var(--accent)] hover:underline">
          {t('allenamento.inProgramma.calendario')}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {oggi.map(a => <DiOggi key={a.id} allenamento={a} onApri={onApri} />)}

        {prossimi.length > 0 && (
          <div className="glass-card overflow-hidden">
            <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-[var(--testo-terziario)]">
              {t('allenamento.inProgramma.prossimi')}
            </p>
            {prossimi.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onApri(p.scheda.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--bordo-light)] last:border-b-0 hover:bg-[var(--bg-terziario)] transition-colors"
              >
                <span className="shrink-0 w-20 text-sm font-semibold text-[var(--accent)]">{etichettaGiorno(p.data, t)}</span>
                <span className="flex-1 min-w-0 font-semibold truncate">{p.scheda.titolo}</span>
                <ChevronRight size={16} className="shrink-0 text-[var(--testo-terziario)]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
