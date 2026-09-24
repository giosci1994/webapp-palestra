// ============================================
// GymMaster — Sezione "Corpo" delle statistiche
// Per ogni gruppo muscolare: esercizi fatti, carico usato e massimale
// ============================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { PersonStanding, ChevronDown, Trophy } from 'lucide-react';
import { api } from '../../config/api.js';
import { formattaPeso, nomeEsercizio } from '../../utils/formattatori.js';
import { SCALA_ALLENAMENTO, gradinoAllenamento } from '../../utils/costanti.js';
import SezioneCollassabile from '../comuni/SezioneCollassabile.jsx';
import MappaCorpo from './MappaCorpo.jsx';

// Gruppi del catalogo → muscoli della sagoma. Quelli senza una zona
// disegnata (flessori dell'anca, tibiali, cardio…) compaiono solo in elenco.
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

export default function SezioneCorpo() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(false);
  const [aperto, setAperto] = useState(null);           // gruppo espanso
  const righe = useRef({});

  useEffect(() => {
    let annullato = false;
    api.get('/statistiche/corpo')
      .then(r => { if (!annullato) setDati(r.dati); })
      .catch(() => { if (!annullato) setErrore(true); });
    return () => { annullato = true; };
  }, []);

  const gruppi = useMemo(() => dati?.gruppi || [], [dati]);

  // Serie per muscolo: la somma dei gruppi che lo allenano. Il muscolo piu'
  // allenato fissa il massimo della scala, per la sagoma come per l'elenco.
  const { livelli, etichette, massimo } = useMemo(() => {
    const serie = {}, nomi = {};
    for (const g of gruppi) {
      for (const m of MUSCOLI_PER_GRUPPO[g.nome] || []) {
        serie[m] = (serie[m] || 0) + g.serie;
        (nomi[m] ??= []).push(g.nome);
      }
    }
    const max = Math.max(0, ...Object.values(serie));
    return {
      massimo: max,
      livelli: Object.fromEntries(Object.entries(serie).map(([m, n]) => [m, gradinoAllenamento(n, max)])),
      etichette: Object.fromEntries(Object.entries(serie).map(([m, n]) => [m, `${nomi[m].join(', ')} · ${n} serie`])),
    };
  }, [gruppi]);

  const evidenziati = useMemo(() => new Set(MUSCOLI_PER_GRUPPO[aperto] || []), [aperto]);
  const apertoSenzaDati = aperto && !gruppi.some(g => g.nome === aperto);
  const ciSonoMassimali = gruppi.some(g => g.esercizi.some(e => e.massimale));

  const toccaMuscolo = (muscolo) => {
    const candidati = Object.keys(MUSCOLI_PER_GRUPPO).filter(g => MUSCOLI_PER_GRUPPO[g].includes(muscolo));
    // Fra i gruppi che allenano quel muscolo, quello con piu' serie (l'elenco
    // arriva gia' ordinato); se nessuno ha dati, il primo, per dirlo
    const scelto = gruppi.find(g => candidati.includes(g.nome))?.nome || candidati[0];
    if (!scelto) return;
    setAperto(prec => (prec === scelto ? null : scelto));
    requestAnimationFrame(() => righe.current[scelto]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
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
            <MappaCorpo livelli={livelli} etichette={etichette} evidenziati={evidenziati} onTocca={toccaMuscolo} />

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

            {apertoSenzaDati ? (
              <p className="text-xs text-center text-[var(--testo-secondario)]">
                Nessun esercizio registrato per <span className="font-bold text-[var(--testo-primario)]">{aperto.toLowerCase()}</span>.
              </p>
            ) : !aperto && (
              <p className="text-xs text-center text-[var(--testo-terziario)]">Tocca un muscolo o un gruppo per vedere carichi e massimali.</p>
            )}

            {/* Gruppi: il percorso principale, anche da tastiera */}
            <div className="flex flex-col gap-2">
              {gruppi.map(g => {
                const espanso = aperto === g.nome;
                const gradino = gradinoAllenamento(g.serie, massimo);
                const idLista = `corpo-${g.nome.replace(/\W+/g, '-')}`;
                return (
                  <div
                    key={g.nome}
                    ref={el => { righe.current[g.nome] = el; }}
                    className={`rounded-[var(--raggio-md)] border transition-colors ${espanso ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--bordo)] bg-[var(--bg-terziario)]'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setAperto(espanso ? null : g.nome)}
                      aria-expanded={espanso}
                      aria-controls={idLista}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    >
                      {/* Stesso colore della sagoma: riga e muscolo si ritrovano a colpo d'occhio */}
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: SCALA_ALLENAMENTO[Math.max(1, gradino) - 1] }} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-sm truncate">{g.nome}</span>
                        <span className="block text-[11px] text-[var(--testo-terziario)]">
                          {g.serie} serie · {g.esercizi.length} eserciz{g.esercizi.length === 1 ? 'io' : 'i'} · <span className="whitespace-nowrap">ultima volta {dataBreve(g.ultimaData)}</span>
                        </span>
                      </span>
                      <ChevronDown size={18} className={`shrink-0 text-[var(--testo-terziario)] transition-transform ${espanso ? 'rotate-180' : ''}`} />
                    </button>

                    {espanso && (
                      <ul id={idLista} className="px-3 pb-3 flex flex-col gap-2">
                        {g.esercizi.map(e => (
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
                    )}
                  </div>
                );
              })}
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
