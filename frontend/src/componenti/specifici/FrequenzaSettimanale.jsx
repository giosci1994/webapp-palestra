// ============================================
// GymMaster — Weekly frequency
// Workouts done and scheduled, week by week
// ============================================
//
// Takes the place of "Durata sessioni" (session duration): the average
// duration is in the indicators, while here you see whether you train
// consistently and stick to the schedule set in the Pianificazione page.

import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';

const numero = (n) => n.toLocaleString(localeCorrente(), { maximumFractionDigits: 1 });
const dataBreve = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeCorrente(), { day: 'numeric', month: 'short' });

/** Horizontal dash at the height of the scheduled workouts. */
function Tacca({ cx, cy, payload }) {
  if (!payload?.programmati) return null;
  return <line x1={cx - 12} x2={cx + 12} y1={cy} y2={cy} stroke="var(--testo-secondario)" strokeWidth={2} strokeLinecap="round" />;
}

function Suggerimento({ active, payload }) {
  const { t } = useLingua();
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  const fatti = t('frequenzaSettimanale.fatti', { count: s.fatti, numero: numero(s.fatti) });
  return (
    <div className="glass-card px-3 py-2 text-xs" style={{ border: '1px solid var(--bordo)' }}>
      <p className="font-semibold mb-1 text-[var(--testo-primario)]">{s.corrente ? t('frequenzaSettimanale.questaSettimana') : t('frequenzaSettimanale.settimanaDal', { data: dataBreve(s.settimana) })}</p>
      <p className="text-[var(--testo-secondario)]">
        {s.programmati > 0
          ? t('frequenzaSettimanale.fattiSuProgrammati', {
            fatti,
            programmati: t('frequenzaSettimanale.programmati', { count: s.programmati, numero: numero(s.programmati) })
          })
          : fatti}
      </p>
    </div>
  );
}

/**
 * @param {object} p
 * @param {{settimana: string, fatti: number, programmati: number}[]} p.settimane - oldest first, 12 entries
 */
export default function FrequenzaSettimanale({ settimane = [] }) {
  const { t } = useLingua();
  const dati = settimane.map((s, i) => ({ ...s, corrente: i === settimane.length - 1 }));
  const attuale = dati[dati.length - 1];
  const concluse = dati.slice(0, -1);   // the current week would skew the average
  const media = concluse.length ? concluse.reduce((t, s) => t + s.fatti, 0) / concluse.length : 0;
  const conPiano = dati.some(s => s.programmati > 0);
  const massimo = Math.max(3, ...dati.map(s => Math.max(s.fatti, s.programmati)));

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">{t('frequenzaSettimanale.titolo')}</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1">{t('frequenzaSettimanale.descrizione')}</p>

      {dati.length === 0 ? (
        <p className="text-sm text-[var(--testo-terziario)] text-center py-8">{t('frequenzaSettimanale.nessunDato')}</p>
      ) : (
        <>
          {/* Summary: what you need to know without reading the chart */}
          <div className="flex gap-6 mt-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t('frequenzaSettimanale.questaSettimana')}</p>
              <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">
                {numero(attuale.fatti)}
                {attuale.programmati > 0 && <span className="text-sm font-normal text-[var(--testo-secondario)]"> {t('frequenzaSettimanale.suProgrammati', { count: attuale.programmati, numero: numero(attuale.programmati) })}</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t('frequenzaSettimanale.mediaSettimana')}</p>
              <p className="text-lg font-semibold text-[var(--testo-primario)] leading-tight">{numero(Math.round(media * 10) / 10)}</p>
            </div>
          </div>

          {/* Legend: two different marks, not relying on color alone */}
          {conPiano && (
            <div className="flex gap-4 text-[11px] text-[var(--testo-secondario)] mb-1">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />{t('frequenzaSettimanale.legendaFatti')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-0.5 rounded-full bg-[var(--testo-secondario)]" />{t('frequenzaSettimanale.legendaProgrammati')}</span>
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
                // One label every three weeks, and always the current one
                tickFormatter={(v, i) => (i === dati.length - 1 ? t('frequenzaSettimanale.ora') : i % 3 === 2 ? dataBreve(v) : '')}
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
