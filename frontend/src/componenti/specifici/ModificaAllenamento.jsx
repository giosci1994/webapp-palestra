// ============================================
// GymMaster — Edit a workout from the history
// Times, notes and sets of a workout already finished
// ============================================

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '../../config/api.js';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';
import { nomeEsercizio, formattaDurata, aStringaData, aStringaOra, eCardioNelloStorico, titoloAllenamento } from '../../utils/formattatori.js';
import { DURATA_SOSPETTA_MINUTI } from '../../utils/costanti.js';

// The type of a set (utils/tipiSerie.js) changes by tapping its number:
// working set → warm-up → drop set → working set again
const PROSSIMO_TIPO = { LAVORO: 'RISCALDAMENTO', RISCALDAMENTO: 'DROP', DROP: 'LAVORO' };
// Translation keys: show them with t()
const NOME_TIPO = { LAVORO: 'modificaAllenamento.tipo.LAVORO', RISCALDAMENTO: 'modificaAllenamento.tipo.RISCALDAMENTO', DROP: 'modificaAllenamento.tipo.DROP' };

const DURATA_MAX = 600;          // like the server: over 10 hours it is not a workout
const MINUTI_GIORNO = 24 * 60;

/** Number from a form field; empty → null. */
const numero = (valore) => (String(valore ?? '').trim() === '' ? null : Number(valore));

/** Field content from a saved value (null → empty). */
const campo = (valore) => (valore == null ? '' : String(valore));

/** Is the instant in the future? Asked on save, not during render. */
const nelFuturo = (istante) => istante.getTime() > Date.now();

/** The exercises from the history as groups of editable rows. */
function gruppiDaSessione(sessione) {
  return sessione.esercizi.map(voce => ({
    esercizio: voce.esercizio,
    // Decided on opening: adding or removing rows does not change the fields shown
    cardio: eCardioNelloStorico(voce),
    serie: voce.serie.map(s => ({
      chiave: `s${s.id}`,
      id: s.id,
      tipo: s.tipo ?? 'LAVORO',
      peso: campo(s.pesoEffettivo),
      rep: campo(s.repEffettive),
      rpe: campo(s.rpe),
      minuti: campo(s.durataMinuti),
      livello: campo(s.livelloResistenza)
    }))
  }));
}

/** Comparable rows, to tell whether the sets have changed. */
const impronta = (gruppi) => JSON.stringify(gruppi.map(g => g.serie.map(s => [s.id, s.tipo, s.peso, s.rep, s.rpe, s.minuti, s.livello])));

/** First problem in the sets, to show before sending; null if all is well. */
function erroreSerie(gruppi, t) {
  for (const g of gruppi) {
    for (const [i, s] of g.serie.entries()) {
      const dove = { esercizio: nomeEsercizio(g.esercizio), numero: i + 1 };
      if (g.cardio) {
        const minuti = numero(s.minuti);
        if (minuti == null) return t('modificaAllenamento.errori.minutiMancanti', dove);
        if (!Number.isInteger(minuti) || minuti < 0 || minuti > DURATA_MAX) return t('modificaAllenamento.errori.minutiNonValidi', dove);
        const livello = numero(s.livello);
        if (livello != null && (!Number.isInteger(livello) || livello < 0)) return t('modificaAllenamento.errori.livelloNonValido', dove);
      } else {
        const peso = numero(s.peso);
        if (peso != null && !(peso >= 0 && peso <= 1000)) return t('modificaAllenamento.errori.pesoNonValido', dove);
        const rep = numero(s.rep);
        if (rep == null) return t('modificaAllenamento.errori.ripMancanti', dove);
        if (!Number.isInteger(rep) || rep < 0 || rep > 1000) return t('modificaAllenamento.errori.ripNonValide', dove);
      }
    }
  }
  return null;
}

/** The sets in the PATCH /sessioni/:id format, in the order they are shown. */
function serieDaInviare(gruppi) {
  return gruppi.flatMap(g => g.serie.map(s => ({
    ...(s.id ? { id: s.id } : { esercizioId: g.esercizio.id }),
    tipo: s.tipo,
    ...(g.cardio
      ? { durataMinuti: numero(s.minuti), livelloResistenza: numero(s.livello) }
      : { pesoEffettivo: numero(s.peso) ?? 0, repEffettive: numero(s.rep), rpe: numero(s.rpe) })
  })));
}

const CAMPO_SERIE = 'w-full min-w-0 px-2 py-2 text-sm text-center tabular-nums rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)] text-[var(--testo-primario)] border border-[var(--bordo)] focus:border-[var(--accent)] focus:outline-none';
const ETICHETTA = 'text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide';

export default function ModificaAllenamento({ sessione, onChiudi, onSalvato }) {
  const { t } = useLingua();
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

  // Local date and time → absolute instant, as when logging a past workout
  const inizio = new Date(`${data}T${ora}`);
  const minuti = numero(durata);
  const fine = !Number.isNaN(inizio.getTime()) && Number.isInteger(minuti)
    ? new Date(inizio.getTime() + minuti * 60000)
    : null;
  const giorniDopo = fine ? Math.round((new Date(aStringaData(fine)) - new Date(data)) / 86400000) : 0;

  // The end time and the duration are the same information: whoever remembers
  // when they finished should not have to count the minutes. An end before the
  // start falls on the next day (started at 23:30, finished at 1:00).
  const cambiaOraFine = (valore) => {
    if (!valore || !ora) return;
    const [hf, mf] = valore.split(':').map(Number);
    const [hi, mi] = ora.split(':').map(Number);
    setDurata(String((hf * 60 + mf - (hi * 60 + mi) + MINUTI_GIORNO) % MINUTI_GIORNO));
  };

  /** Only the changed fields: a PATCH that does not touch what the user left as it was. */
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
    if (Object.keys(modifiche()).length > 0 && !confirm(t('modificaAllenamento.uscireSenzaSalvare'))) return;
    onChiudi();
  };

  const salva = async () => {
    setErrore('');
    const corpo = modifiche();
    if (Object.keys(corpo).length === 0) { onChiudi(); return; }

    if (Number.isNaN(inizio.getTime())) { setErrore(t('modificaAllenamento.errori.dataOraNonValide')); return; }
    if ('durataMinuti' in corpo && (!Number.isInteger(minuti) || minuti < 1 || minuti > DURATA_MAX)) {
      setErrore(t('modificaAllenamento.errori.durataFuoriLimiti', { max: DURATA_MAX })); return;
    }
    if ('dataInizio' in corpo && nelFuturo(inizio)) { setErrore(t('modificaAllenamento.errori.inizioNelFuturo')); return; }
    if (('dataInizio' in corpo || 'durataMinuti' in corpo) && fine && nelFuturo(fine)) {
      setErrore(t('modificaAllenamento.errori.fineNelFuturo')); return;
    }
    if (corpo.minutiRiscaldamento != null && (!Number.isInteger(corpo.minutiRiscaldamento) || corpo.minutiRiscaldamento < 0)) {
      setErrore(t('modificaAllenamento.errori.riscaldamentoNonValido')); return;
    }
    if (corpo.serie) {
      const problema = erroreSerie(gruppi, t);
      if (problema) { setErrore(problema); return; }
      corpo.serie = serieDaInviare(gruppi);
    }
    if (corpo.dataInizio) corpo.dataInizio = corpo.dataInizio.toISOString();

    try {
      setSalvando(true);
      const risposta = await api.patch(`/sessioni/${sessione.id}`, corpo);
      onSalvato?.(risposta.dati, risposta);
    } catch (err) {
      setErrore(err?.message || t('modificaAllenamento.errori.salvataggio'));
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
    // Starts from the values of the last set: the same load is usually repeated
    cambiaGruppo(indice, g => {
      const ultima = g.serie[g.serie.length - 1];
      const valori = ultima
        ? { peso: ultima.peso, rep: ultima.rep, rpe: ultima.rpe, minuti: ultima.minuti, livello: ultima.livello }
        : { peso: '', rep: '', rpe: '', minuti: '', livello: '' };
      return { ...g, serie: [...g.serie, { chiave, id: null, tipo: 'LAVORO', ...valori }] };
    });
  };

  const durataSospetta = Number.isInteger(minuti) && minuti > DURATA_SOSPETTA_MINUTI;

  return (
    // Above the navigation bar (z-50), which would otherwise cover the buttons at the bottom
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
              <Pencil size={18} className="text-[var(--accent)] shrink-0" /> {t('modificaAllenamento.titolo')}
            </h3>
            <p className="text-xs text-[var(--testo-secondario)] mt-1 truncate">{titoloAllenamento(sessione)}</p>
          </div>
          <button onClick={chiudi} aria-label={t('comune.chiudi')} className="p-1.5 rounded text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-card-inner flex flex-col gap-4 overflow-y-auto">
          {durataSospetta && (
            <div className="flex items-start gap-3 p-3 rounded-[var(--raggio-md)] border border-[var(--avviso)]/40 bg-[var(--avviso-dim)]">
              <AlertTriangle size={18} className="text-[var(--avviso)] shrink-0 mt-0.5" />
              <p className="text-sm">
                <Testo t="modificaAllenamento.durataSospetta" valori={{ durata: formattaDurata(minuti) }} componenti={{ b: <strong /> }} />
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>{t('modificaAllenamento.giorno')}</span>
              <input type="date" value={data} max={aStringaData(new Date())} onChange={e => setData(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>{t('modificaAllenamento.oraInizio')}</span>
              <input type="time" value={ora} onChange={e => setOra(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>
                {t('modificaAllenamento.oraFine')}{giorniDopo > 0 && <span className="normal-case font-medium"> · {t('modificaAllenamento.giorniDopo', { count: giorniDopo })}</span>}
              </span>
              <input type="time" value={fine ? aStringaOra(fine) : ''} onChange={e => cambiaOraFine(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>{t('modificaAllenamento.durata')}</span>
              <input type="number" min="1" max={DURATA_MAX} inputMode="numeric" value={durata} onChange={e => setDurata(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETICHETTA}>{t('modificaAllenamento.riscaldamento')}</span>
              <input type="number" min="0" max="120" inputMode="numeric" value={riscaldamento} onChange={e => setRiscaldamento(e.target.value)} placeholder={t('modificaAllenamento.facoltativo')} className="campo-input" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={ETICHETTA}>{t('modificaAllenamento.note')}</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={t('modificaAllenamento.facoltative')} className="campo-input resize-y" />
          </label>

          <div className="flex flex-col gap-3">
            <h4 className={ETICHETTA}>{t('modificaAllenamento.serie')}</h4>
            {gruppi.some(g => !g.cardio) && (
              <p className="text-[11px] text-[var(--testo-terziario)] -mt-2">
                {t('modificaAllenamento.suggerimentoTipo')}
              </p>
            )}
            {gruppi.length === 0 && (
              <p className="text-xs text-[var(--testo-terziario)]">{t('modificaAllenamento.nessunaSerieRegistrata')}</p>
            )}
            {gruppi.map((g, gi) => {
              const colonne = g.cardio ? 'grid-cols-[1.5rem_1fr_1fr_2.25rem]' : 'grid-cols-[2rem_1fr_1fr_1fr_2.25rem]';
              return (
                <div key={g.esercizio.id} className="rounded-[var(--raggio-md)] border border-[var(--bordo-light)] p-3">
                  <p className="font-semibold text-sm mb-2 truncate">{nomeEsercizio(g.esercizio)}</p>
                  {g.serie.length > 0 && (
                    <div className={`grid ${colonne} gap-2 mb-1 text-[10px] font-semibold uppercase text-[var(--testo-terziario)] text-center`}>
                      <span>{t('modificaAllenamento.colonne.numero')}</span>
                      {g.cardio ? (<><span>{t('modificaAllenamento.colonne.minuti')}</span><span>{t('modificaAllenamento.colonne.livello')}</span></>) : (<><span>Kg</span><span>{t('modificaAllenamento.colonne.rip')}</span><span>RPE</span></>)}
                      <span />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {g.serie.map((s, i) => (
                      <div key={s.chiave} className={`grid ${colonne} gap-2 items-center`}>
                        {g.cardio ? (
                          <span className="text-xs text-center text-[var(--testo-terziario)]">{i + 1}</span>
                        ) : (
                          // Cardio has no warm-up or drop sets: only here can the number be tapped
                          <button type="button" onClick={() => aggiornaSerie(gi, s.chiave, 'tipo', PROSSIMO_TIPO[s.tipo])}
                                  aria-label={t('modificaAllenamento.cambiaTipoAria', { numero: i + 1, tipo: t(NOME_TIPO[s.tipo]) })}
                                  title={t('modificaAllenamento.cambiaTipoTitolo')}
                                  className="h-9 text-xs text-center rounded-[var(--raggio-sm)] border border-dashed border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)] transition-colors">
                            {s.tipo === 'RISCALDAMENTO' ? '🔥' : s.tipo === 'DROP' ? '↳' : g.serie.slice(0, i + 1).filter(x => x.tipo === 'LAVORO').length}
                          </button>
                        )}
                        {g.cardio ? (
                          <>
                            <input type="number" min="0" max={DURATA_MAX} inputMode="numeric" value={s.minuti}
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'minuti', e.target.value)}
                                   aria-label={t('modificaAllenamento.aria.minuti', { numero: i + 1 })} className={CAMPO_SERIE} />
                            <input type="number" min="0" inputMode="numeric" value={s.livello} placeholder="—"
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'livello', e.target.value)}
                                   aria-label={t('modificaAllenamento.aria.livello', { numero: i + 1 })} className={CAMPO_SERIE} />
                          </>
                        ) : (
                          <>
                            <input type="number" min="0" step="0.5" inputMode="decimal" value={s.peso} placeholder="0"
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'peso', e.target.value)}
                                   aria-label={t('modificaAllenamento.aria.peso', { numero: i + 1 })} className={CAMPO_SERIE} />
                            <input type="number" min="0" inputMode="numeric" value={s.rep}
                                   onChange={e => aggiornaSerie(gi, s.chiave, 'rep', e.target.value)}
                                   aria-label={t('modificaAllenamento.aria.rip', { numero: i + 1 })} className={CAMPO_SERIE} />
                            <select value={s.rpe} onChange={e => aggiornaSerie(gi, s.chiave, 'rpe', e.target.value)}
                                    aria-label={t('modificaAllenamento.aria.rpe', { numero: i + 1 })} className={CAMPO_SERIE}>
                              <option value="">—</option>
                              {Array.from({ length: 10 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </>
                        )}
                        <button onClick={() => eliminaSerie(gi, s.chiave)} aria-label={t('modificaAllenamento.aria.eliminaSerie', { numero: i + 1 })}
                                className="h-9 flex items-center justify-center rounded-[var(--raggio-sm)] text-[var(--testo-terziario)] hover:text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {g.serie.length === 0 && (
                    <p className="text-xs text-[var(--testo-terziario)]">{t('modificaAllenamento.esercizioRimosso')}</p>
                  )}
                  <button onClick={() => aggiungiSerie(gi)} className="mt-2 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 transition-colors">
                    <Plus size={14} /> {t('modificaAllenamento.aggiungiSerie')}
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
              {t('comune.annulla')}
            </button>
            <button
              onClick={salva}
              disabled={salvando}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={16} /> {salvando ? t('modificaAllenamento.salvo') : t('modificaAllenamento.salvaModifiche')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
