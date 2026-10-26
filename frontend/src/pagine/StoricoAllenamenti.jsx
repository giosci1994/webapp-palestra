// ============================================
// GymMaster — Workout History
// Detailed view of past workouts
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { formattaData, formattaDurata, nomeEsercizio, nomeGruppo, eCardioNelloStorico, titoloAllenamento } from '../utils/formattatori.js';
import { formattaPeso } from '../utils/formattatori.js';
import { diLavoro } from '../utils/tipiSerie.js';
import { GRUPPI_MUSCOLARI, DURATA_SOSPETTA_MINUTI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import AggiungiAllenamentoPassato from '../componenti/specifici/AggiungiAllenamentoPassato.jsx';
import ModificaAllenamento from '../componenti/specifici/ModificaAllenamento.jsx';

/**
 * It can still be resumed (PATCH /sessioni/:id/riapri): the server says until
 * when, 30 minutes after "Termina" or until the end of the day for a workout
 * it closed because it was left open.
 */
const riprendibile = (sessione) => Boolean(sessione.riapribileFinoA) && Date.now() < new Date(sessione.riapribileFinoA).getTime();

/** Duration of a workout left open by mistake: it skews the statistics and needs fixing. */
const durataSospetta = (sessione) => sessione.durataMinuti > DURATA_SOSPETTA_MINUTI;

export default function StoricoAllenamenti() {
  const { t } = useLingua();
  const [sessioni, setSessioni] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [paginazione, setPaginazione] = useState(null);
  const [schedaFiltro, setSchedaFiltro] = useState('');
  const [schedeDisponibili, setSchedeDisponibili] = useState([]);
  const [sessioneAperta, setSessioneAperta] = useState(null);
  const [inModifica, setInModifica] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [mostraPassato, setMostraPassato] = useState(false);
  const [conferma, setConferma] = useState('');
  const [salvandoScheda, setSalvandoScheda] = useState(false);
  const [riprendendo, setRiprendendo] = useState(false);
  const naviga = useNavigate();

  const mostraConferma = (testo) => {
    setConferma(testo);
    setTimeout(() => setConferma(''), 6000);
  };

  // The exercises done that day, with sets and reps, become a new personal
  // plan: it opens right away, to rename it or touch it up
  const salvaComeScheda = async (sessione) => {
    try {
      setSalvandoScheda(true);
      const risposta = await api.post(`/sessioni/${sessione.id}/scheda`, {});
      naviga(`/schede/${risposta.dati.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSalvandoScheda(false);
    }
  };

  // Closed by mistake a moment ago: it goes back to in progress and the workout
  // screen reopens, rebuilding from the server the point where you were
  const riprendiAllenamento = async (sessione) => {
    try {
      setRiprendendo(true);
      await api.patch(`/sessioni/${sessione.id}/riapri`);
      naviga(`/allenamento/${sessione.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setRiprendendo(false);
    }
  };

  // Load the plans available for the filter
  useEffect(() => {
    api.get('/schede')
      .then(r => setSchedeDisponibili(r.dati || []))
      .catch(() => {});
  }, []);

  // The page shown: changing page or filter brings the spinner back, while
  // after an edit the list updates in place
  const query = `?pagina=${pagina}&limite=15${schedaFiltro ? `&schedaId=${schedaFiltro}` : ''}`;
  const [caricatoPer, setCaricatoPer] = useState(null);
  const caricamento = caricatoPer !== query;

  const caricaStorico = useCallback(() => api.get(`/sessioni/storico${query}`)
    .then(risposta => {
      setSessioni(risposta.dati || []);
      setPaginazione(risposta.paginazione || null);
    })
    .catch(err => console.error('Error loading history:', err))
    .finally(() => setCaricatoPer(query)), [query]);

  useEffect(() => { caricaStorico(); }, [caricaStorico]);

  const eliminaSessione = async (id) => {
    if (!confirm(t('storicoAllenamenti.eliminaConferma'))) return;
    try {
      setEliminando(id);
      await api.delete(`/sessioni/${id}`);
      setSessioni(prev => prev.filter(s => s.id !== id));
      setSessioneAperta(null);
      // Reload to update the pagination
      caricaStorico();
    } catch (err) {
      alert(err.message);
    } finally {
      setEliminando(null);
    }
  };

  const cambiaFiltro = (schedaId) => {
    setSchedaFiltro(schedaId);
    setPagina(1);
  };

  return (
    <div className="py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('storicoAllenamenti.titolo')}</h1>
          <p className="text-[var(--testo-secondario)] text-sm mt-1">
            {paginazione
              ? t('storicoAllenamenti.sottotitoloConTotale', { count: paginazione.totale })
              : t('storicoAllenamenti.sottotitolo')}
          </p>
        </div>
        <button
          onClick={() => setMostraPassato(true)}
          title={t('storicoAllenamenti.giaFattoTitolo')}
          className="shrink-0 py-2 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-lg transition-colors shadow-[var(--ombra-accent)]"
        >
          {t('storicoAllenamenti.giaFatto')}
        </button>
      </div>

      {conferma && (
        <div className="glass-card p-card-inner mb-4 border border-[var(--successo,#22c55e)]">
          <p className="text-sm" style={{ color: 'var(--successo, #22c55e)' }}>{conferma}</p>
        </div>
      )}

      {/* Filter by plan — compact dropdown */}
      <div className="mb-4">
        <select
          value={schedaFiltro}
          onChange={(e) => cambiaFiltro(e.target.value)}
          className="w-full px-4 py-2.5 rounded-[var(--raggio-md)] text-sm font-medium bg-[var(--bg-terziario)] text-[var(--testo-primario)] border border-[var(--bordo)] focus:border-[var(--accent)] focus:outline-none transition-all appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center'
          }}
        >
          <option value="">{t('storicoAllenamenti.tutteLeSchede')}</option>
          {schedeDisponibili.map(s => (
            <option key={s.id} value={s.id}>{s.titolo}</option>
          ))}
        </select>
      </div>

      {/* Workout list */}
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : sessioni.length === 0 && !caricamento ? (
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-3">📜</div>
          <p className="text-[var(--testo-secondario)]">
            {schedaFiltro ? t('storicoAllenamenti.vuotoConFiltro') : t('storicoAllenamenti.vuoto')}
          </p>
          <p className="text-xs text-[var(--testo-terziario)] mt-2">
            {t('storicoAllenamenti.vuotoSuggerimento')}
          </p>
        </div>
      ) : !caricamento ? (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {sessioni.map((sessione, i) => (
              <motion.div
                key={sessione.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSessioneAperta(sessione)}
                className="glass-card p-card-inner cursor-pointer group hover:border-[var(--bordo-hover)] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">📋</span>
                      <h3 className="font-semibold text-lg truncate">{titoloAllenamento(sessione)}</h3>
                    </div>
                    <p className="text-xs text-[var(--testo-terziario)]">
                      {formattaData(sessione.dataInizio, true)}
                    </p>
                  </div>
                  {/* Always visible: shown only on hover, it never appeared on a phone */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); eliminaSessione(sessione.id); }}
                    disabled={eliminando === sessione.id}
                    aria-label={t('storicoAllenamenti.eliminaAllenamento')}
                    title={t('storicoAllenamenti.eliminaAllenamento')}
                    className="shrink-0 w-11 h-11 -mt-2 -mr-2 flex items-center justify-center rounded-full text-[var(--pericolo)] hover:bg-[var(--pericolo-dim)] transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-2">
                  <div
                    className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]"
                    title={durataSospetta(sessione) ? t('storicoAllenamenti.durataInsolitaTitolo') : undefined}
                  >
                    <span className="text-sm">{durataSospetta(sessione) ? '⚠️' : '⏱'}</span>
                    <div>
                      <p className="text-sm font-bold" style={durataSospetta(sessione) ? { color: 'var(--avviso)' } : undefined}>
                        {formattaDurata(sessione.durataMinuti)}
                      </p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">{t('storicoAllenamenti.durata')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]">
                    <span className="text-sm">📦</span>
                    <div>
                      <p className="text-sm font-bold">{formattaPeso(sessione.volumeTotaleKg)} kg</p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">{t('storicoAllenamenti.volume')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]">
                    <span className="text-sm">💪</span>
                    <div>
                      <p className="text-sm font-bold">{sessione.esercizi.length}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">{t('storicoAllenamenti.esercizi')}</p>
                    </div>
                  </div>
                </div>

                {/* Exercise preview */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {sessione.esercizi.slice(0, 4).map((es, idx) => (
                    <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
                      {nomeEsercizio(es.esercizio)}
                    </span>
                  ))}
                  {sessione.esercizi.length > 4 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-terziario)]">
                      +{sessione.esercizi.length - 4}
                    </span>
                  )}
                </div>

                {/* Detail arrow */}
                <div className="text-right mt-2">
                  <span className="text-xs font-semibold text-[var(--accent)] group-hover:text-[var(--accent-hover)]">
                    {t('storicoAllenamenti.vediDettagli')}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Pagination */}
          {paginazione && paginazione.pagine > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="px-4 py-2 rounded-[var(--raggio-md)] text-sm font-medium bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {t('storicoAllenamenti.precedente')}
              </button>
              <span className="text-sm text-[var(--testo-secondario)] px-3">
                {pagina} / {paginazione.pagine}
              </span>
              <button
                onClick={() => setPagina(p => Math.min(paginazione.pagine, p + 1))}
                disabled={pagina >= paginazione.pagine}
                className="px-4 py-2 rounded-[var(--raggio-md)] text-sm font-medium bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {t('storicoAllenamenti.successiva')}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Workout Detail Drawer (makes way for the editor while editing) */}
      <AnimatePresence>
        {sessioneAperta && !inModifica && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setSessioneAperta(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="glass-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Drawer header */}
              <div className="px-card-inner py-5 border-b border-[var(--bordo)] flex items-center justify-between sticky top-0 bg-[var(--bg-primario)]/90 backdrop-blur-md z-10">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg truncate">{titoloAllenamento(sessioneAperta)}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
                    {formattaData(sessioneAperta.dataInizio, true)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setInModifica(true)}
                    className="h-8 px-3 flex items-center gap-1.5 rounded-full text-xs font-semibold bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                  >
                    {t('storicoAllenamenti.modifica')}
                  </button>
                  <button
                    onClick={() => setSessioneAperta(null)}
                    aria-label={t('comune.chiudi')}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-terziario)] hover:bg-[var(--bordo-hover)] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Drawer content with scroll */}
              <div className="px-card-inner py-5 overflow-y-auto flex flex-col gap-4">
                {/* Workout KPIs */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    {durataSospetta(sessioneAperta) ? (
                      <p className="text-lg font-bold" style={{ color: 'var(--avviso)' }}>{formattaDurata(sessioneAperta.durataMinuti)}</p>
                    ) : (
                      <p className="text-lg font-bold testo-gradient">{formattaDurata(sessioneAperta.durataMinuti)}</p>
                    )}
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{t('storicoAllenamenti.durata')}</p>
                  </div>
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    <p className="text-lg font-bold testo-gradient">{formattaPeso(sessioneAperta.volumeTotaleKg)} kg</p>
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{t('storicoAllenamenti.volume')}</p>
                  </div>
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    <p className="text-lg font-bold testo-gradient">{sessioneAperta.serieCompletate}</p>
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">{t('storicoAllenamenti.serie')}</p>
                  </div>
                </div>

                {/* Workout left open: the fix is one tap away */}
                {durataSospetta(sessioneAperta) && (
                  <div className="flex items-center gap-3 p-3 rounded-[var(--raggio-md)] border border-[var(--avviso)]/40 bg-[var(--avviso-dim)]">
                    <span className="text-lg">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--avviso)' }}>{t('storicoAllenamenti.durataInsolita')}</p>
                      <p className="text-xs text-[var(--testo-secondario)] mt-0.5">
                        {t('storicoAllenamenti.durataInsolitaSpiegazione')}
                      </p>
                    </div>
                    <button
                      onClick={() => setInModifica(true)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-black transition-opacity hover:opacity-90"
                      style={{ background: 'var(--avviso)' }}
                    >
                      {t('storicoAllenamenti.correggi')}
                    </button>
                  </div>
                )}

                {/* Final notes */}
                {sessioneAperta.noteFinali && (
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] border-l-3 border-[var(--accent)]">
                    <p className="text-xs text-[var(--testo-terziario)] mb-1">{t('storicoAllenamenti.note')}</p>
                    <p className="text-sm">{sessioneAperta.noteFinali}</p>
                  </div>
                )}

                {/* Exercise list with set details */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-semibold text-[var(--testo-terziario)] uppercase tracking-wider">
                    {t('storicoAllenamenti.dettaglioEsercizi')}
                  </h4>

                  {sessioneAperta.esercizi.map((es, idx) => {
                    const gruppo = GRUPPI_MUSCOLARI[es.esercizio.gruppoMuscoloPrimario];
                    const isCardio = eCardioNelloStorico(es);

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="rounded-[var(--raggio-md)] border border-[var(--bordo)] overflow-hidden"
                      >
                        {/* Exercise header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-terziario)]">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                            style={{
                              background: (gruppo?.colore || 'var(--accent)') + '22',
                              color: gruppo?.colore || 'var(--accent)'
                            }}
                          >
                            {gruppo?.emoji || '💪'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{nomeEsercizio(es.esercizio)}</p>
                            <p className="text-[10px] text-[var(--testo-terziario)]">
                              {t('storicoAllenamenti.gruppoESerie', { gruppo: nomeGruppo(es.esercizio.gruppoMuscoloPrimario), count: es.serie.filter(diLavoro).length })}
                            </p>
                          </div>
                        </div>

                        {/* Sets table */}
                        <div className="px-4 pb-3 pt-2">
                          {/* Table header */}
                          <div className={`grid ${isCardio ? 'grid-cols-3' : 'grid-cols-4'} gap-1 mb-1`}>
                            <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">{t('storicoAllenamenti.colonne.serie')}</span>
                            {isCardio ? (
                              <>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">{t('storicoAllenamenti.colonne.durata')}</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">{t('storicoAllenamenti.colonne.livello')}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">{t('storicoAllenamenti.colonne.peso')}</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">{t('storicoAllenamenti.colonne.rip')}</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">RPE</span>
                              </>
                            )}
                          </div>

                          {/* Set rows */}
                          {es.serie.map((serie, sIdx) => (
                            <div
                              key={sIdx}
                              className={`grid ${isCardio ? 'grid-cols-3' : 'grid-cols-4'} gap-1 py-2.5 ${
                                sIdx < es.serie.length - 1 ? 'border-b border-[var(--bordo)]' : ''
                              }`}
                            >
                              <span className="text-sm text-center text-[var(--testo-secondario)]"
                                    title={serie.tipo === 'RISCALDAMENTO' ? t('storicoAllenamenti.riscaldamento') : serie.tipo === 'DROP' ? t('storicoAllenamenti.dropDellaSerie', { numero: serie.serieNumero }) : undefined}>
                                {serie.tipo === 'RISCALDAMENTO' ? '🔥' : serie.tipo === 'DROP' ? '↳' : serie.serieNumero}
                              </span>
                              {isCardio ? (
                                <>
                                  <span className="text-sm font-medium text-center">
                                    {serie.durataMinuti} min
                                  </span>
                                  <span className="text-sm font-medium text-center">
                                    {serie.livelloResistenza || '—'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-medium text-center">
                                    {formattaPeso(serie.pesoEffettivo)} kg
                                  </span>
                                  <span className="text-sm font-medium text-center">
                                    {serie.repEffettive}
                                  </span>
                                  <span className="text-xs text-center text-[var(--testo-terziario)]">
                                    {serie.rpe ? `${serie.rpe}` : '—'}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Resume: right after finishing, or the same day if the server closed it */}
                {riprendibile(sessioneAperta) && (
                  <button
                    onClick={() => riprendiAllenamento(sessioneAperta)}
                    disabled={riprendendo}
                    className="w-full py-3 rounded-[var(--raggio-md)] text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {riprendendo
                      ? t('storicoAllenamenti.unAttimo')
                      : t(sessioneAperta.chiusaAutomaticamente ? 'storicoAllenamenti.riprendiChiusoDaSolo' : 'storicoAllenamenti.riprendi')}
                  </button>
                )}

                {/* Save as plan */}
                {sessioneAperta.serieCompletate > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => salvaComeScheda(sessioneAperta)}
                      disabled={salvandoScheda}
                      className="w-full py-3 rounded-[var(--raggio-md)] text-sm font-semibold text-[var(--accent)] bg-[var(--accent-dim)] hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-50"
                    >
                      {salvandoScheda ? t('storicoAllenamenti.salvataggio') : t('storicoAllenamenti.salvaComeScheda')}
                    </button>
                    <p className="text-[11px] text-[var(--testo-terziario)] text-center mt-1.5">
                      {t('storicoAllenamenti.salvaComeSchedaSpiegazione')}
                    </p>
                  </div>
                )}

                {/* Delete workout button */}
                <button
                  onClick={() => eliminaSessione(sessioneAperta.id)}
                  disabled={eliminando === sessioneAperta.id}
                  className="mt-2 w-full py-3 rounded-[var(--raggio-md)] text-sm font-medium text-[var(--pericolo)] bg-[var(--pericolo-dim)] hover:bg-[var(--pericolo)] hover:text-white transition-all disabled:opacity-50"
                >
                  {eliminando === sessioneAperta.id ? t('storicoAllenamenti.eliminazione') : t('storicoAllenamenti.eliminaSessione')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sessioneAperta && inModifica && (
          <ModificaAllenamento
            sessione={sessioneAperta}
            onChiudi={() => setInModifica(false)}
            onSalvato={(aggiornata) => {
              // Back to the detail, already with the corrected values
              setSessioneAperta(aggiornata);
              setInModifica(false);
              mostraConferma(t('storicoAllenamenti.aggiornato'));
              // Reload: if the date changed, the place in the list changes too
              caricaStorico();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mostraPassato && (
          <AggiungiAllenamentoPassato
            schede={schedeDisponibili}
            onChiudi={() => setMostraPassato(false)}
            onSalvato={(risposta) => {
              setMostraPassato(false);
              const record = risposta?.recordPersonali?.length || 0;
              mostraConferma(
                record === 0 ? t('storicoAllenamenti.registrato') : t('storicoAllenamenti.registratoConRecord', { count: record })
              );
              setPagina(1);
              caricaStorico();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
