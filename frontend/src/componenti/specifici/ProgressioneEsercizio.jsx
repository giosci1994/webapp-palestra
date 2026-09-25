// ============================================
// GymMaster — Andamento di un esercizio
// Il carico nel tempo, con massimale stimato e massimali veri
// ============================================
//
// Si apre dalla scheda dell'esercizio nella sezione Corpo e carica i dati solo
// allora. Il massimale stimato rende confrontabili giornate con ripetizioni
// diverse (60 kg x 3 e 50 kg x 10): e' tratteggiato perche' e' una stima.

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../config/api.js';
import { formattaPeso } from '../../utils/formattatori.js';

const COLORI = {
  carico: 'var(--accent)',
  stimato: '#c9bdfe',               // gradino chiaro della stessa tinta
  massimale: 'var(--avviso)',       // come il trofeo accanto al massimale
  superficie: '#0a0a14',            // anello attorno ai punti, sul fondo delle card
};

const dataBreve = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

function Suggerimento({ active, payload, modo }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass-card px-3 py-2 text-xs" style={{ border: '1px solid var(--bordo)' }}>
      <p className="font-semibold mb-1 text-[var(--testo-primario)]">{dataBreve(p.data)}</p>
      {modo === 'peso' && <p className="text-[var(--testo-secondario)]">Serie migliore: <strong className="text-[var(--testo-primario)]">{formattaPeso(p.peso)} kg × {p.rip}</strong></p>}
      {modo === 'peso' && p.stimato != null && <p className="text-[var(--testo-secondario)]">Massimale stimato: <strong className="text-[var(--testo-primario)]">≈ {formattaPeso(p.stimato)} kg</strong></p>}
      {modo === 'peso' && p.massimale != null && <p className="text-[var(--testo-secondario)]">🏆 Massimale: <strong className="text-[var(--testo-primario)]">{formattaPeso(p.massimale)} kg</strong></p>}
      {modo === 'rip' && <p className="text-[var(--testo-secondario)]">Ripetizioni: <strong className="text-[var(--testo-primario)]">{p.rip}</strong></p>}
      {modo === 'minuti' && <p className="text-[var(--testo-secondario)]">Durata: <strong className="text-[var(--testo-primario)]">{p.minuti} min</strong></p>}
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
  const [punti, setPunti] = useState(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let annullato = false;
    api.get(`/statistiche/progressione/${esercizioId}`)
      .then(r => { if (!annullato) setPunti(r.dati || []); })
      .catch(() => { if (!annullato) setErrore(true); });
    return () => { annullato = true; };
  }, [esercizioId]);

  if (errore) return <p className="text-xs text-[var(--testo-terziario)] py-3">Impossibile caricare l'andamento.</p>;
  if (!punti) return <p className="text-xs text-[var(--testo-terziario)] py-3">Carico l'andamento…</p>;
  if (punti.length < 2) {
    return <p className="text-xs text-[var(--testo-terziario)] py-3">Serve almeno un altro allenamento con questo esercizio per vedere l'andamento.</p>;
  }

  // Cosa misurare: il peso se c'e', altrimenti i minuti (cardio) o le ripetizioni (corpo libero)
  const modo = punti.some(p => p.peso > 0) ? 'peso' : punti.some(p => p.minuti > 0) ? 'minuti' : 'rip';
  const campo = modo === 'peso' ? 'peso' : modo;
  const conStima = modo === 'peso' && punti.some(p => p.stimato != null);
  const conMassimali = modo === 'peso' && punti.some(p => p.massimale != null);
  const unita = modo === 'peso' ? 'kg' : modo === 'minuti' ? 'min' : 'rip.';

  const anello = (colore) => ({ r: 4, fill: colore, stroke: COLORI.superficie, strokeWidth: 2 });

  return (
    <div className="pt-2">
      {/* Legenda: con piu' serie non si affida l'identita' al solo colore */}
      {(conStima || conMassimali) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--testo-secondario)] mb-2">
          <Chiave colore={COLORI.carico}>Carico</Chiave>
          {conStima && <Chiave colore={COLORI.stimato} tratteggio>Massimale stimato</Chiave>}
          {conMassimali && <Chiave colore={COLORI.massimale} punto>Massimale</Chiave>}
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
          <Line type="linear" dataKey={campo} name="Carico" stroke={COLORI.carico} strokeWidth={2}
                dot={anello(COLORI.carico)} activeDot={{ ...anello(COLORI.carico), r: 5 }} isAnimationActive={false} />
          {conStima && (
            <Line type="linear" dataKey="stimato" name="Massimale stimato" stroke={COLORI.stimato} strokeWidth={2}
                  strokeDasharray="4 3" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          )}
          {conMassimali && (
            <Line dataKey="massimale" name="Massimale" stroke="none" dot={{ ...anello(COLORI.massimale), r: 5 }}
                  activeDot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
