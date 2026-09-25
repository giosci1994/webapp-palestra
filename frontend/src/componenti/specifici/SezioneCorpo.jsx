// ============================================
// GymMaster — Sezione "Corpo" delle statistiche
// Per ogni gruppo muscolare: esercizi fatti, carico usato e massimale
// ============================================
//
// Si parte dalla sagoma: toccando un muscolo compaiono solo i gruppi che lo
// allenano. Un elenco di tutti i gruppi sotto la sagoma la ripeteva.

import { useState, useEffect, useMemo, useRef } from 'react';
import { PersonStanding, Trophy, X } from 'lucide-react';
import { api } from '../../config/api.js';
import { formattaPeso, nomeEsercizio } from '../../utils/formattatori.js';
import { SCALA_ALLENAMENTO, gradinoAllenamento } from '../../utils/costanti.js';
import SezioneCollassabile from '../comuni/SezioneCollassabile.jsx';
import MappaCorpo from './MappaCorpo.jsx';

// Gruppi del catalogo → muscoli della sagoma. Quelli senza una zona
// disegnata (cardio, flessori dell'anca, tibiali…) si scelgono a parte.
const MUSCOLI_PER_GRUPPO = {
  'Petto': ['chest'],
  'Schiena': ['upper-back', 'lower-back'],
  'Dorsali': ['upper-back'],
  'Trapezio': ['trapezius'],
  'Spalle': ['front-deltoids', 'back-deltoids'],
  'Bicipiti': ['biceps'],
  'Tricipiti': ['triceps'],
  'Avambracci': ['forearm'],
  'Addominali': ['abs', 'obliques'],
  'Core': ['abs', 'obliques'],
  'Quadricipiti': ['quadriceps'],
  'Femorali': ['hamstring'],
  'Glutei': ['gluteal'],
  'Adduttori': ['adductor'],
  'Abduttori': ['abductors'],
  'Polpacci': ['calves', 'left-soleus', 'right-soleus'],
  // Generico (leg press, affondi…): le cosce, non i polpacci
  'Gambe': ['quadriceps', 'hamstring'],
};

// Nomi dei muscoli della sagoma, per i suggerimenti e i lettori di schermo
const NOMI_MUSCOLI = {
  'chest': 'Petto', 'upper-back': 'Dorsali', 'lower-back': 'Lombari', 'trapezius': 'Trapezio',
  'front-deltoids': 'Deltoidi anteriori', 'back-deltoids': 'Deltoidi posteriori',
  'biceps': 'Bicipiti', 'triceps': 'Tricipiti', 'forearm': 'Avambracci',
  'abs': 'Addominali', 'obliques': 'Obliqui', 'quadriceps': 'Quadricipiti', 'hamstring': 'Femorali',
  'gluteal': 'Glutei', 'adductor': 'Adduttori', 'abductors': 'Abduttori',
  'calves': 'Polpacci', 'left-soleus': 'Soleo', 'right-soleus': 'Soleo',
};

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

function SchedaGruppo({ gruppo, massimo }) {
  const gradino = gradinoAllenamento(gruppo.serie, massimo);
  return (
    <div className="rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)]">
      <div className="flex items-center gap-3 px-3 pt-3">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: SCALA_ALLENAMENTO[Math.max(1, gradino) - 1] }} />
        <div className="min-w-0">
          <h4 className="font-bold text-sm">{gruppo.nome}</h4>
          <p className="text-[11px] text-[var(--testo-terziario)]">
            {gruppo.serie} serie · {gruppo.esercizi.length} eserciz{gruppo.esercizi.length === 1 ? 'io' : 'i'} · <span className="whitespace-nowrap">ultima volta {dataBreve(gruppo.ultimaData)}</span>
          </p>
        </div>
      </div>
      <ul className="p-3 flex flex-col gap-2">
        {gruppo.esercizi.map(e => (
          <li key={e.id} className="rounded-[var(--raggio-sm)] bg-[var(--bg-primario)] border border-[var(--bordo)] p-3">
            <p className="font-semibold text-sm leading-snug">{nomeEsercizio(e)}</p>
            <p className="text-[11px] text-[var(--testo-terziario)] mt-0.5">
              {e.serie} serie in {e.sessioni} allenament{e.sessioni === 1 ? 'o' : 'i'} · <span className="whitespace-nowrap">ultima volta {dataBreve(e.ultimo.data)}</span>
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
        ))}
      </ul>
    </div>
  );
}

export default function SezioneCorpo() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(false);
  // { muscolo } dalla sagoma, oppure { gruppo } per quelli fuori sagoma
  const [selezione, setSelezione] = useState(null);
  const dettaglio = useRef(null);

  useEffect(() => {
    let annullato = false;
    api.get('/statistiche/corpo')
      .then(r => { if (!annullato) setDati(r.dati); })
      .catch(() => { if (!annullato) setErrore(true); });
    return () => { annullato = true; };
  }, []);

  const gruppi = useMemo(() => dati?.gruppi || [], [dati]);

  // Serie per muscolo: la somma dei gruppi che lo allenano. Il muscolo piu'
  // allenato fissa il massimo della scala.
  const { livelli, etichette, massimo } = useMemo(() => {
    const serie = {};
    for (const g of gruppi) {
      for (const m of MUSCOLI_PER_GRUPPO[g.nome] || []) serie[m] = (serie[m] || 0) + g.serie;
    }
    const max = Math.max(0, ...Object.values(serie));
    return {
      massimo: max,
      livelli: Object.fromEntries(Object.entries(serie).map(([m, n]) => [m, gradinoAllenamento(n, max)])),
      etichette: Object.fromEntries(Object.entries(NOMI_MUSCOLI).map(([m, nome]) => [m, serie[m] ? `${nome}: ${serie[m]} serie` : `${nome}: mai allenato`])),
    };
  }, [gruppi]);

  // Gruppi che non hanno una zona sulla sagoma, ma con allenamenti registrati
  const fuoriSagoma = gruppi.filter(g => !MUSCOLI_PER_GRUPPO[g.nome]);

  const mostrati = !selezione ? []
    : selezione.muscolo ? gruppi.filter(g => MUSCOLI_PER_GRUPPO[g.nome]?.includes(selezione.muscolo))
    : gruppi.filter(g => g.nome === selezione.gruppo);
  const evidenziati = useMemo(() => new Set(selezione?.muscolo ? [selezione.muscolo] : []), [selezione]);
  const ciSonoMassimali = gruppi.some(g => g.esercizi.some(e => e.massimale));

  const scegli = (nuova) => {
    const uguale = selezione && nuova.muscolo === selezione.muscolo && nuova.gruppo === selezione.gruppo;
    setSelezione(uguale ? null : nuova);
    // Porta in vista l'inizio del dettaglio, senza far sparire la sagoma se non serve
    if (!uguale) requestAnimationFrame(() => dettaglio.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  return (
    <SezioneCollassabile chiave="statistiche-corpo" titolo="Corpo" Icona={PersonStanding}>
      <div className="p-card-inner pt-4 flex flex-col gap-4">
        {errore && (
          <p className="text-sm text-[var(--testo-terziario)] text-center py-6">Impossibile caricare i dati del corpo.</p>
        )}

        {!errore && !dati && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
          </div>
        )}

        {dati && gruppi.length === 0 && (
          <p className="text-sm text-[var(--testo-terziario)] text-center py-6">
            Completa qualche allenamento per vedere quali muscoli hai allenato.
          </p>
        )}

        {gruppi.length > 0 && (
          <>
            <MappaCorpo livelli={livelli} etichette={etichette} evidenziati={evidenziati} onTocca={muscolo => scegli({ muscolo })} />

            {/* Legenda: gli estremi in serie reali, non "poco/tanto" */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--testo-secondario)]">
              <span>1 serie</span>
              <span className="flex gap-0.5" aria-hidden="true">
                {SCALA_ALLENAMENTO.map(c => (
                  <span key={c} className="w-5 h-2.5 rounded-sm" style={{ background: c }} />
                ))}
              </span>
              <span>{massimo} serie</span>
            </div>

            {/* Gruppi senza una zona sulla sagoma: altrimenti irraggiungibili */}
            {fuoriSagoma.length > 0 && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--testo-terziario)]">Fuori dalla sagoma:</span>
                {fuoriSagoma.map(g => {
                  const attivo = selezione?.gruppo === g.nome;
                  return (
                    <button
                      key={g.nome}
                      type="button"
                      onClick={() => scegli({ gruppo: g.nome })}
                      aria-pressed={attivo}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${attivo ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--testo-primario)]' : 'border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)]'}`}
                    >
                      {g.nome} · {g.serie}
                    </button>
                  );
                })}
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
                    <p className="text-xs uppercase tracking-wider text-[var(--testo-terziario)]">
                      {selezione.muscolo ? NOMI_MUSCOLI[selezione.muscolo] : selezione.gruppo}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelezione(null)}
                      aria-label="Chiudi il dettaglio"
                      className="p-1 rounded-full text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {mostrati.length > 0
                    ? mostrati.map(g => <SchedaGruppo key={g.nome} gruppo={g} massimo={massimo} />)
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
