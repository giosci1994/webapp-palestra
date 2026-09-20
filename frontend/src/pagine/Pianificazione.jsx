// ============================================
// GymMaster — Pianificazione Allenamenti
// Calendario delle schede programmate, con spostamento e rinvio
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../config/api.js';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Check,
  SkipForward, PlayCircle, X, CalendarClock, ClipboardList
} from 'lucide-react';
import Spinner from '../componenti/comuni/Spinner.jsx';

const GIORNI_BREVI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const GIORNI_NOMI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

/** "YYYY-MM-DD" da una data locale, senza passare per UTC (che sposterebbe il giorno). */
function aStringa(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATI = {
  PIANIFICATO: { etichetta: 'Da fare', colore: 'var(--accent)' },
  COMPLETATO: { etichetta: 'Completato', colore: 'var(--successo, #22c55e)' },
  SALTATO: { etichetta: 'Saltato', colore: 'var(--testo-terziario)' }
};

export default function Pianificazione() {
  const [mese, setMese] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [allenamenti, setAllenamenti] = useState([]);
  const [schede, setSchede] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [giornoScelto, setGiornoScelto] = useState(aStringa(new Date()));
  const [pannelloPiano, setPannelloPiano] = useState(false);
  const [errore, setErrore] = useState('');

  // Il mese mostrato piu' un margine, cosi' spostando un allenamento di qualche
  // giorno oltre il bordo del mese resta comunque visibile al ricaricamento.
  const intervallo = useCallback(() => {
    const da = new Date(mese.getFullYear(), mese.getMonth(), 1);
    const a = new Date(mese.getFullYear(), mese.getMonth() + 1, 0);
    da.setDate(da.getDate() - 7);
    a.setDate(a.getDate() + 7);
    return { da: aStringa(da), a: aStringa(a) };
  }, [mese]);

  const carica = useCallback(async () => {
    try {
      setCaricamento(true);
      const { da, a } = intervallo();
      const [resPiano, resSchede] = await Promise.all([
        api.get(`/pianificazione?da=${da}&a=${a}`),
        api.get('/schede').catch(() => ({ dati: [] }))
      ]);
      setAllenamenti(resPiano.dati || []);
      setSchede(resSchede.dati || []);
      setErrore('');
    } catch (err) {
      setErrore(err?.message || 'Impossibile caricare il calendario');
    } finally {
      setCaricamento(false);
    }
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
      setErrore(err?.message || 'Operazione non riuscita');
    }
  };

  const rimanda = (a, giorni) => azione(() => api.patch(`/pianificazione/${a.id}`, { rimandaGiorni: giorni }));
  const cambiaStato = (a, stato) => azione(() => api.patch(`/pianificazione/${a.id}`, { stato }));
  const elimina = (a) => azione(() => api.delete(`/pianificazione/${a.id}`));
  const spostaA = (a, data) => azione(() => api.patch(`/pianificazione/${a.id}`, { data }));

  // --- Griglia del mese, con il lunedì come primo giorno ---
  const celle = () => {
    const anno = mese.getFullYear(), m = mese.getMonth();
    const primo = new Date(anno, m, 1).getDay();       // 0 = domenica
    const offset = primo === 0 ? 6 : primo - 1;         // sposta a lunedì
    const giorni = new Date(anno, m + 1, 0).getDate();
    const oggi = aStringa(new Date());
    const out = [];

    for (let i = 0; i < offset; i++) out.push(<div key={`v-${i}`} />);

    for (let g = 1; g <= giorni; g++) {
      const data = `${anno}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      const delGiorno = perGiorno[data] || [];
      const scelto = data === giornoScelto;

      out.push(
        <button
          key={data}
          type="button"
          onClick={() => setGiornoScelto(data)}
          className={`relative h-12 rounded-[var(--raggio-md)] text-sm flex flex-col items-center justify-center transition-colors border ${
            scelto
              ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--testo-primario)] font-bold'
              : data === oggi
                ? 'border-[var(--bordo-light)] bg-[var(--bg-terziario)] text-[var(--testo-primario)] font-bold'
                : 'border-transparent text-[var(--testo-secondario)] hover:bg-[var(--bg-terziario)]'
          }`}
        >
          <span>{g}</span>
          {delGiorno.length > 0 && (
            <span className="absolute bottom-1 flex gap-0.5">
              {delGiorno.slice(0, 3).map(a => (
                <span key={a.id} className="w-1.5 h-1.5 rounded-full" style={{ background: STATI[a.stato].colore }} />
              ))}
            </span>
          )}
        </button>
      );
    }
    return out;
  };

  const delGiornoScelto = perGiorno[giornoScelto] || [];

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock size={26} className="text-[var(--accent)]" /> Pianificazione
        </h1>
        <button
          type="button"
          onClick={() => setPannelloPiano(v => !v)}
          className="py-2 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-lg transition-colors shadow-[var(--ombra-accent)] flex items-center gap-2"
        >
          <Plus size={16} /> Pianifica la settimana
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
          {/* Calendario */}
          <div className="glass-card p-card-inner">
            <div className="flex items-center justify-between mb-6 bg-[rgba(0,0,0,0.2)] p-2 rounded-[var(--raggio-md)] border border-[var(--bordo-light)]">
              <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))} className="p-2 rounded hover:bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-white transition-colors">
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold capitalize tracking-wide">
                {mese.toLocaleString('it-IT', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))} className="p-2 rounded hover:bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-white transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {GIORNI_BREVI.map((g, i) => (
                <div key={i} className="text-center text-xs font-bold text-[var(--testo-terziario)] pb-2">{g}</div>
              ))}
              {celle()}
            </div>

            <div className="flex items-center gap-4 mt-6 pt-4 border-t border-[var(--bordo-light)] text-xs text-[var(--testo-terziario)] flex-wrap">
              {Object.entries(STATI).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: v.colore }} /> {v.etichetta}
                </span>
              ))}
            </div>
          </div>

          {/* Dettaglio del giorno */}
          <div className="glass-card p-card-inner flex flex-col">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
              <CalendarDays size={20} className="text-[var(--testo-secondario)]" />
              {new Date(`${giornoScelto}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>

            {delGiornoScelto.length === 0 ? (
              <p className="text-sm text-[var(--testo-terziario)] mt-4">
                Nessun allenamento programmato in questo giorno.
              </p>
            ) : (
              <div className="flex flex-col gap-3 mt-4">
                {delGiornoScelto.map(a => (
                  <div key={a.id} className="rounded-[var(--raggio-md)] border border-[var(--bordo-light)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{a.scheda.titolo}</p>
                        <p className="text-xs" style={{ color: STATI[a.stato].colore }}>{STATI[a.stato].etichetta}</p>
                        {a.creatoDa?.ruolo === 'PERSONAL_TRAINER' && (
                          <p className="text-xs text-[var(--testo-terziario)] mt-0.5">Assegnato da {a.creatoDa.nome}</p>
                        )}
                      </div>
                      <button onClick={() => elimina(a)} aria-label="Rimuovi dal calendario" className="p-1.5 rounded text-[var(--testo-terziario)] hover:text-[var(--pericolo)] transition-colors shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      <Link to={`/allenamento/${a.scheda.id}`} style={{ color: '#fff' }} className="py-1.5 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                        <PlayCircle size={14} /> Inizia
                      </Link>
                      <button onClick={() => rimanda(a, 1)} className="py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] transition-colors">
                        +1 giorno
                      </button>
                      <button onClick={() => rimanda(a, 7)} className="py-1.5 px-3 text-xs font-semibold rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] transition-colors">
                        +1 settimana
                      </button>
                      {a.stato !== 'COMPLETATO' && (
                        <button onClick={() => cambiaStato(a, 'COMPLETATO')} aria-label="Segna come completato" className="p-1.5 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--successo,#22c55e)] transition-colors">
                          <Check size={14} />
                        </button>
                      )}
                      {a.stato !== 'SALTATO' && (
                        <button onClick={() => cambiaStato(a, 'SALTATO')} aria-label="Segna come saltato" className="p-1.5 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors">
                          <SkipForward size={14} />
                        </button>
                      )}
                    </div>

                    <label className="flex items-center gap-2 mt-3 text-xs text-[var(--testo-terziario)]">
                      Sposta al
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

/** Programma una singola scheda nel giorno selezionato. */
function AggiungiSingolo({ schede, data, onFatto, onErrore }) {
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
      onErrore(err?.message || 'Impossibile programmare la scheda');
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-[var(--bordo-light)]">
      <p className="text-xs font-bold text-[var(--testo-terziario)] mb-2 uppercase tracking-wide">Aggiungi a questo giorno</p>
      <div className="flex items-center gap-2">
        <select
          value={schedaId}
          onChange={(e) => setSchedaId(e.target.value)}
          className="flex-1 min-w-0 bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
        >
          <option value="">Scegli una scheda…</option>
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
 * Distribuzione settimanale: l'uso tipico non e' una sola scheda ripetuta ogni
 * giorno, ma piu' schede assegnate a giorni diversi e ripetute per qualche
 * settimana.
 */
function PianificaSettimana({ schede, onFatto, onErrore }) {
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
        onErrore('Nessun nuovo allenamento: erano già tutti in calendario.');
      }
      onFatto();
    } catch (err) {
      onErrore(err?.message || 'Impossibile creare la pianificazione');
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="glass-card p-card-inner">
      <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
        <ClipboardList size={20} className="text-[var(--accent)]" /> Pianifica la settimana
      </h3>
      <p className="text-xs text-[var(--testo-secondario)] mb-5">
        Assegna ogni scheda al suo giorno: la distribuzione viene ripetuta per le settimane indicate.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {voci.map((voce, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={voce.schedaId}
              onChange={(e) => aggiornaVoce(i, 'schedaId', e.target.value)}
              className="flex-1 min-w-0 bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
            >
              <option value="">Scegli una scheda…</option>
              {schede.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
            </select>
            <select
              value={voce.giornoSettimana}
              onChange={(e) => aggiornaVoce(i, 'giornoSettimana', e.target.value)}
              className="bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)] shrink-0"
            >
              {GIORNI_NOMI.map((g, idx) => <option key={idx} value={idx}>{g}</option>)}
            </select>
            {voci.length > 1 && (
              <button type="button" onClick={() => setVoci(v => v.filter((_, idx) => idx !== i))} aria-label="Togli questa riga" className="p-2 rounded text-[var(--testo-terziario)] hover:text-[var(--pericolo)] transition-colors shrink-0">
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
        <Plus size={14} /> Aggiungi un altro giorno
      </button>

      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs text-[var(--testo-terziario)] flex flex-col gap-1">
          A partire dal
          <input
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            className="bg-[var(--bg-terziario)] border border-[var(--bordo-light)] rounded-lg px-3 py-2 text-sm text-[var(--testo-primario)]"
          />
        </label>
        <label className="text-xs text-[var(--testo-terziario)] flex flex-col gap-1">
          Per quante settimane
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
          {inCorso ? 'Pianifico…' : 'Metti in calendario'}
        </button>
      </div>
    </div>
  );
}
