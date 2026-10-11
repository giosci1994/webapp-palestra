// ============================================
// GymMaster — Workout Schedule
// Calendar of the scheduled plans, with moving and postponing
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../config/api.js';
import {
  CalendarDays, Plus, Trash2, Check,
  SkipForward, PlayCircle, X, CalendarClock, ClipboardList
} from 'lucide-react';
import Spinner from '../componenti/comuni/Spinner.jsx';
import Calendario from '../componenti/comuni/Calendario.jsx';
import { aStringaData as aStringa, lunediDi } from '../utils/formattatori.js';
import { useTelefono } from '../hooks/useMediaQuery.js';
import { useLingua } from '../hooks/useLingua.js';
import { localeCorrente, traduci } from '../i18n/index.js';

/** Names of the weekdays in the current language, Monday first and capitalised */
function nomiGiorni() {
  const lingua = localeCorrente();
  const formato = new Intl.DateTimeFormat(lingua, { weekday: 'long' });
  const lunedi = lunediDi(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const giorno = new Date(lunedi);
    giorno.setDate(lunedi.getDate() + i);
    const nome = formato.format(giorno);
    return nome.charAt(0).toLocaleUpperCase(lingua) + nome.slice(1);
  });
}

// etichetta is a translation key: show it with t()
const STATI = {
  PIANIFICATO: { etichetta: 'pianificazione.stati.pianificato', colore: 'var(--accent)' },
  COMPLETATO: { etichetta: 'pianificazione.stati.completato', colore: 'var(--successo, #22c55e)' },
  SALTATO: { etichetta: 'pianificazione.stati.saltato', colore: 'var(--testo-terziario)' }
};

/** The calendar period as a key: "2026-09-28|2026-11-08" */
const chiavePeriodo = ({ da, a }) => `${da}|${a}`;

export default function Pianificazione() {
  const { t } = useLingua();
  // On a phone the monthly grid squeezes the days too much: there we start from
  // the week. Until the user picks one explicitly, the view follows the screen
  // width; after the choice it stays the one they wanted.
  const telefono = useTelefono();
  const [modoScelto, setModoScelto] = useState(null);
  const modo = modoScelto ?? (telefono ? 'settimana' : 'mese');
  const setModo = setModoScelto;
  const [ancora, setAncora] = useState(() => new Date());
  const [allenamenti, setAllenamenti] = useState([]);
  const [schede, setSchede] = useState([]);
  const [giornoScelto, setGiornoScelto] = useState(aStringa(new Date()));
  const [pannelloPiano, setPannelloPiano] = useState(false);
  const [errore, setErrore] = useState('');

  // The month shown plus a margin, so that moving a workout a few days past the
  // edge of the month still keeps it visible on reload.
  const intervallo = useCallback(() => {
    let da, a;
    if (modo === 'mese') {
      da = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
      a = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0);
    } else {
      da = lunediDi(ancora);
      a = new Date(da);
      a.setDate(a.getDate() + 6);
    }
    da.setDate(da.getDate() - 7);
    a.setDate(a.getDate() + 7);
    return { da: aStringa(da), a: aStringa(a) };
  }, [ancora, modo]);

  // The period shown: moving by a week or a month brings the spinner back,
  // while after an edit the calendar updates in place
  const [caricatoPer, setCaricatoPer] = useState(null);
  const caricamento = caricatoPer !== chiavePeriodo(intervallo());

  const carica = useCallback(() => {
    const periodo = intervallo();
    return Promise.all([
      api.get(`/pianificazione?da=${periodo.da}&a=${periodo.a}`),
      api.get('/schede').catch(() => ({ dati: [] }))
    ])
      .then(([resPiano, resSchede]) => {
        setAllenamenti(resPiano.dati || []);
        setSchede(resSchede.dati || []);
        setErrore('');
      })
      // traduci, not t: the callback must not change with the language (it would reload the calendar)
      .catch(err => setErrore(err?.message || traduci('pianificazione.errori.caricamento')))
      .finally(() => setCaricatoPer(chiavePeriodo(periodo)));
  }, [intervallo]);

  useEffect(() => { carica(); }, [carica]);

  const perGiorno = allenamenti.reduce((acc, a) => {
    (acc[a.data] = acc[a.data] || []).push(a);
    return acc;
  }, {});

  const azione = async (fn) => {
    try {
      setErrore('');
      await fn();
      await carica();
    } catch (err) {
      setErrore(err?.message || t('pianificazione.errori.operazione'));
    }
  };

  const rimanda = (a, giorni) => azione(() => api.patch(`/pianificazione/${a.id}`, { rimandaGiorni: giorni }));
  const cambiaStato = (a, stato) => azione(() => api.patch(`/pianificazione/${a.id}`, { stato }));
  const elimina = (a) => azione(() => api.delete(`/pianificazione/${a.id}`));
  const spostaA = (a, data) => azione(() => api.patch(`/pianificazione/${a.id}`, { data }));

  // Colored dots by status, one per workout of the day
  const marcatori = Object.fromEntries(
    Object.entries(perGiorno).map(([giorno, lista]) => [giorno, lista.map(a => ({ colore: STATI[a.stato].colore }))])
  );

  const delGiornoScelto = perGiorno[giornoScelto] || [];

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock size={26} className="text-[var(--accent)]" /> {t('pianificazione.titolo')}
        </h1>
        <button
          type="button"
          onClick={() => setPannelloPiano(v => !v)}
          className="py-2 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-lg transition-colors shadow-[var(--ombra-accent)] flex items-center gap-2"
        >
          <Plus size={16} /> {t('pianificazione.pianificaSettimana')}
        </button>
      </div>

      {errore && (
        <div className="glass-card p-card-inner mb-6 border border-[var(--pericolo)] text-sm text-[var(--pericolo)]">
          {errore}
        </div>
      )}

      <AnimatePresence>
        {pannelloPiano && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-8">
            <PianificaSettimana
              schede={schede}
              onFatto={() => { setPannelloPiano(false); carica(); }}
              onErrore={setErrore}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {caricamento ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
          {/* Calendar */}
          <div className="glass-card p-card-inner">
            <Calendario
              modo={modo}
              ancora={ancora}
              onCambiaAncora={setAncora}
              onCambiaModo={setModo}
              marcatori={marcatori}
              giornoSelezionato={giornoScelto}
              onSelezionaGiorno={setGiornoScelto}
            />

            <div className="flex items-center gap-4 mt-6 pt-4 border-t border-[var(--bordo-light)] text-xs text-[var(--testo-terziario)] flex-wrap">
              {Object.entries(STATI).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: v.colore }} /> {t(v.etichetta)}
                </span>
              ))}
            </div>
          </div>

          {/* Day detail */}
          <div className="glass-card p-card-inner flex flex-col">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
              <CalendarDays size={20} className="text-[var(--testo-secondario)]" />
              {new Date(`${giornoScelto}T00:00:00`).toLocaleDateString(localeCorrente(), { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>

            {delGiornoScelto.length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)] mt-4">
                {t('pianificazione.nessunAllenamento')}
              </p>
            ) : (
              <div className="flex flex-col gap-3 mt-4">
                {delGiornoScelto.map(a => (
                  <div key={a.id} className="rounded-[var(--raggio-md)] border border-[var(--bordo-light)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{a.scheda.titolo}</p>
                        <p className="text-xs" style={{ color: STATI[a.stato].colore }}>{t(STATI[a.stato].etichetta)}</p>
                        {a.creatoDa?.ruolo === 'PERSONAL_TRAINER' && (
                          <p className="text-xs text-[var(--testo-terziario)] mt-0.5">{t('pianificazione.assegnatoDa', { nome: a.creatoDa.nome })}</p>
                        )}
                      </div>
                      <button onClick={() => elimina(a)} aria-label={t('pianificazione.rimuoviDalCalendario')} className="p-1.5 rounded text-[var(--testo-terziario)] hover:text-[var(--pericolo)] transition-colors shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {/* /allenamento/:id wants a session, not a plan: with the plan's number
                          the session did not exist and the user ended up in "Gestione schede"
                          (plan management). "Allenati ora" opens the plan ready to start instead. */}
                      <Link to={`/allenamento?scheda=${a.scheda.id}`} style={{ color: '#fff' }} className="py-1.5 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                        <PlayCircle size={14} /> {t('pianificazione.inizia')}
                      </Link>
                      <button onClick={() => rimanda(a, 1)} className="py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] transition-colors">
                        {t('pianificazione.piuUnGiorno')}
                      </button>
                      <button onClick={() => rimanda(a, 7)} className="py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] transition-colors">
                        {t('pianificazione.piuUnaSettimana')}
                      </button>
                      {a.stato !== 'COMPLETATO' && (
                        <button onClick={() => cambiaStato(a, 'COMPLETATO')} aria-label={t('pianificazione.segnaCompletato')} className="p-1.5 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--successo,#22c55e)] transition-colors">
                          <Check size={14} />
                        </button>
                      )}
                      {a.stato !== 'SALTATO' && (
                        <button onClick={() => cambiaStato(a, 'SALTATO')} aria-label={t('pianificazione.segnaSaltato')} className="p-1.5 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors">
                          <SkipForward size={14} />
                        </button>
                      )}
                    </div>

                    <label className="flex items-center gap-2 mt-3 text-xs text-[var(--testo-terziario)]">
                      {t('pianificazione.spostaAl')}
                      <input
                        type="date"
                        value={a.data}
                        onChange={(e) => e.target.value && spostaA(a, e.target.value)}
                        className="bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded px-2 py-1 text-[var(--testo-primario)]"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}

            <AggiungiSingolo
              schede={schede}
              data={giornoScelto}
              onFatto={carica}
              onErrore={setErrore}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Schedule a single plan on the selected day. */
function AggiungiSingolo({ schede, data, onFatto, onErrore }) {
  const { t } = useLingua();
  const [schedaId, setSchedaId] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const aggiungi = async () => {
    if (!schedaId) return;
    try {
      setInCorso(true);
      await api.post('/pianificazione', { schedaId: Number(schedaId), data });
      setSchedaId('');
      onFatto();
    } catch (err) {
      onErrore(err?.message || t('pianificazione.errori.programmaScheda'));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-[var(--bordo-light)]">
      <p className="text-xs font-bold text-[var(--testo-terziario)] mb-2 uppercase tracking-wide">{t('pianificazione.aggiungiAQuestoGiorno')}</p>
      <div className="flex items-center gap-2">
        <select
          value={schedaId}
          onChange={(e) => setSchedaId(e.target.value)}
          className="flex-1 min-w-0 bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
        >
          <option value="">{t('pianificazione.scegliScheda')}</option>
          {schede.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
        </select>
        <button
          type="button"
          onClick={aggiungi}
          disabled={!schedaId || inCorso}
          className="py-2 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Weekly distribution: the typical use is not a single plan repeated every
 * day, but several plans assigned to different days and repeated for a few
 * weeks.
 */
function PianificaSettimana({ schede, onFatto, onErrore }) {
  const { t } = useLingua();
  const [voci, setVoci] = useState([{ schedaId: '', giornoSettimana: 0 }]);
  const [dataInizio, setDataInizio] = useState(aStringa(new Date()));
  const [settimane, setSettimane] = useState(4);
  const [inCorso, setInCorso] = useState(false);

  const aggiornaVoce = (i, campo, valore) =>
    setVoci(v => v.map((voce, idx) => (idx === i ? { ...voce, [campo]: valore } : voce)));

  const pronte = voci.filter(v => v.schedaId);

  const invia = async () => {
    if (pronte.length === 0) return;
    try {
      setInCorso(true);
      const res = await api.post('/pianificazione/settimanale', {
        dataInizio,
        settimane: Number(settimane),
        voci: pronte.map(v => ({ schedaId: Number(v.schedaId), giornoSettimana: Number(v.giornoSettimana) }))
      });
      if (res.dati?.creati === 0) {
        onErrore(t('pianificazione.errori.giaTuttiInCalendario'));
      }
      onFatto();
    } catch (err) {
      onErrore(err?.message || t('pianificazione.errori.creaPianificazione'));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="glass-card p-card-inner">
      <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
        <ClipboardList size={20} className="text-[var(--accent)]" /> {t('pianificazione.pianificaSettimana')}
      </h3>
      <p className="text-xs text-[var(--testo-secondario)] mb-5">
        {t('pianificazione.descrizioneSettimana')}
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {voci.map((voce, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={voce.schedaId}
              onChange={(e) => aggiornaVoce(i, 'schedaId', e.target.value)}
              className="flex-1 min-w-0 bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
            >
              <option value="">{t('pianificazione.scegliScheda')}</option>
              {schede.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
            </select>
            <select
              value={voce.giornoSettimana}
              onChange={(e) => aggiornaVoce(i, 'giornoSettimana', e.target.value)}
              className="bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)] shrink-0"
            >
              {nomiGiorni().map((g, idx) => <option key={idx} value={idx}>{g}</option>)}
            </select>
            {voci.length > 1 && (
              <button type="button" onClick={() => setVoci(v => v.filter((_, idx) => idx !== i))} aria-label={t('pianificazione.togliRiga')} className="p-2 rounded text-[var(--testo-terziario)] hover:text-[var(--pericolo)] transition-colors shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setVoci(v => [...v, { schedaId: '', giornoSettimana: Math.min(6, v.length * 2) }])}
        className="text-xs font-semibold text-[var(--accent)] hover:underline mb-5 flex items-center gap-1"
      >
        <Plus size={14} /> {t('pianificazione.aggiungiGiorno')}
      </button>

      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs text-[var(--testo-terziario)] flex flex-col gap-1">
          {t('pianificazione.aPartireDal')}
          <input
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            className="bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
          />
        </label>
        <label className="text-xs text-[var(--testo-terziario)] flex flex-col gap-1">
          {t('pianificazione.perQuanteSettimane')}
          <input
            type="number"
            min="1"
            max="12"
            value={settimane}
            onChange={(e) => setSettimane(e.target.value)}
            className="w-24 bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
          />
        </label>
        <button
          type="button"
          onClick={invia}
          disabled={pronte.length === 0 || inCorso}
          className="py-2 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors shadow-[var(--ombra-accent)]"
        >
          {inCorso ? t('pianificazione.pianifico') : t('pianificazione.mettiInCalendario')}
        </button>
      </div>
    </div>
  );
}
