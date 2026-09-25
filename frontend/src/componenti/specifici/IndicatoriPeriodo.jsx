// ============================================
// GymMaster — Indicatori del periodo
// Riga in cima alle statistiche: il valore del periodo scelto, la variazione
// rispetto al periodo precedente e l'andamento
// ============================================
//
// Sostituisce i sei riquadri con i totali di sempre: non seguivano il periodo
// scelto e non dicevano se stai migliorando.

import { ArrowUp, ArrowDown } from 'lucide-react';
import { formattaNumero } from '../../utils/formattatori.js';

const GIORNO = 86400000;

const NOMI_PERIODO = { 7: ['Ultimi 7 giorni', '7'], 30: ['Ultimi 30 giorni', '30'], 90: ['Ultimi 3 mesi', '3'], 365: ['Ultimi 12 mesi', '12'] };

function dataBreve(ms) {
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/** Volume leggibile: kg fino a 10.000, poi tonnellate. */
function formattaVolume(kg) {
  if (kg >= 10000) return `${(kg / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} t`;
  return `${formattaNumero(Math.round(kg))} kg`;
}

/**
 * Divide periodo precedente + periodo attuale in secchi uguali, meta' per
 * parte: il mini-grafico mostra esattamente i due periodi che la variazione
 * confronta, e i totali si ricavano dagli stessi secchi.
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
    // Le date arrivano come giorno UTC: mezzogiorno evita ambiguita' ai bordi
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

/** Freccia e valore della variazione; `buona` dice se salire e' un bene (null: indifferente). */
function Variazione({ differenza, testo, buona = true }) {
  if (differenza == null) return null;
  if (differenza === 0) return <span className="text-xs text-[var(--testo-terziario)]">invariato</span>;
  const su = differenza > 0;
  const esito = buona == null ? null : su === buona;
  const colore = esito == null ? 'var(--testo-secondario)' : esito ? 'var(--successo)' : 'var(--pericolo)';
  const Icona = su ? ArrowUp : ArrowDown;
  return (
    <span className="text-xs font-semibold inline-flex items-center gap-0.5" style={{ color: colore }}>
      <Icona size={12} strokeWidth={2.5} aria-hidden="true" />
      {testo}
      <span className="sr-only"> {su ? 'in più' : 'in meno'} rispetto al periodo precedente</span>
    </span>
  );
}

/** Variazione percentuale; dal nulla la percentuale non ha senso e si dice "da 0". */
function percentuale(attuale, precedente) {
  if (!attuale && !precedente) return { differenza: null };
  if (!precedente) return { differenza: attuale, testo: 'da 0' };
  const p = Math.round(((attuale - precedente) / precedente) * 100);
  return { differenza: p, testo: `${Math.abs(p)}%` };
}

/** Mini-grafico a barre: periodo precedente attenuato, periodo attuale nell'accento. */
function MiniBarre({ secchi, valore, descrivi }) {
  const valori = secchi.map(valore);
  const max = Math.max(0, ...valori.filter(v => v != null));
  const L = 120, A = 28, spazio = 2;
  const larghezza = (L - spazio * (secchi.length - 1)) / secchi.length;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="w-full h-7 block" aria-hidden="true">
      {secchi.map((s, i) => {
        const v = valori[i];
        if (v == null) return null;                     // nessun dato: niente barra
        const h = v > 0 && max > 0 ? Math.max(2, (v / max) * A) : 1;   // lo zero resta una linea
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
 * @param {{data: string, sessioni: number, durata: number, volume: number}[]} p.giorni - due periodi di dati giornalieri
 * @param {number} p.periodo - giorni del periodo scelto
 * @param {number} p.adesso - istante in cui i dati sono stati caricati (ms)
 * @param {{settimaneDiFila?: number, ultimeSettimane?: boolean[]}} [p.riepilogo]
 */
export default function IndicatoriPeriodo({ giorni, periodo, adesso, riepilogo }) {
  const secchi = dividiInSecchi(giorni, periodo, adesso);
  const [titolo, quanti] = NOMI_PERIODO[periodo] || [`Ultimi ${periodo} giorni`, String(periodo)];

  const sessioni = [somma(secchi, 'sessioni', false), somma(secchi, 'sessioni', true)];
  const volume = [somma(secchi, 'volume', false), somma(secchi, 'volume', true)];
  const durata = [somma(secchi, 'durata', false), somma(secchi, 'durata', true)];
  const media = sessioni.map((n, i) => (n ? Math.round(durata[i] / n) : null));

  const varVolume = percentuale(volume[1], volume[0]);
  const settimane = riepilogo?.ultimeSettimane || [];
  const attive = settimane.filter(Boolean).length;

  return (
    <section className="glass-card overflow-hidden" aria-label="Indicatori del periodo">
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3 flex-wrap border-b border-[var(--bordo)]">
        <h2 className="text-sm font-semibold text-[var(--testo-primario)]">{titolo}</h2>
        <p className="text-xs text-[var(--testo-terziario)]">rispetto ai {quanti} precedenti</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-[var(--bordo)] [&>*:nth-child(odd)]:border-r lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0 [&>*:nth-child(-n+2)]:border-b lg:[&>*]:border-b-0">
        <Indicatore
          etichetta="Allenamenti"
          valore={sessioni[1]}
          variazione={<Variazione differenza={sessioni[1] || sessioni[0] ? sessioni[1] - sessioni[0] : null} testo={Math.abs(sessioni[1] - sessioni[0])} />}
        >
          <MiniBarre secchi={secchi} valore={s => s.sessioni} descrivi={v => `${v} allenament${v === 1 ? 'o' : 'i'}`} />
        </Indicatore>

        <Indicatore
          etichetta="Volume sollevato"
          valore={formattaVolume(volume[1])}
          variazione={<Variazione differenza={varVolume.differenza} testo={varVolume.testo} />}
        >
          <MiniBarre secchi={secchi} valore={s => s.volume} descrivi={v => formattaVolume(v)} />
        </Indicatore>

        <Indicatore
          etichetta="Durata media"
          valore={media[1] != null ? `${media[1]} min` : '—'}
          // Durare di piu' non e' ne' un bene ne' un male: variazione neutra
          variazione={media[1] != null && media[0] != null
            ? <Variazione differenza={media[1] - media[0]} testo={`${Math.abs(media[1] - media[0])} min`} buona={null} />
            : null}
        >
          <MiniBarre secchi={secchi} valore={s => (s.sessioni ? Math.round(s.durata / s.sessioni) : null)} descrivi={v => `${v} min di media`} />
        </Indicatore>

        <Indicatore
          etichetta="Settimane di fila"
          valore={riepilogo?.settimaneDiFila ?? '—'}
        >
          <div className="flex gap-[3px] h-7 items-end" role="img" aria-label={`Ultime 12 settimane: ${attive} con almeno un allenamento`}>
            {settimane.map((attiva, i) => (
              <span
                key={i}
                title={i === settimane.length - 1 ? 'Questa settimana' : `${settimane.length - 1 - i} settimane fa`}
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
