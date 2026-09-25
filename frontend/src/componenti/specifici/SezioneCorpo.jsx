// ============================================
// GymMaster — Sezione "Corpo" delle statistiche
// Per ogni gruppo muscolare: esercizi fatti, carico usato e massimale
// ============================================
//
// Si parte dalla sagoma: toccando un muscolo compare solo il suo gruppo.
// Colori e conteggi seguono il periodo scelto in cima alla pagina; i dettagli
// degli esercizi no, cosi' un massimale di maggio resta visibile anche
// guardando gli ultimi 30 giorni. I dati arrivano da /statistiche/muscoli,
// che raggruppa primari e secondari (vedi backend/src/utils/gruppiMuscolari.js).

import { useState, useMemo, useRef } from 'react';
import { PersonStanding, Trophy, X } from 'lucide-react';
import { formattaPeso, nomeEsercizio } from '../../utils/formattatori.js';
import { SCALA_ALLENAMENTO, gradinoAllenamento } from '../../utils/costanti.js';
import SezioneCollassabile from '../comuni/SezioneCollassabile.jsx';
import MappaCorpo from './MappaCorpo.jsx';

// Gruppo → zone della sagoma. Ogni zona appartiene a un solo gruppo.
const ZONE_PER_GRUPPO = {
  'Petto': ['chest'],
  'Schiena': ['upper-back', 'lower-back'],
  'Trapezio': ['trapezius'],
  'Spalle': ['front-deltoids', 'back-deltoids'],
  'Bicipiti': ['biceps'],
  'Tricipiti': ['triceps'],
  'Avambracci': ['forearm'],
  'Addominali': ['abs', 'obliques'],
  'Quadricipiti': ['quadriceps'],
  'Femorali': ['hamstring'],
  'Glutei': ['gluteal'],
  'Adduttori': ['adductor'],
  'Abduttori': ['abductors'],
  'Polpacci': ['calves', 'left-soleus', 'right-soleus'],
};
const GRUPPO_DI_ZONA = Object.fromEntries(
  Object.entries(ZONE_PER_GRUPPO).flatMap(([gruppo, zone]) => zone.map(z => [z, gruppo]))
);

const NOMI_PERIODO = { 7: 'negli ultimi 7 giorni', 30: 'negli ultimi 30 giorni', 90: 'negli ultimi 3 mesi', 365: 'negli ultimi 12 mesi' };
const PERIODO_BREVE = { 7: '7 giorni', 30: '30 giorni', 90: '3 mesi', 365: '12 mesi' };

const numero = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/** "23 set", con l'anno solo se non e' quello in corso. */
function dataBreve(data) {
  const d = new Date(data);
  const opzioni = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opzioni.year = 'numeric';
  return d.toLocaleDateString('it-IT', opzioni);
}

/** Una serie in forma leggibile: carico e ripetizioni, o durata per il cardio. */
function descriviSerie(s) {
  if (!s) return '—';
  if (s.minuti) return `${s.minuti} min`;
  if (s.peso > 0) return `${formattaPeso(s.peso)} kg × ${s.rep}`;
  if (s.rep > 0) return `Corpo libero × ${s.rep}`;
  return '—';
}

function SchedaEsercizio({ esercizio: e, nelPeriodo, periodoTesto }) {
  return (
    <li className={`rounded-[var(--raggio-sm)] bg-[var(--bg-primario)] border border-[var(--bordo)] p-3 ${nelPeriodo ? '' : 'opacity-70'}`}>
      <p className="font-semibold text-sm leading-snug">{nomeEsercizio(e)}</p>
      <p className="text-[11px] text-[var(--testo-terziario)] mt-0.5">
        {nelPeriodo
          ? <>{e.seriePeriodo} serie {periodoTesto} · </>
          : <>Non fatto {periodoTesto} · </>}
        <span className="whitespace-nowrap">ultima volta {dataBreve(e.ultimo.data)}</span>
      </p>
      <div className="flex gap-6 mt-2.5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Carico</p>
          <p className="text-base font-bold leading-tight mt-0.5">{descriviSerie(e.ultimo)}</p>
        </div>
        {e.massimale && (
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Massimale</p>
            <p className="text-base font-bold leading-tight mt-0.5 flex items-center gap-1">
              <Trophy size={14} className="text-[var(--avviso)] shrink-0" />
              {formattaPeso(e.massimale.peso)} kg
              <span className="text-[11px] font-normal text-[var(--testo-terziario)] ml-1">{dataBreve(e.massimale.data)}</span>
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

function SchedaGruppo({ gruppo: g, esercizi, colore, periodoTesto }) {
  // Prima quelli fatti nel periodo, poi gli altri dal piu' recente
  const ordina = (lista) => lista
    .map(id => esercizi[id]).filter(Boolean)
    .sort((a, b) => (b.seriePeriodo > 0) - (a.seriePeriodo > 0) || b.seriePeriodo - a.seriePeriodo || new Date(b.ultimo.data) - new Date(a.ultimo.data));
  const principali = ordina(g.esercizi);
  const secondari = ordina(g.eserciziSecondari);
  const indirette = g.seriePeriodo - g.serieDirettePeriodo;

  return (
    <div className="rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)]">
      <div className="flex items-start gap-3 px-3 pt-3">
        <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ background: colore }} />
        <div className="min-w-0">
          <h4 className="font-bold text-sm">{g.nome}</h4>
          <p className="text-[11px] text-[var(--testo-terziario)]">
            {g.seriePeriodo > 0
              ? <>{numero(g.seriePeriodo)} serie {periodoTesto}{indirette > 0 && <>, di cui {numero(indirette)} da muscolo secondario</>}</>
              : <>Nessuna serie {periodoTesto}</>}
            {g.ultimaData && <> · <span className="whitespace-nowrap">ultima volta {dataBreve(g.ultimaData)}</span></>}
          </p>
        </div>
      </div>

      {principali.length > 0 && (
        <ul className="p-3 flex flex-col gap-2">
          {principali.map(e => (
            <SchedaEsercizio key={e.id} esercizio={e} nelPeriodo={e.seriePeriodo > 0} periodoTesto={periodoTesto} />
          ))}
        </ul>
      )}

      {secondari.length > 0 && (
        <div className={`px-3 pb-3 ${principali.length ? '' : 'pt-3'}`}>
          <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)] mb-1.5">Lavorato anche in</p>
          <ul className="flex flex-col gap-1">
            {secondari.map(e => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-[var(--testo-secondario)] truncate">{nomeEsercizio(e)}</span>
                <span className="text-[var(--testo-terziario)] shrink-0 tabular-nums">
                  {e.seriePeriodo > 0 ? `${e.seriePeriodo} serie` : dataBreve(e.ultimo.data)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.dati - risposta di /statistiche/muscoli
 * @param {number} p.periodo - giorni del periodo scelto
 */
export default function SezioneCorpo({ dati, periodo }) {
  const [selezione, setSelezione] = useState(null);     // nome del gruppo
  const dettaglio = useRef(null);

  const gruppi = useMemo(() => dati?.gruppi || [], [dati]);
  const esercizi = dati?.esercizi || {};
  const periodoTesto = NOMI_PERIODO[periodo] || `negli ultimi ${periodo} giorni`;
  const perNome = useMemo(() => Object.fromEntries(gruppi.map(g => [g.nome, g])), [gruppi]);

  // Scala: il gruppo sulla sagoma con piu' serie nel periodo e' il gradino piu' alto
  const massimo = Math.max(0, ...Object.keys(ZONE_PER_GRUPPO).map(n => perNome[n]?.seriePeriodo || 0));
  const coloreGruppo = (g) => {
    const gradino = gradinoAllenamento(g?.seriePeriodo || 0, massimo);
    return gradino ? SCALA_ALLENAMENTO[gradino - 1] : null;
  };

  const { livelli, etichette } = useMemo(() => {
    const livelli = {}, etichette = {};
    for (const [zona, nome] of Object.entries(GRUPPO_DI_ZONA)) {
      const g = perNome[nome];
      livelli[zona] = gradinoAllenamento(g?.seriePeriodo || 0, massimo);
      etichette[zona] = g?.seriePeriodo > 0
        ? `${nome}: ${numero(g.seriePeriodo)} serie ${periodoTesto}`
        : g?.ultimaData ? `${nome}: nessuna serie ${periodoTesto}` : `${nome}: mai allenato`;
    }
    return { livelli, etichette };
  }, [perNome, massimo, periodoTesto]);

  // Gruppi allenati almeno una volta che non hanno una zona sulla sagoma
  const fuoriSagoma = gruppi.filter(g => !ZONE_PER_GRUPPO[g.nome] && g.ultimaData);
  const evidenziati = useMemo(() => new Set(ZONE_PER_GRUPPO[selezione] || []), [selezione]);
  const scelto = selezione ? perNome[selezione] : null;
  const ciSonoMassimali = Object.values(esercizi).some(e => e.massimale);

  const scegli = (nome) => {
    setSelezione(prec => (prec === nome ? null : nome));
    if (selezione !== nome) {
      requestAnimationFrame(() => dettaglio.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  };

  return (
    <SezioneCollassabile
      chiave="statistiche-corpo"
      titolo="Corpo"
      Icona={PersonStanding}
      // Il periodo sta nell'intestazione: i colori dipendono da lui
      azione={<span className="text-xs text-[var(--testo-terziario)]">{PERIODO_BREVE[periodo] || `${periodo} giorni`}</span>}
    >
      <div className="p-card-inner pt-4 flex flex-col gap-4">
        {!dati ? (
          <p className="text-sm text-[var(--testo-terziario)] text-center py-6">Impossibile caricare i dati del corpo.</p>
        ) : !gruppi.some(g => g.ultimaData) ? (
          <p className="text-sm text-[var(--testo-terziario)] text-center py-6">
            Completa qualche allenamento per vedere quali muscoli hai allenato.
          </p>
        ) : (
          <>
            <MappaCorpo livelli={livelli} etichette={etichette} evidenziati={evidenziati} onTocca={zona => scegli(GRUPPO_DI_ZONA[zona])} />

            {/* Legenda: gli estremi in serie reali, non "poco/tanto" */}
            {massimo > 0 ? (
              <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--testo-secondario)] whitespace-nowrap">
                <span>1 serie</span>
                <span className="flex gap-0.5" aria-hidden="true">
                  {SCALA_ALLENAMENTO.map(c => <span key={c} className="w-5 h-2.5 rounded-sm" style={{ background: c }} />)}
                </span>
                <span>{numero(massimo)} serie</span>
              </div>
            ) : (
              <p className="text-xs text-center text-[var(--testo-secondario)]">
                Nessuna serie {periodoTesto}: tocca un muscolo per vedere lo storico.
              </p>
            )}

            {/* Gruppi senza una zona sulla sagoma: altrimenti irraggiungibili */}
            {fuoriSagoma.length > 0 && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--testo-terziario)]">Fuori dalla sagoma:</span>
                {fuoriSagoma.map(g => (
                  <button
                    key={g.nome}
                    type="button"
                    onClick={() => scegli(g.nome)}
                    aria-pressed={selezione === g.nome}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selezione === g.nome ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--testo-primario)]' : 'border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)]'}`}
                  >
                    {g.nome}{g.seriePeriodo > 0 ? ` · ${numero(g.seriePeriodo)}` : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Dettaglio della selezione */}
            <div ref={dettaglio} aria-live="polite" className="scroll-mt-4">
              {!selezione ? (
                <p className="text-xs text-center text-[var(--testo-terziario)]">
                  Tocca un muscolo per vedere esercizi, carichi e massimali.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-wider text-[var(--testo-terziario)]">{selezione}</p>
                    <button
                      type="button"
                      onClick={() => setSelezione(null)}
                      aria-label="Chiudi il dettaglio"
                      className="p-1 rounded-full text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {scelto?.ultimaData
                    ? <SchedaGruppo gruppo={scelto} esercizi={esercizi} colore={coloreGruppo(scelto) || 'var(--testo-terziario)'} periodoTesto={periodoTesto} />
                    : (
                      <p className="text-sm text-center text-[var(--testo-secondario)] py-2">
                        Nessun esercizio registrato per questo muscolo.
                      </p>
                    )}
                </div>
              )}
            </div>

            {/* Da dove viene il massimale: senza questa riga non si capirebbe perche' manca */}
            <p className="text-[11px] text-[var(--testo-terziario)] flex items-start gap-1.5">
              <Trophy size={12} className="shrink-0 mt-0.5" />
              <span>
                Il massimale è la serie più pesante fatta con una sola ripetizione.
                {!ciSonoMassimali && ' Quando fai un test di massimale, registra la serie con 1 ripetizione e comparirà qui.'}
              </span>
            </p>
          </>
        )}
      </div>
    </SezioneCollassabile>
  );
}
