// ============================================
// GymMaster — Modifica un allenamento dello storico
// Orari, note e serie di una sessione già conclusa
// ============================================

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '../../config/api.js';
import { nomeEsercizio, formattaDurata, aStringaData, aStringaOra, eCardioNelloStorico } from '../../utils/formattatori.js';
import { DURATA_SOSPETTA_MINUTI } from '../../utils/costanti.js';

const DURATA_MAX = 600;          // come il server: oltre le 10 ore non è un allenamento
const MINUTI_GIORNO = 24 * 60;

/** Numero da un campo del form; vuoto → null. */
const numero = (valore) => (String(valore ?? '').trim() === '' ? null : Number(valore));

/** Contenuto di un campo da un valore salvato (null → vuoto). */
const campo = (valore) => (valore == null ? '' : String(valore));

/** L'istante è nel futuro? Si chiede al salvataggio, non durante il render. */
const nelFuturo = (istante) => istante.getTime() > Date.now();

/** Gli esercizi dello storico come gruppi di righe modificabili. */
function gruppiDaSessione(sessione) {
  return sessione.esercizi.map(voce => ({
    esercizio: voce.esercizio,
    // Deciso all'apertura: aggiungere o togliere righe non cambia i campi mostrati
    cardio: eCardioNelloStorico(voce),
    serie: voce.serie.map(s => ({
      chiave: `s${s.id}`,
      id: s.id,
      peso: campo(s.pesoEffettivo),
      rep: campo(s.repEffettive),
      rpe: campo(s.rpe),
      minuti: campo(s.durataMinuti),
      livello: campo(s.livelloResistenza)
    }))
  }));
}

/** Righe confrontabili, per capire se le serie sono cambiate. */
const impronta = (gruppi) => JSON.stringify(gruppi.map(g => g.serie.map(s => [s.id, s.peso, s.rep, s.rpe, s.minuti, s.livello])));

/** Primo problema nelle serie, da mostrare prima di inviare; null se va tutto bene. */
function erroreSerie(gruppi) {
  for (const g of gruppi) {
    for (const [i, s] of g.serie.entries()) {
      const dove = `${nomeEsercizio(g.esercizio)}, serie ${i + 1}`;
      if (g.cardio) {
        const minuti = numero(s.minuti);
        if (minuti == null) return `${dove}: inserisci i minuti o elimina la serie`;
        if (!Number.isInteger(minuti) || minuti < 0 || minuti > DURATA_MAX) return `${dove}: minuti non validi`;
        const livello = numero(s.livello);
        if (livello != null && (!Number.isInteger(livello) || livello < 0)) return `${dove}: livello non valido`;
      } else {
        const peso = numero(s.peso);
        if (peso != null && !(peso >= 0 && peso <= 1000)) return `${dove}: peso non valido`;
        const rep = numero(s.rep);
        if (rep == null) return `${dove}: inserisci le ripetizioni o elimina la serie`;
        if (!Number.isInteger(rep) || rep < 0 || rep > 1000) return `${dove}: ripetizioni non valide`;
      }
    }
  }
  return null;
}

/** Le serie nel formato di PATCH /sessioni/:id, nell'ordine in cui sono mostrate. */
function serieDaInviare(gruppi) {
  return gruppi.flatMap(g => g.serie.map(s => ({
    ...(s.id ? { id: s.id } : { esercizioId: g.esercizio.id }),
    ...(g.cardio
      ? { durataMinuti: numero(s.minuti), livelloResistenza: numero(s.livello) }
      : { pesoEffettivo: numero(s.peso) ?? 0, repEffettive: numero(s.rep), rpe: numero(s.rpe) })
  })));
}

const CAMPO_SERIE = 'w-full min-w-0 px-2 py-2 text-sm text-center tabular-nums rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] text-[var(--testo-primario)] border border-[var(--bordo)] focus:border-[var(--accent)] focus:outline-none';
const ETICHETTA = 'text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide';

export default function ModificaAllenamento({ sessione, onChiudi, onSalvato }) {
  const [iniziale] = useState(() => {
    const inizio = new Date(sessione.dataInizio);
    return {
      data: aStringaData(inizio),
      ora: aStringaOra(inizio),
      durata: sessione.durataMinuti ?? Math.round((new Date(sessione.dataFine) - inizio) / 60000),
      riscaldamento: sessione.minutiRiscaldamento ?? null,
      note: sessione.noteFinali ?? '',
      gruppi: gruppiDaSessione(sessione)
    };
  });

  const [data, setData] = useState(iniziale.data);
  const [ora, setOra] = useState(iniziale.ora);
  const [durata, setDurata] = useState(String(iniziale.durata));
  const [riscaldamento, setRiscaldamento] = useState(campo(iniziale.riscaldamento));
  const [note, setNote] = useState(iniziale.note);
  const [gruppi, setGruppi] = useState(iniziale.gruppi);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');
  const nuoveSerie = useRef(0);

  // Data e ora locali → istante assoluto, come nella registrazione di un allenamento passato
  const inizio = new Date(`${data}T${ora}`);
  const minuti = numero(durata);
  const fine = !Number.isNaN(inizio.getTime()) && Number.isInteger(minuti)
    ? new Date(inizio.getTime() + minuti * 60000)
    : null;
  const giorniDopo = fine ? Math.round((new Date(aStringaData(fine)) - new Date(data)) / 86400000) : 0;

  // L'ora di fine e la durata sono la stessa informazione: chi ricorda a che ora
  // ha finito non deve fare il conto dei minuti. Una fine prima dell'inizio
  // cade il giorno dopo (iniziato alle 23:30, finito all'1:00).
  const cambiaOraFine = (valore) => {
    if (!valore || !ora) return;
    const [hf, mf] = valore.split(':').map(Number);
    const [hi, mi] = ora.split(':').map(Number);
    setDurata(String((hf * 60 + mf - (hi * 60 + mi) + MINUTI_GIORNO) % MINUTI_GIORNO));
  };

  /** Solo i campi cambiati: un PATCH che non tocca cio' che l'utente ha lasciato com'era. */
  const modifiche = () => {
    const corpo = {};
    if (data !== iniziale.data || ora !== iniziale.ora) corpo.dataInizio = inizio;
    if (minuti !== iniziale.durata) corpo.durataMinuti = minuti;
    const minutiRiscaldamento = numero(riscaldamento);
    if (minutiRiscaldamento !== iniziale.riscaldamento) corpo.minutiRiscaldamento = minutiRiscaldamento;
    if (note.trim() !== iniziale.note.trim()) corpo.noteFinali = note.trim() || null;
    if (impronta(gruppi) !== impronta(iniziale.gruppi)) corpo.serie = gruppi;
    return corpo;
  };

  const chiudi = () => {
    if (Object.keys(modifiche()).length > 0 && !confirm('Uscire senza salvare le modifiche?')) return;
    onChiudi();
  };

  const salva = async () => {
    setErrore('');
    const corpo = modifiche();
    if (Object.keys(corpo).length === 0) { onChiudi(); return; }

    if (Number.isNaN(inizio.getTime())) { setErrore('Data od ora non valide'); return; }
    if ('durataMinuti' in corpo && (!Number.isInteger(minuti) || minuti < 1 || minuti > DURATA_MAX)) {
      setErrore(`La durata deve essere fra 1 e ${DURATA_MAX} minuti`); return;
    }
    if ('dataInizio' in corpo && nelFuturo(inizio)) { setErrore("L'inizio è nel futuro"); return; }
    if (('dataInizio' in corpo || 'durataMinuti' in corpo) && fine && nelFuturo(fine)) {
      setErrore("Con quest'ora e questa durata l'allenamento finirebbe nel futuro"); return;
    }
    if (corpo.minutiRiscaldamento != null && (!Number.isInteger(corpo.minutiRiscaldamento) || corpo.minutiRiscaldamento < 0)) {
      setErrore('Minuti di riscaldamento non validi'); return;
    }
    if (corpo.serie) {
      const problema = erroreSerie(gruppi);
      if (problema) { setErrore(problema); return; }
      corpo.serie = serieDaInviare(gruppi);
    }
    if (corpo.dataInizio) corpo.dataInizio = corpo.dataInizio.toISOString();

    try {
      setSalvando(true);
      const risposta = await api.patch(`/sessioni/${sessione.id}`, corpo);
      onSalvato?.(risposta.dati, risposta);
    } catch (err) {
      setErrore(err?.message || 'Salvataggio non riuscito');
    } finally {
      setSalvando(false);
    }
  };

  const cambiaGruppo = (indice, trasforma) =>
    setGruppi(prec => prec.map((g, i) => (i === indice ? trasforma(g) : g)));

  const aggiornaSerie = (indice, chiave, nomeCampo, valore) =>
    cambiaGruppo(indice, g => ({ ...g, serie: g.serie.map(s => (s.chiave === chiave ? { ...s, [nomeCampo]: valore } : s)) }));

  const eliminaSerie = (indice, chiave) =>
    cambiaGruppo(indice, g => ({ ...g, serie: g.serie.filter(s => s.chiave !== chiave) }));

  const aggiungiSerie = (indice) => {
    nuoveSerie.current += 1;
    const chiave = `n${nuoveSerie.current}`;
    // Riparte dai valori dell'ultima serie: di solito si ripete lo stesso carico
    cambiaGruppo(indice, g => {
      const ultima = g.serie[g.serie.length - 1];
      const valori = ultima
        ? { peso: ultima.peso, rep: ultima.rep, rpe: ultima.rpe, minuti: ultima.minuti, livello: ultima.livello }
        : { peso: '', rep: '', rpe: '', minuti: '', livello: '' };
      return { ...g, serie: [...g.serie, { chiave, id: null, ...valori }] };
    });
  };

  const durataSospetta = Number.isInteger(minuti) && minuti > DURATA_SOSPETTA_MINUTI;

  return (
    // Sopra la barra di navigazione (z-50), che altrimenti coprirebbe i pulsanti in fondo
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={chiudi}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="titolo-modifica-allenamento"
        className="glass-card w-full sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-[var(--raggio-lg)] sm:rounded-[var(--raggio-lg)]"
      >
        <div className="p-card-inner border-b border-[var(--bordo-light)] flex items-start justify-between gap-3 shrink-0" style={{ background: 'var(--bg-secondario)' }}>
          <div className="min-w-0">
            <h3 id="titolo-modifica-allenamento" className="font-bold text-lg flex items-center gap-2">
              <Pencil size={18} className="text-[var(--accent)] shrink-0" /> Modifica allenamento
            </h3>
            <p className="text-xs text-[var(--testo-secondario)] mt-1 truncate">{sessione.scheda.titolo}</p>
          </div>
          <button onClick={chiudi} aria-label="Chiudi" className="p-1.5 rounded text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-card-inner flex flex-col gap-4 overflow-y-auto">
          {durataSospetta && (
            <div className="flex items-start gap-3 p-3 rounded-[var(--raggio-md)] border border-[var(--avviso)]/40 bg-[var(--avviso-dim)]">
              <AlertTriangle size={18} className="text-[var(--avviso)] shrink-0 mt-0.5" />
              <p className="text-sm">
                Risulta durato <strong>{formattaDurata(minuti)}</strong>: probabilmente è rimasto aperto dopo la fine.
                Imposta l'ora in cui hai finito davvero.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>Giorno</span>
              <input type="date" value={data} max={aStringaData(new Date())} onChange={e => setData(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>Ora d'inizio</span>
              <input type="time" value={ora} onChange={e => setOra(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>
                Ora di fine{giorniDopo > 0 && <span className="normal-case font-medium"> · {giorniDopo === 1 ? 'giorno dopo' : `+${giorniDopo} giorni`}</span>}
              </span>
              <input type="time" value={fine ? aStringaOra(fine) : ''} onChange={e => cambiaOraFine(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>Durata (min)</span>
              <input type="number" min="1" max={DURATA_MAX} inputMode="numeric" value={durata} onChange={e => setDurata(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>Riscaldamento (min)</span>
              <input type="number" min="0" max="120" inputMode="numeric" value={riscaldamento} onChange={e => setRiscaldamento(e.target.value)} placeholder="facoltativo" className="campo-input" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={ETICHETTA}>Note</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="facoltative" className="campo-input resize-y" />
          </label>

          <div className="flex flex-col gap-3">
            <h4 className={ETICHETTA}>Serie</h4>
            {gruppi.length === 0 && (
              <p className="text-xs text-[var(--testo-terziario)]">Nessuna serie registrata in questo allenamento.</p>
            )}
            {gruppi.map((g, gi) => {
              const colonne = g.cardio ? 'grid-cols-[1.5rem_1fr_1fr_2.25rem]' : 'grid-cols-[1.5rem_1fr_1fr_1fr_2.25rem]';
              return (
                <div key={g.esercizio.id} className="rounded-[var(--raggio-md)] border border-[var(--bordo-light)] p-3">
                  <p className="font-semibold text-sm mb-2 truncate">{nomeEsercizio(g.esercizio)}</p>
                  {g.serie.length > 0 && (
                    <div className={`grid ${colonne} gap-2 mb-1 text-[10px] font-semibold uppercase text-[var(--testo-terziario)] text-center`}>
                      <span>N.</span>
                      {g.cardio ? (<><span>Minuti</span><span>Livello</span></>) : (<><span>Kg</span><span>Rip.</span><span>RPE</span></>)}
                      <span />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {g.serie.map((s, i) => (
                      <div key={s.chiave} className={`grid ${colonne} gap-2 items-center`}>
                        <span className="text-xs text-center text-[var(--testo-terziario)]">{i + 1}</span>
                        {g.cardio ? (
                          <>
                            <input type="number" min="0" max={DURATA_MAX} inputMode="numeric" value={s.minuti}
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'minuti', e.target.value)}
                                   aria-label={`Minuti, serie ${i + 1}`} className={CAMPO_SERIE} />
                            <input type="number" min="0" inputMode="numeric" value={s.livello} placeholder="—"
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'livello', e.target.value)}
                                   aria-label={`Livello, serie ${i + 1}`} className={CAMPO_SERIE} />
                          </>
                        ) : (
                          <>
                            <input type="number" min="0" step="0.5" inputMode="decimal" value={s.peso} placeholder="0"
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'peso', e.target.value)}
                                   aria-label={`Peso in kg, serie ${i + 1}`} className={CAMPO_SERIE} />
                            <input type="number" min="0" inputMode="numeric" value={s.rep}
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'rep', e.target.value)}
                                   aria-label={`Ripetizioni, serie ${i + 1}`} className={CAMPO_SERIE} />
                            <select value={s.rpe} onChange={e => aggiornaSerie(gi, s.chiave, 'rpe', e.target.value)}
                                    aria-label={`RPE, serie ${i + 1}`} className={CAMPO_SERIE}>
                              <option value="">—</option>
                              {Array.from({ length: 10 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </>
                        )}
                        <button onClick={() => eliminaSerie(gi, s.chiave)} aria-label={`Elimina serie ${i + 1}`}
                                className="h-9 flex items-center justify-center rounded-[var(--raggio-sm)] text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {g.serie.length === 0 && (
                    <p className="text-xs text-[var(--testo-terziario)]">Nessuna serie: salvando, l'esercizio sparirà da questo allenamento.</p>
                  )}
                  <button onClick={() => aggiungiSerie(gi)} className="mt-2 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Aggiungi serie
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-card-inner border-t border-[var(--bordo-light)] flex flex-col gap-3 shrink-0"
             style={{ background: 'var(--bg-secondario)', paddingBottom: 'calc(24px + var(--safe-bottom))' }}>
          {errore && <p className="text-sm text-[var(--pericolo)]" role="alert">{errore}</p>}
          <div className="flex gap-3">
            <button onClick={chiudi} className="flex-1 py-2.5 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium">
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={salvando}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={16} /> {salvando ? 'Salvo…' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
