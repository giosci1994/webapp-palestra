// ============================================
// GymMaster — Period indicators
// Row at the top of the statistics: the value for the chosen period, the
// change from the previous period and the trend
// ============================================
//
// Replaces the six boxes with the all-time totals: they did not follow the
// chosen period and did not say whether you are improving.

import { ArrowUp, ArrowDown } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';
import { formattaNumero } from '../../utils/formattatori.js';

const GIORNO = 86400000;

// Per period: translation keys for the title and for "compared with the previous ones"
const NOMI_PERIODO = {
  7: ['indicatoriPeriodo.periodo.titolo7', 'indicatoriPeriodo.periodo.confronto7'],
  30: ['indicatoriPeriodo.periodo.titolo30', 'indicatoriPeriodo.periodo.confronto30'],
  90: ['indicatoriPeriodo.periodo.titolo90', 'indicatoriPeriodo.periodo.confronto90'],
  365: ['indicatoriPeriodo.periodo.titolo365', 'indicatoriPeriodo.periodo.confronto365']
};

function dataBreve(ms) {
  return new Date(ms).toLocaleDateString(localeCorrente(), { day: 'numeric', month: 'short' });
}

/** Readable volume: kg up to 10,000, then tonnes. */
function formattaVolume(kg) {
  if (kg >= 10000) return `${(kg / 1000).toLocaleString(localeCorrente(), { maximumFractionDigits: 1 })} t`;
  return `${formattaNumero(Math.round(kg))} kg`;
}

/**
 * Splits previous period + current period into equal buckets, half each:
 * the mini chart shows exactly the two periods that the change compares,
 * and the totals come from the same buckets.
 */
function dividiInSecchi(giorni, periodo, adesso) {
  const n = periodo === 7 ? 14 : 12;
  const fine = adesso;
  const inizio = fine - 2 * periodo * GIORNO;
  const ampiezza = (fine - inizio) / n;
  const secchi = Array.from({ length: n }, (_, i) => ({
    da: inizio + i * ampiezza,
    a: inizio + (i + 1) * ampiezza - 1,
    attuale: i >= n / 2,
    sessioni: 0, volume: 0, durata: 0,
  }));
  for (const g of giorni) {
    // Dates arrive as a UTC day: noon avoids ambiguity at the edges
    const i = Math.floor((Date.parse(`${g.data}T12:00:00Z`) - inizio) / ampiezza);
    if (i < 0 || i >= n) continue;
    secchi[i].sessioni += g.sessioni;
    secchi[i].volume += g.volume;
    secchi[i].durata += g.durata;
  }
  return secchi;
}

function somma(secchi, campo, attuale) {
  return secchi.filter(s => s.attuale === attuale).reduce((t, s) => t + s[campo], 0);
}

/** Arrow and value of the change; `buona` says whether going up is good (null: neutral). */
function Variazione({ differenza, testo, buona = true }) {
  const { t } = useLingua();
  if (differenza == null) return null;
  if (differenza === 0) return <span className="text-xs text-[var(--testo-terziario)]">{t('indicatoriPeriodo.invariato')}</span>;
  const su = differenza > 0;
  const esito = buona == null ? null : su === buona;
  const colore = esito == null ? 'var(--testo-secondario)' : esito ? 'var(--successo)' : 'var(--pericolo)';
  const Icona = su ? ArrowUp : ArrowDown;
  return (
    <span className="text-xs font-semibold inline-flex items-center gap-0.5" style={{ color: colore }}>
      <Icona size={12} strokeWidth={2.5} aria-hidden="true" />
      {testo}
      <span className="sr-only"> {su ? t('indicatoriPeriodo.inPiu') : t('indicatoriPeriodo.inMeno')}</span>
    </span>
  );
}

/** Percentage change; from nothing a percentage makes no sense, so it says "from 0". */
function percentuale(attuale, precedente, t) {
  if (!attuale && !precedente) return { differenza: null };
  if (!precedente) return { differenza: attuale, testo: t('indicatoriPeriodo.daZero') };
  const p = Math.round(((attuale - precedente) / precedente) * 100);
  return { differenza: p, testo: `${Math.abs(p)}%` };
}

/** Mini bar chart: previous period dimmed, current period in the accent color. */
function MiniBarre({ secchi, valore, descrivi }) {
  const valori = secchi.map(valore);
  const max = Math.max(0, ...valori.filter(v => v != null));
  const L = 120, A = 28, spazio = 2;
  const larghezza = (L - spazio * (secchi.length - 1)) / secchi.length;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="w-full h-7 block" aria-hidden="true">
      {secchi.map((s, i) => {
        const v = valori[i];
        if (v == null) return null;                     // no data: no bar
        const h = v > 0 && max > 0 ? Math.max(2, (v / max) * A) : 1;   // zero stays a line
        return (
          <rect key={i} x={i * (larghezza + spazio)} y={A - h} width={larghezza} height={h} rx="1"
                fill={s.attuale ? 'var(--accent)' : 'var(--testo-terziario)'} opacity={s.attuale ? 1 : 0.5}>
            <title>{`${dataBreve(s.da)}${s.a - s.da > 1.5 * GIORNO ? ` – ${dataBreve(s.a)}` : ''}: ${descrivi(v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Indicatore({ etichetta, valore, variazione, children }) {
  return (
    <div className="p-4 min-w-0 flex flex-col">
      <p className="text-xs text-[var(--testo-terziario)]">{etichetta}</p>
      <div className="flex items-baseline gap-2 flex-wrap mt-1">
        <p className="text-2xl font-semibold leading-none text-[var(--testo-primario)]">{valore}</p>
        {variazione}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * @param {object} p
 * @param {{data: string, sessioni: number, durata: number, volume: number}[]} p.giorni - two periods of daily data
 * @param {number} p.periodo - days in the chosen period
 * @param {number} p.adesso - instant when the data was loaded (ms)
 * @param {{settimaneDiFila?: number, ultimeSettimane?: boolean[]}} [p.riepilogo]
 */
export default function IndicatoriPeriodo({ giorni, periodo, adesso, riepilogo }) {
  const { t } = useLingua();
  const secchi = dividiInSecchi(giorni, periodo, adesso);
  const [chiaveTitolo, chiaveConfronto] = NOMI_PERIODO[periodo] || ['indicatoriPeriodo.periodo.titoloAltro', 'indicatoriPeriodo.periodo.confrontoAltro'];
  const titolo = t(chiaveTitolo, { giorni: periodo });
  const confronto = t(chiaveConfronto, { giorni: periodo });

  const sessioni = [somma(secchi, 'sessioni', false), somma(secchi, 'sessioni', true)];
  const volume = [somma(secchi, 'volume', false), somma(secchi, 'volume', true)];
  const durata = [somma(secchi, 'durata', false), somma(secchi, 'durata', true)];
  const media = sessioni.map((n, i) => (n ? Math.round(durata[i] / n) : null));

  const varVolume = percentuale(volume[1], volume[0], t);
  const settimane = riepilogo?.ultimeSettimane || [];
  const attive = settimane.filter(Boolean).length;

  return (
    <section className="glass-card overflow-hidden" aria-label={t('indicatoriPeriodo.ariaIndicatori')}>
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3 flex-wrap border-b border-[var(--bordo)]">
        <h2 className="text-sm font-semibold text-[var(--testo-primario)]">{titolo}</h2>
        <p className="text-xs text-[var(--testo-terziario)]">{confronto}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-[var(--bordo)] [&>*:nth-child(odd)]:border-r lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0 [&>*:nth-child(-n+2)]:border-b lg:[&>*]:border-b-0">
        <Indicatore
          etichetta={t('indicatoriPeriodo.allenamenti')}
          valore={sessioni[1]}
          variazione={<Variazione differenza={sessioni[1] || sessioni[0] ? sessioni[1] - sessioni[0] : null} testo={Math.abs(sessioni[1] - sessioni[0])} />}
        >
          <MiniBarre secchi={secchi} valore={s => s.sessioni} descrivi={v => t('indicatoriPeriodo.allenamentiN', { count: v })} />
        </Indicatore>

        <Indicatore
          etichetta={t('indicatoriPeriodo.volume')}
          valore={formattaVolume(volume[1])}
          variazione={<Variazione differenza={varVolume.differenza} testo={varVolume.testo} />}
        >
          <MiniBarre secchi={secchi} valore={s => s.volume} descrivi={v => formattaVolume(v)} />
        </Indicatore>

        <Indicatore
          etichetta={t('indicatoriPeriodo.durataMedia')}
          valore={media[1] != null ? `${media[1]} min` : '—'}
          // Lasting longer is neither good nor bad: neutral change
          variazione={media[1] != null && media[0] != null
            ? <Variazione differenza={media[1] - media[0]} testo={`${Math.abs(media[1] - media[0])} min`} buona={null} />
            : null}
        >
          <MiniBarre secchi={secchi} valore={s => (s.sessioni ? Math.round(s.durata / s.sessioni) : null)} descrivi={v => t('indicatoriPeriodo.minutiDiMedia', { valore: v })} />
        </Indicatore>

        <Indicatore
          etichetta={t('indicatoriPeriodo.settimaneDiFila')}
          valore={riepilogo?.settimaneDiFila ?? '—'}
        >
          <div className="flex gap-[3px] h-7 items-end" role="img" aria-label={t('indicatoriPeriodo.ariaUltimeSettimane', { attive })}>
            {settimane.map((attiva, i) => (
              <span
                key={i}
                title={i === settimane.length - 1 ? t('indicatoriPeriodo.questaSettimana') : t('indicatoriPeriodo.settimaneFa', { count: settimane.length - 1 - i })}
                className="flex-1 h-3 rounded-[2px]"
                style={{ background: attiva ? 'var(--accent)' : 'var(--testo-terziario)', opacity: attiva ? 1 : 0.3 }}
              />
            ))}
          </div>
        </Indicatore>
      </div>
    </section>
  );
}
