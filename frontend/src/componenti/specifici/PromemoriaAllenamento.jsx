// ============================================
// GymMaster — Today's workout reminder
// Shown when the app opens and a workout is planned for today: what is
// waiting, when the gym is quietest and a button to start right away.
// ============================================
//
// "Opening the app" means both a fresh start and coming back after a long
// pause: a PWA often stays in memory and does not restart in the morning.
//
// Closed with "Più tardi" (or by tapping outside), it stays closed for the
// rest of the day: the workout is still on the Home page, to start at the gym.
// "Salta oggi" marks today's workouts as skipped, "Rimanda a domani" moves
// them to tomorrow.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, Clock, Play, RotateCcw } from 'lucide-react';
import { api } from '../../config/api.js';
import { useLingua } from '../../hooks/useLingua.js';
import { nomeGruppo } from '../../utils/formattatori.js';
import { promemoriaDaMostrare, rimandaPromemoria } from '../../utils/promemoriaRimandato.js';

// After how long in the background coming back counts as a new opening
const RIAPERTURA_MS = 30 * 60 * 1000;
// Hours shown in the crowd strip
const PRIMA_ORA = 6;
const ULTIMA_ORA = 23;

const hh = (ora) => `${String(ora).padStart(2, '0')}:00`;

// How crowded the gym is, as the translation keys of the three levels
// (not busy, moderately busy, very busy) for each way of introducing it
const AFFOLLAMENTO = {
  adesso: [
    'promemoriaAllenamento.affollamento.adessoPoca',
    'promemoriaAllenamento.affollamento.adessoMedia',
    'promemoriaAllenamento.affollamento.adessoMolta'
  ],
  abituale: [
    'promemoriaAllenamento.affollamento.abitualePoca',
    'promemoriaAllenamento.affollamento.abitualeMedia',
    'promemoriaAllenamento.affollamento.abitualeMolta'
  ],
  consigliato: [
    'promemoriaAllenamento.affollamento.consigliatoPoca',
    'promemoriaAllenamento.affollamento.consigliatoMedia',
    'promemoriaAllenamento.affollamento.consigliatoMolta'
  ]
};
const chiaveAffollamento = (tipo, livello) =>
  AFFOLLAMENTO[tipo][livello <= 30 ? 0 : livello <= 60 ? 1 : 2];

/**
 * @param {object} p
 * @param {boolean} p.inAttesa - true while it is not the moment to show up
 *   (full-screen workout in progress, "what's new" stories open)
 */
export default function PromemoriaAllenamento({ inAttesa }) {
  const { t } = useLingua();
  const naviga = useNavigate();
  // "Armed" when the app opens: at the first free moment it asks the server
  // what is planned today, then disarms, whether there is something to show or not
  const [armato, setArmato] = useState(true);
  const [dati, setDati] = useState(null);
  // 'domani' or 'salta' while that change is being saved
  const [salvando, setSalvando] = useState(null);
  const [errore, setErrore] = useState('');
  const nascostoDa = useRef(null);
  const tastoPrincipale = useRef(null);

  useEffect(() => {
    const cambioVisibilita = () => {
      if (document.visibilityState === 'hidden') {
        nascostoDa.current = Date.now();
      } else if (nascostoDa.current && Date.now() - nascostoDa.current >= RIAPERTURA_MS) {
        nascostoDa.current = null;
        setArmato(true);
      }
    };
    document.addEventListener('visibilitychange', cambioVisibilita);
    return () => document.removeEventListener('visibilitychange', cambioVisibilita);
  }, []);

  useEffect(() => {
    if (!armato || inAttesa) return;
    let annullato = false;
    api.get('/pianificazione/oggi')
      .then(r => {
        if (annullato) return;
        setArmato(false);
        if (promemoriaDaMostrare(r.dati)) { setErrore(''); setDati(r.dati); }
      })
      .catch(() => { if (!annullato) setArmato(false); });
    return () => { annullato = true; };
  }, [armato, inAttesa]);

  const aperto = Boolean(dati) && !inAttesa;
  // However it is closed, it does not come back today
  const chiudi = () => { rimandaPromemoria(dati); setDati(null); };

  useEffect(() => {
    if (!aperto) return;
    tastoPrincipale.current?.focus();
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      rimandaPromemoria(dati);
      setDati(null);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aperto, dati]);

  const principale = dati?.allenamenti[0];
  const altri = dati?.allenamenti.slice(1) ?? [];
  const inCorso = principale?.sessioneInCorso;

  const inizia = () => {
    chiudi();
    // "Allenati ora" opens the plan ready to start; a session already started
    // today is resumed instead of started over
    naviga(inCorso ? `/allenamento/${inCorso}` : `/allenamento?scheda=${principale.scheda.id}`);
  };

  /** Changes all of today's workouts in the calendar, then closes */
  const cambiaGiornata = async (azione, modifica, messaggioErrore) => {
    try {
      setSalvando(azione);
      setErrore('');
      await Promise.all(dati.allenamenti.map(a => api.patch(`/pianificazione/${a.id}`, modifica)));
      chiudi();
    } catch (err) {
      setErrore(err?.message || messaggioErrore);
    } finally {
      setSalvando(null);
    }
  };
  const rimandaADomani = () => cambiaGiornata('domani', { rimandaGiorni: 1 }, t('promemoriaAllenamento.errori.spostamento'));
  const saltaOggi = () => cambiaGiornata('salta', { stato: 'SALTATO' }, t('promemoriaAllenamento.errori.salto'));

  return (
    <AnimatePresence>
      {aperto && principale && (
        <motion.div
          key="promemoria"
          className="fixed inset-0 z-[90] flex items-end md:items-center justify-center md:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={chiudi}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="promemoria-titolo"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="w-full md:max-w-md rounded-t-[24px] md:rounded-[24px] border border-[var(--vetro-bordo)] shadow-[var(--ombra-modale)] px-5 pt-5 md:p-6"
            style={{ background: 'var(--bg-secondario, #0c0c14)', paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          >
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
              <CalendarClock size={16} />
              {inCorso ? t('promemoriaAllenamento.inCorso') : t('promemoriaAllenamento.inProgramma')}
            </p>

            <h2 id="promemoria-titolo" className="text-xl font-bold mt-2 leading-snug">{principale.scheda.titolo}</h2>

            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
              {principale.gruppi.map(g => (
                <span key={g} className="text-xs px-2.5 py-1 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">{nomeGruppo(g)}</span>
              ))}
              <span className="text-xs text-[var(--testo-terziario)] ml-1">
                {t('comune.esercizi', { count: principale.esercizi })}
                {principale.ultimaVolta && ` · ${t('promemoriaAllenamento.ultimaVolta', { minuti: principale.ultimaVolta.durataMinuti })}`}
              </span>
            </div>

            {altri.length > 0 && (
              <p className="text-xs text-[var(--testo-secondario)] mt-3">
                {t('promemoriaAllenamento.altriOggi', { titoli: altri.map(a => a.scheda.titolo).join(', ') })}
              </p>
            )}

            {!inCorso && dati.orario && <QuandoAndare orario={dati.orario} />}

            {errore && <p role="alert" className="text-sm text-[var(--pericolo)] mt-4">{errore}</p>}

            <div className="flex flex-col gap-2.5 mt-6">
              <button ref={tastoPrincipale} type="button" onClick={inizia} className="btn-primario w-full">
                {inCorso ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
                {inCorso ? t('promemoriaAllenamento.riprendi') : t('promemoriaAllenamento.iniziaScheda')}
              </button>
              <div className="flex gap-2.5">
                <button type="button" onClick={chiudi} className="btn-secondario flex-1 !px-3">
                  {t('promemoriaAllenamento.piuTardi')}
                </button>
                {!inCorso && (
                  <button type="button" onClick={saltaOggi} disabled={Boolean(salvando)} className="btn-secondario flex-1 !px-3 disabled:opacity-50">
                    {salvando === 'salta' ? t('promemoriaAllenamento.salto') : t('promemoriaAllenamento.saltaOggi')}
                  </button>
                )}
              </div>
              {!inCorso && (
                <button type="button" onClick={rimandaADomani} disabled={Boolean(salvando)}
                        className="self-center py-1.5 px-3 text-sm font-medium text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] disabled:opacity-50">
                  {salvando === 'domani' ? t('promemoriaAllenamento.sposto') : t('promemoriaAllenamento.rimandaADomani')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The suggested hour, with the day's crowd levels to show why. */
function QuandoAndare({ orario }) {
  const { t } = useLingua();
  const { consigliato, adesso, fascia, abitudine, ore } = orario;
  const oraAttuale = adesso?.ora ?? null;
  const eAdesso = consigliato && consigliato.ora === oraAttuale;
  // If right now is clearly quieter than the suggested hour, whoever is
  // already at the gym should know
  const adessoMeglio = consigliato && adesso && !eAdesso && adesso.livello < consigliato.livello - 5;
  const nellaFascia = consigliato && abitudine && consigliato.ora >= fascia.da && consigliato.ora <= fascia.a;

  const striscia = ore.filter(o => o.ora >= PRIMA_ORA && o.ora <= ULTIMA_ORA);
  const massimo = Math.max(1, ...striscia.map(o => o.livello));

  let titolo, dettaglio;
  if (eAdesso) {
    // The best of the hours left, not necessarily empty: the detail says how
    // crowded it really is
    titolo = t('promemoriaAllenamento.quando.adessoMigliore');
    dettaglio = t(chiaveAffollamento(adesso.live ? 'adesso' : 'abituale', adesso.livello), { livello: adesso.livello });
  } else if (consigliato) {
    titolo = t('promemoriaAllenamento.quando.vaiVerso', { ora: hh(consigliato.ora) });
    dettaglio = t(chiaveAffollamento('consigliato', consigliato.livello), { livello: consigliato.livello });
  } else if (adesso) {
    titolo = t('promemoriaAllenamento.quando.adesso');
    dettaglio = t(chiaveAffollamento(adesso.live ? 'adesso' : 'abituale', adesso.livello), { livello: adesso.livello });
  } else {
    return null;
  }

  return (
    <div className="mt-5 rounded-[var(--raggio-lg)] border border-[var(--bordo-light)] bg-[var(--bg-terziario)] p-4">
      <div className="flex items-start gap-3">
        <Clock size={20} className="text-[var(--accent)] mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold">{titolo}</p>
          <p className="text-sm text-[var(--testo-secondario)]">{dettaglio}</p>
          {nellaFascia && !eAdesso && (
            <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
              {t('promemoriaAllenamento.quando.nellaFascia', { da: fascia.da, a: fascia.a })}
            </p>
          )}
        </div>
      </div>

      {striscia.length > 0 && (
        <div className="mt-4" role="img"
             aria-label={consigliato
               ? t('promemoriaAllenamento.quando.strisciaAriaConsigliata', { da: PRIMA_ORA, a: ULTIMA_ORA, ora: hh(consigliato.ora) })
               : t('promemoriaAllenamento.quando.strisciaAria', { da: PRIMA_ORA, a: ULTIMA_ORA })}>
          <div className="flex items-end gap-[3px] h-12">
            {striscia.map(o => {
              const passata = oraAttuale != null && o.ora < oraAttuale;
              const scelta = consigliato?.ora === o.ora;
              return (
                <div key={o.ora} title={`${hh(o.ora)} · ${o.livello}%`} className="flex-1 h-full flex items-end">
                  <div
                    className="w-full rounded-[3px]"
                    style={{
                      height: `${Math.max(8, Math.round((o.livello / massimo) * 100))}%`,
                      background: scelta ? 'var(--accent)' : passata ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.22)',
                      boxShadow: o.ora === oraAttuale && !scelta ? '0 0 0 1.5px var(--testo-secondario)' : 'none'
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px] mt-1.5 text-[10px] text-[var(--testo-terziario)]">
            {striscia.map(o => (
              <div key={o.ora} className="flex-1 text-center">
                {o.ora === oraAttuale ? t('promemoriaAllenamento.quando.ora') : o.ora % 6 === 0 ? String(o.ora).padStart(2, '0') : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {adessoMeglio && (
        <p className="text-xs text-[var(--testo-secondario)] mt-3">
          {t('promemoriaAllenamento.quando.adessoMeno', { livello: adesso.livello })}
        </p>
      )}
    </div>
  );
}
