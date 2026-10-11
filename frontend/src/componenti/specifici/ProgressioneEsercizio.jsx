// ============================================
// GymMaster — Progress of an exercise
// The load over time, with the estimated max and the real maxes
// ============================================
//
// It opens from the exercise's card in the Corpo (body) section and only then
// loads the data. The estimated max makes days with different reps comparable
// (60 kg x 3 and 50 kg x 10): it is dashed because it is an estimate.

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../config/api.js';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';
import { localeCorrente } from '../../i18n/index.js';
import { formattaPeso } from '../../utils/formattatori.js';

const COLORI = {
  carico: 'var(--accent)',
  stimato: '#c9bdfe',               // light step of the same hue
  massimale: 'var(--avviso)',       // like the trophy next to the max
  superficie: '#0a0a14',            // ring around the dots, on the card background
};

const dataBreve = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeCorrente(), { day: 'numeric', month: 'short' });

function Suggerimento({ active, payload, modo }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const componenti = { b: <strong className="text-[var(--testo-primario)]" /> };
  return (
    <div className="glass-card px-3 py-2 text-xs" style={{ border: '1px solid var(--bordo)' }}>
      <p className="font-semibold mb-1 text-[var(--testo-primario)]">{dataBreve(p.data)}</p>
      {modo === 'peso' && <p className="text-[var(--testo-secondario)]"><Testo t="progressioneEsercizio.serieMigliore" valori={{ valore: `${formattaPeso(p.peso)} kg × ${p.rip}` }} componenti={componenti} /></p>}
      {modo === 'peso' && p.stimato != null && <p className="text-[var(--testo-secondario)]"><Testo t="progressioneEsercizio.massimaleStimatoValore" valori={{ valore: `≈ ${formattaPeso(p.stimato)} kg` }} componenti={componenti} /></p>}
      {modo === 'peso' && p.massimale != null && <p className="text-[var(--testo-secondario)]"><Testo t="progressioneEsercizio.massimaleValore" valori={{ valore: `${formattaPeso(p.massimale)} kg` }} componenti={componenti} /></p>}
      {modo === 'rip' && <p className="text-[var(--testo-secondario)]"><Testo t="progressioneEsercizio.ripetizioni" valori={{ valore: p.rip }} componenti={componenti} /></p>}
      {modo === 'minuti' && <p className="text-[var(--testo-secondario)]"><Testo t="progressioneEsercizio.durata" valori={{ valore: `${p.minuti} min` }} componenti={componenti} /></p>}
    </div>
  );
}

function Chiave({ colore, tratteggio, punto, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {punto
        ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: colore }} />
        : <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke={colore} strokeWidth="2" strokeDasharray={tratteggio ? '3 2' : undefined} /></svg>}
      {children}
    </span>
  );
}

export default function ProgressioneEsercizio({ esercizioId }) {
  const { t } = useLingua();
  const [punti, setPunti] = useState(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let annullato = false;
    api.get(`/statistiche/progressione/${esercizioId}`)
      .then(r => { if (!annullato) setPunti(r.dati || []); })
      .catch(() => { if (!annullato) setErrore(true); });
    return () => { annullato = true; };
  }, [esercizioId]);

  if (errore) return <p className="text-xs text-[var(--testo-terziario)] py-3">{t('progressioneEsercizio.erroreCaricamento')}</p>;
  if (!punti) return <p className="text-xs text-[var(--testo-terziario)] py-3">{t('progressioneEsercizio.caricamento')}</p>;
  if (punti.length < 2) {
    return <p className="text-xs text-[var(--testo-terziario)] py-3">{t('progressioneEsercizio.serveAltroAllenamento')}</p>;
  }

  // What to measure: the weight if there is one, otherwise the minutes (cardio) or the reps (bodyweight)
  const modo = punti.some(p => p.peso > 0) ? 'peso' : punti.some(p => p.minuti > 0) ? 'minuti' : 'rip';
  const campo = modo === 'peso' ? 'peso' : modo;
  const conStima = modo === 'peso' && punti.some(p => p.stimato != null);
  const conMassimali = modo === 'peso' && punti.some(p => p.massimale != null);
  const unita = modo === 'peso' ? 'kg' : modo === 'minuti' ? 'min' : t('progressioneEsercizio.unitaRip');

  const anello = (colore) => ({ r: 4, fill: colore, stroke: COLORI.superficie, strokeWidth: 2 });

  return (
    <div className="pt-2">
      {/* Legend: with more than one series, identity does not rely on color alone */}
      {(conStima || conMassimali) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--testo-secondario)] mb-2">
          <Chiave colore={COLORI.carico}>{t('progressioneEsercizio.carico')}</Chiave>
          {conStima && <Chiave colore={COLORI.stimato} tratteggio>{t('progressioneEsercizio.massimaleStimato')}</Chiave>}
          {conMassimali && <Chiave colore={COLORI.massimale} punto>{t('progressioneEsercizio.massimale')}</Chiave>}
        </div>
      )}
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={punti} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="data" tickFormatter={dataBreve} tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }}
                 axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }} axisLine={false} tickLine={false}
                 width={52} domain={['auto', 'auto']} allowDecimals={false} unit={` ${unita}`} />
          <Tooltip content={<Suggerimento modo={modo} />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
          <Line type="linear" dataKey={campo} name={t('progressioneEsercizio.carico')} stroke={COLORI.carico} strokeWidth={2}
                dot={anello(COLORI.carico)} activeDot={{ ...anello(COLORI.carico), r: 5 }} isAnimationActive={false} />
          {conStima && (
            <Line type="linear" dataKey="stimato" name={t('progressioneEsercizio.massimaleStimato')} stroke={COLORI.stimato} strokeWidth={2}
                  strokeDasharray="4 3" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          )}
          {conMassimali && (
            <Line dataKey="massimale" name={t('progressioneEsercizio.massimale')} stroke="none" dot={{ ...anello(COLORI.massimale), r: 5 }}
                  activeDot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
