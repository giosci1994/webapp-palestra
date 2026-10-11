// ============================================
// GymMaster — Sets per week per muscle
// Horizontal bars with the recommended volume band
// ============================================
//
// Takes the place of the muscle groups pie chart: eleven slices can't be
// compared, and the outline in the Corpo (body) section already shows the
// proportions. Here the absolute value matters: how many sets per week each
// muscle gets compared with the 10-20 usually advised for muscle growth.

import { useLingua } from '../../hooks/useLingua.js';
import { localeCorrente } from '../../i18n/index.js';
import { nomeGruppo } from '../../utils/formattatori.js';

const FASCIA = [10, 20];

const numero = (n) => n.toLocaleString(localeCorrente(), { maximumFractionDigits: 1 });

/**
 * @param {object} p
 * @param {{periodo: {settimane: number}, gruppi: object[]}} p.dati - response of /statistiche/muscoli
 */
export default function SeriePerMuscolo({ dati }) {
  const { t } = useLingua();
  const muscolari = (dati?.gruppi || []).filter(g => g.muscolare);
  const allenati = muscolari.filter(g => g.serieSettimanali > 0).sort((a, b) => b.serieSettimanali - a.serieSettimanali);
  const senzaSerie = muscolari.filter(g => !(g.serieSettimanali > 0));
  // The scale always shows the whole band, and a bit beyond
  const massimo = Math.max(FASCIA[1] + 2, ...allenati.map(g => g.serieSettimanali));
  const pos = (v) => `${(v / massimo) * 100}%`;
  const settimane = dati?.periodo?.settimane;
  // "3 sets", for the sentences that mention more than one amount
  const serie = (n) => t('seriePerMuscolo.serie', { count: n, numero: numero(n) });

  // Columns: name, bar, value. The band and the axis use the same column as the bar.
  const colonne = { gridTemplateColumns: '6.5rem 1fr 2.5rem' };

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">{t('seriePerMuscolo.titolo')}</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1 mb-4">
        {settimane > 1 ? t('seriePerMuscolo.descrizione', { numero: numero(settimane) }) : t('seriePerMuscolo.descrizioneUnaSettimana')}
      </p>

      {allenati.length === 0 ? (
        <p className="text-sm text-[var(--testo-terziario)] text-center py-8">{t('seriePerMuscolo.nessunaSerie')}</p>
      ) : (
        <>
          <div className="relative">
            {/* Recommended band, behind the bars */}
            <div className="absolute inset-0 grid pointer-events-none" style={colonne} aria-hidden="true">
              <div />
              <div className="relative">
                <div className="absolute inset-y-0 bg-[var(--accent-dim)] border-x border-[var(--accent)]/30"
                     style={{ left: pos(FASCIA[0]), width: `calc(${pos(FASCIA[1])} - ${pos(FASCIA[0])})` }} />
              </div>
            </div>

            <ul className="relative flex flex-col gap-1.5">
              {allenati.map(g => {
                const indirette = g.seriePeriodo - g.serieDirettePeriodo;
                return (
                  <li
                    key={g.nome}
                    className="grid items-center gap-2 py-1"
                    style={colonne}
                    title={t(indirette > 0 ? 'seriePerMuscolo.dettaglioRigaConIndirette' : 'seriePerMuscolo.dettaglioRiga', {
                      nome: nomeGruppo(g.nome),
                      settimanali: serie(g.serieSettimanali),
                      periodo: serie(g.seriePeriodo),
                      indirette: serie(indirette)
                    })}
                  >
                    <span className="text-xs text-[var(--testo-secondario)] truncate">{nomeGruppo(g.nome)}</span>
                    <span className="h-3.5 relative">
                      <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--accent)]" style={{ width: pos(g.serieSettimanali) }} />
                    </span>
                    <span className="text-xs text-right text-[var(--testo-primario)] tabular-nums">{numero(g.serieSettimanali)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Axis: only the reference marks that are needed */}
          <div className="grid mt-1 text-[10px] text-[var(--testo-terziario)]" style={colonne} aria-hidden="true">
            <span />
            <span className="relative h-3">
              {[0, ...FASCIA].map(v => (
                <span key={v} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pos(v) }}>{v}</span>
              ))}
            </span>
          </div>
        </>
      )}

      {senzaSerie.length > 0 && allenati.length > 0 && (
        <p className="text-xs text-[var(--testo-terziario)] mt-4">
          {t('seriePerMuscolo.senzaSerie', { gruppi: senzaSerie.map(g => nomeGruppo(g.nome).toLowerCase()).join(', ') })}
        </p>
      )}
    </div>
  );
}
