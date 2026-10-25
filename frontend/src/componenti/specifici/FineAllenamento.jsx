// ============================================
// GymMaster — "Termina": what time did you finish?
// ============================================
//
// Before closing the workout the app asks when it ended (utils/fineAllenamento.js):
// now, or the last set if it was long ago, as when the app was closed
// without "Termina" and the workout is finished hours later.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLingua } from '../../hooks/useLingua.js';
import { aStringaOra, formattaDurata } from '../../utils/formattatori.js';
import {
  ultimaSerieIl, fineProposta, fineDaOra, erroreFine, PAUSA_DOPO_ULTIMA_SERIE_MINUTI, DURATA_MAX_MINUTI
} from '../../utils/fineAllenamento.js';

/** Now, read when "Termina" is confirmed, not while rendering */
const adesso = () => Date.now();
const MINUTO = 60 * 1000;

/** The message for each problem with the end (erroreFine) */
const ERRORI = {
  nonValida: 'fineAllenamento.errori.nonValida',
  prima: 'fineAllenamento.errori.prima',
  futuro: 'fineAllenamento.errori.futuro',
  troppoLunga: 'fineAllenamento.errori.troppoLunga'
};

/**
 * @param {{ inizio: number, serie: object[], inviando?: boolean, onTermina: (fine: number) => void, onAnnulla: () => void }} props
 *   inizio: start of the workout in milliseconds; serie: the sets done (with registrataIl)
 */
export default function FineAllenamento({ inizio, serie, inviando = false, onTermina, onAnnulla }) {
  const { t } = useLingua();
  // Everything is measured from the moment the question opens
  const [apertoIl] = useState(adesso);
  const [ultimaSerie] = useState(() => ultimaSerieIl(serie));
  const [proposta] = useState(() => fineProposta({ inizio, ultimaSerie, adesso: apertoIl }));
  const [ora, setOra] = useState(() => aStringaOra(new Date(proposta.fine)));
  // The proposal and the quick choices are exact instants (the last set to
  // the second); only a time typed by hand is to the minute
  const [esatto, setEsatto] = useState(proposta.fine);
  const [errore, setErrore] = useState('');

  const orario = ms => aStringaOra(new Date(ms));
  const fine = esatto ?? fineDaOra(ora, inizio, apertoIl);
  const problema = erroreFine(fine, inizio, apertoIl);
  const testoErrore = codice => t(ERRORI[codice], { ora: orario(inizio), ore: DURATA_MAX_MINUTI / 60 });

  /** A quick choice: the instant itself */
  const scegli = istante => {
    setOra(orario(istante));
    setEsatto(istante);
    setErrore('');
  };
  /** A time typed in the field */
  const scrivi = valore => {
    setOra(valore);
    setEsatto(null);
    setErrore('');
  };

  const conferma = () => {
    const istante = adesso();
    const scelta = esatto ?? fineDaOra(ora, inizio, istante);
    const codice = erroreFine(scelta, inizio, istante);
    if (codice) {
      setErrore(testoErrore(codice));
      return;
    }
    onTermina(scelta);
  };

  // A quick choice for the last set only when it is not now
  const mostraUltimaSerie = ultimaSerie != null && ultimaSerie >= inizio && apertoIl - ultimaSerie >= MINUTO;
  const stileScelta = valore => `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
    ora === valore
      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
      : 'border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)]'
  }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !inviando && onAnnulla()}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        role="dialog" aria-modal="true" aria-labelledby="titolo-fine-allenamento"
        className="glass-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(24px + var(--safe-bottom))' }}
      >
        <div>
          <h3 id="titolo-fine-allenamento" className="font-bold text-lg">{t('fineAllenamento.titolo')}</h3>
          <p className="text-xs text-[var(--testo-terziario)] mt-0.5">{t('fineAllenamento.iniziato', { ora: orario(inizio) })}</p>
        </div>

        {proposta.dopoPausa && (
          <p className="text-sm p-3 rounded-[var(--raggio-md)] border border-[var(--avviso)]/40 bg-[var(--avviso-dim)]">
            {t('fineAllenamento.dopoPausa', { ora: orario(ultimaSerie), minuti: PAUSA_DOPO_ULTIMA_SERIE_MINUTI })}
          </p>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t('fineAllenamento.domanda')}</span>
          <input
            type="time" value={ora} onChange={e => scrivi(e.target.value)}
            className="campo-input text-center text-2xl font-bold tabular-nums"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => scegli(apertoIl)} className={stileScelta(orario(apertoIl))}>
            {t('fineAllenamento.adesso', { ora: orario(apertoIl) })}
          </button>
          {mostraUltimaSerie && (
            <button type="button" onClick={() => scegli(ultimaSerie)} className={stileScelta(orario(ultimaSerie))}>
              {t('fineAllenamento.ultimaSerie', { ora: orario(ultimaSerie) })}
            </button>
          )}
        </div>

        <p className={`text-sm ${problema ? 'text-[var(--pericolo)]' : 'text-[var(--testo-secondario)]'}`} role={problema ? 'alert' : undefined}>
          {errore || (problema
            ? testoErrore(problema)
            : t('fineAllenamento.durata', { durata: formattaDurata(Math.round((fine - inizio) / MINUTO)) }))}
        </p>

        <div className="flex gap-3">
          <button onClick={onAnnulla} disabled={inviando} className="flex-1 py-3 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium disabled:opacity-60">
            {t('fineAllenamento.continua')}
          </button>
          <button onClick={conferma} disabled={inviando || Boolean(problema)} className="flex-1 py-3 rounded-lg bg-[var(--pericolo)] text-white font-bold disabled:opacity-50">
            {inviando ? t('workoutLive.unAttimo') : t('fineAllenamento.termina')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
