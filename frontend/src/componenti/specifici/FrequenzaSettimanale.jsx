// ============================================
// GymMaster — Frequenza settimanale
// Allenamenti fatti e programmati, settimana per settimana
// ============================================
//
// Prende il posto di "Durata sessioni": la durata media sta negli indicatori,
// mentre qui si vede se ti alleni con costanza e se rispetti il programma
// messo in Pianificazione.

import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const numero = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
const dataBreve = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const plurale = (n, uno, molti) => `${numero(n)} ${n === 1 ? uno : molti}`;

/** Trattino orizzontale all'altezza degli allenamenti programmati. */
function Tacca({ cx, cy, payload }) {
  if (!payload?.programmati) return null;
  return <line x1={cx - 12} x2={cx + 12} y1={cy} y2={cy} stroke="var(--testo-secondario)" strokeWidth={2} strokeLinecap="round" />;
}

function Suggerimento({ active, payload }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="glass-card px-3 py-2 text-xs" style={{ border: '1px solid var(--bordo)' }}>
      <p className="font-semibold mb-1 text-[var(--testo-primario)]">{s.corrente ? 'Questa settimana' : `Settimana dal ${dataBreve(s.settimana)}`}</p>
      <p className="text-[var(--testo-secondario)]">
        {plurale(s.fatti, 'allenamento fatto', 'allenamenti fatti')}
        {s.programmati > 0 && <> su {numero(s.programmati)} programmat{s.programmati === 1 ? 'o' : 'i'}</>}
      </p>
    </div>
  );
}

/**
 * @param {object} p
 * @param {{settimana: string, fatti: number, programmati: number}[]} p.settimane - dalla piu' vecchia, 12 voci
 */
export default function FrequenzaSettimanale({ settimane = [] }) {
  const dati = settimane.map((s, i) => ({ ...s, corrente: i === settimane.length - 1 }));
  const attuale = dati[dati.length - 1];
  const concluse = dati.slice(0, -1);   // la settimana in corso falserebbe la media
  const media = concluse.length ? concluse.reduce((t, s) => t + s.fatti, 0) / concluse.length : 0;
  const conPiano = dati.some(s => s.programmati > 0);
  const massimo = Math.max(3, ...dati.map(s => Math.max(s.fatti, s.programmati)));

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">Frequenza settimanale</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1">Allenamenti per settimana nelle ultime 12.</p>

      {dati.length === 0 ? (
        <p className="text-sm text-[var(--testo-terziario)] text-center py-8">Nessun dato disponibile.</p>
      ) : (
        <>
          {/* Sintesi: quello che serve sapere senza leggere il grafico */}
          <div className="flex gap-6 mt-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Questa settimana</p>
              <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">
                {numero(attuale.fatti)}
                {attuale.programmati > 0 && <span className="text-sm font-normal text-[var(--testo-secondario)]"> su {numero(attuale.programmati)} programmati</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Media a settimana</p>
              <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(Math.round(media * 10) / 10)}</p>
            </div>
          </div>

          {/* Legenda: due segni diversi, non affidati al solo colore */}
          {conPiano && (
            <div className="flex gap-4 text-[11px] text-[var(--testo-secondario)] mb-1">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />Fatti</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-0.5 rounded-full bg-[var(--testo-secondario)]" />Programmati</span>
            </div>
          )}

          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={dati} margin={{ top: 8, right: 4, bottom: 0, left: -28 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="settimana"
                interval={0}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }}
                // Un'etichetta ogni tre settimane, e sempre quella in corso
                tickFormatter={(v, i) => (i === dati.length - 1 ? 'Ora' : i % 3 === 2 ? dataBreve(v) : '')}
              />
              <YAxis allowDecimals={false} domain={[0, massimo]} tickLine={false} axisLine={false}
                     tick={{ fontSize: 10, fill: 'var(--testo-terziario)' }} />
              <Tooltip content={<Suggerimento />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="fatti" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              {conPiano && <Scatter dataKey="programmati" shape={<Tacca />} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
