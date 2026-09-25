// ============================================
// GymMaster — Serie a settimana per muscolo
// Barre orizzontali con la fascia di volume consigliata
// ============================================
//
// Prende il posto della torta dei gruppi: undici fette non si confrontano, e
// la sagoma della sezione Corpo mostra gia' le proporzioni. Qui conta il
// valore assoluto: quante serie a settimana riceve ogni muscolo rispetto alle
// 10-20 indicate di solito per la crescita muscolare.

const FASCIA = [10, 20];

const numero = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/**
 * @param {object} p
 * @param {{periodo: {settimane: number}, gruppi: object[]}} p.dati - risposta di /statistiche/muscoli
 */
export default function SeriePerMuscolo({ dati }) {
  const muscolari = (dati?.gruppi || []).filter(g => g.muscolare);
  const allenati = muscolari.filter(g => g.serieSettimanali > 0).sort((a, b) => b.serieSettimanali - a.serieSettimanali);
  const senzaSerie = muscolari.filter(g => !(g.serieSettimanali > 0));
  // La scala lascia sempre vedere tutta la fascia, e un po' oltre
  const massimo = Math.max(FASCIA[1] + 2, ...allenati.map(g => g.serieSettimanali));
  const pos = (v) => `${(v / massimo) * 100}%`;
  const settimane = dati?.periodo?.settimane;

  // Colonne: nome, barra, valore. La fascia e l'asse usano la stessa colonna della barra.
  const colonne = { gridTemplateColumns: '6.5rem 1fr 2.5rem' };

  return (
    <div className="glass-card p-card-inner min-w-0 w-full">
      <h3 className="text-sm font-semibold text-[var(--testo-primario)]">Serie a settimana per muscolo</h3>
      <p className="text-xs text-[var(--testo-terziario)] mt-1 mb-4">
        Media {settimane > 1 ? `su ${numero(settimane)} settimane` : 'della settimana'}. Le serie in cui il muscolo
        lavora da secondario valgono metà. In evidenza le 10–20 serie indicate di solito per la crescita muscolare.
      </p>

      {allenati.length === 0 ? (
        <p className="text-sm text-[var(--testo-terziario)] text-center py-8">Nessuna serie registrata nel periodo.</p>
      ) : (
        <>
          <div className="relative">
            {/* Fascia consigliata, dietro le barre */}
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
                    title={`${g.nome}: ${numero(g.serieSettimanali)} serie a settimana. Nel periodo ${numero(g.seriePeriodo)} serie${indirette > 0 ? `, di cui ${numero(indirette)} da esercizi in cui lavora da secondario` : ''}.`}
                  >
                    <span className="text-xs text-[var(--testo-secondario)] truncate">{g.nome}</span>
                    <span className="h-3.5 relative">
                      <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--accent)]" style={{ width: pos(g.serieSettimanali) }} />
                    </span>
                    <span className="text-xs text-right text-[var(--testo-primario)] tabular-nums">{numero(g.serieSettimanali)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Asse: solo i riferimenti che servono */}
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
          Nessuna serie nel periodo: {senzaSerie.map(g => g.nome.toLowerCase()).join(', ')}.
        </p>
      )}
    </div>
  );
}
