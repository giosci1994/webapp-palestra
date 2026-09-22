// ============================================
// GymMaster — Storico Allenamenti
// Visualizzazione dettagliata degli allenamenti passati
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { formattaData, formattaDurata, nomeEsercizio} from '../utils/formattatori.js';
import { formattaPeso, formattaNumero } from '../utils/formattatori.js';
import { GRUPPI_MUSCOLARI, RPE_LABELS } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import AggiungiAllenamentoPassato from '../componenti/specifici/AggiungiAllenamentoPassato.jsx';

export default function StoricoAllenamenti() {
  const [sessioni, setSessioni] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginazione, setPaginazione] = useState(null);
  const [schedaFiltro, setSchedaFiltro] = useState('');
  const [schedeDisponibili, setSchedeDisponibili] = useState([]);
  const [sessioneAperta, setSessioneAperta] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [mostraPassato, setMostraPassato] = useState(false);
  const [confermaPassato, setConfermaPassato] = useState('');

  // Carica le schede disponibili per il filtro
  useEffect(() => {
    api.get('/schede')
      .then(r => setSchedeDisponibili(r.dati || []))
      .catch(() => {});
  }, []);

  // Carica storico sessioni
  useEffect(() => {
    caricaStorico();
  }, [pagina, schedaFiltro]);

  const caricaStorico = async () => {
    try {
      setCaricamento(true);
      const query = `?pagina=${pagina}&limite=15${schedaFiltro ? `&schedaId=${schedaFiltro}` : ''}`;
      const risposta = await api.get(`/sessioni/storico${query}`);
      setSessioni(risposta.dati || []);
      setPaginazione(risposta.paginazione || null);
    } catch (err) {
      console.error('Errore caricamento storico:', err);
    } finally {
      setCaricamento(false);
    }
  };

  const eliminaSessione = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questa sessione? I dati saranno persi.')) return;
    try {
      setEliminando(id);
      await api.delete(`/sessioni/${id}`);
      setSessioni(prev => prev.filter(s => s.id !== id));
      setSessioneAperta(null);
      // Ricarica per aggiornare la paginazione
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
          <h1 className="text-2xl font-bold">Storico Allenamenti</h1>
          <p className="text-[var(--testo-secondario)] text-sm mt-1">
            Rivedi i dettagli di ogni sessione passata
            {paginazione && ` · ${paginazione.totale} sessioni totali`}
          </p>
        </div>
        <button
          onClick={() => setMostraPassato(true)}
          title="Registra una seduta gia' svolta, anche senza connessione sul momento"
          className="shrink-0 py-2 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-lg transition-colors shadow-[var(--ombra-accent)]"
        >
          ＋ Già fatto
        </button>
      </div>

      {confermaPassato && (
        <div className="glass-card p-card-inner mb-4 border border-[var(--successo,#22c55e)]">
          <p className="text-sm" style={{ color: 'var(--successo, #22c55e)' }}>{confermaPassato}</p>
        </div>
      )}

      {/* Filtro per scheda — dropdown compatto */}
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
          <option value="">Tutte le schede</option>
          {schedeDisponibili.map(s => (
            <option key={s.id} value={s.id}>{s.titolo}</option>
          ))}
        </select>
      </div>

      {/* Lista sessioni */}
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : sessioni.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-3">📜</div>
          <p className="text-[var(--testo-secondario)]">
            {schedaFiltro ? 'Nessuna sessione trovata per questa scheda' : 'Nessun allenamento completato ancora'}
          </p>
          <p className="text-xs text-[var(--testo-terziario)] mt-2">
            Completa un allenamento per vederlo qui
          </p>
        </div>
      ) : (
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
                      <h3 className="font-semibold text-lg truncate">{sessione.scheda.titolo}</h3>
                    </div>
                    <p className="text-xs text-[var(--testo-terziario)]">
                      {formattaData(sessione.dataInizio, true)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); eliminaSessione(sessione.id); }}
                    disabled={eliminando === sessione.id}
                    className="text-xs text-[var(--pericolo)] opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-[var(--pericolo-dim)]"
                  >
                    {eliminando === sessione.id ? '...' : '🗑️'}
                  </button>
                </div>

                {/* KPI riga */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]">
                    <span className="text-sm">⏱</span>
                    <div>
                      <p className="text-sm font-bold">{formattaDurata(sessione.durataMinuti)}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">Durata</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]">
                    <span className="text-sm">📦</span>
                    <div>
                      <p className="text-sm font-bold">{formattaPeso(sessione.volumeTotaleKg)} kg</p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">Volume</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-[var(--raggio-sm)] bg-[var(--bg-terziario)]">
                    <span className="text-sm">💪</span>
                    <div>
                      <p className="text-sm font-bold">{sessione.esercizi.length}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)]">Esercizi</p>
                    </div>
                  </div>
                </div>

                {/* Anteprima esercizi */}
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

                {/* Freccia dettaglio */}
                <div className="text-right mt-2">
                  <span className="text-xs font-semibold text-[var(--accent)] group-hover:text-[var(--accent-hover)]">
                    Vedi dettagli →
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Paginazione */}
          {paginazione && paginazione.pagine > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="px-4 py-2 rounded-[var(--raggio-md)] text-sm font-medium bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prec.
              </button>
              <span className="text-sm text-[var(--testo-secondario)] px-3">
                {pagina} / {paginazione.pagine}
              </span>
              <button
                onClick={() => setPagina(p => Math.min(paginazione.pagine, p + 1))}
                disabled={pagina >= paginazione.pagine}
                className="px-4 py-2 rounded-[var(--raggio-md)] text-sm font-medium bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Succ. →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drawer Dettaglio Sessione */}
      <AnimatePresence>
        {sessioneAperta && (
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
              {/* Header drawer */}
              <div className="px-card-inner py-5 border-b border-[var(--bordo)] flex items-center justify-between sticky top-0 bg-[var(--bg-primario)]/90 backdrop-blur-md z-10">
                <div>
                  <h3 className="font-bold text-lg">{sessioneAperta.scheda.titolo}</h3>
                  <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
                    {formattaData(sessioneAperta.dataInizio, true)}
                  </p>
                </div>
                <button
                  onClick={() => setSessioneAperta(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-terziario)] hover:bg-[var(--bordo-hover)] transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Contenuto drawer con scroll */}
              <div className="px-card-inner py-5 overflow-y-auto flex flex-col gap-4">
                {/* KPI sessione */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    <p className="text-lg font-bold testo-gradient">{formattaDurata(sessioneAperta.durataMinuti)}</p>
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">Durata</p>
                  </div>
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    <p className="text-lg font-bold testo-gradient">{formattaPeso(sessioneAperta.volumeTotaleKg)} kg</p>
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">Volume</p>
                  </div>
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-center">
                    <p className="text-lg font-bold testo-gradient">{sessioneAperta.serieCompletate}</p>
                    <p className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wide">Serie</p>
                  </div>
                </div>

                {/* Note finali */}
                {sessioneAperta.noteFinali && (
                  <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] border-l-3 border-[var(--accent)]">
                    <p className="text-xs text-[var(--testo-terziario)] mb-1">📝 Note</p>
                    <p className="text-sm">{sessioneAperta.noteFinali}</p>
                  </div>
                )}

                {/* Lista esercizi con dettaglio serie */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-semibold text-[var(--testo-terziario)] uppercase tracking-wider">
                    Dettaglio Esercizi
                  </h4>

                  {sessioneAperta.esercizi.map((es, idx) => {
                    const gruppo = GRUPPI_MUSCOLARI[es.esercizio.gruppoMuscoloPrimario];
                    const isCardio = es.esercizio.gruppoMuscoloPrimario?.toLowerCase() === 'cardio';

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="rounded-[var(--raggio-md)] border border-[var(--bordo)] overflow-hidden"
                      >
                        {/* Header esercizio */}
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
                              {es.esercizio.gruppoMuscoloPrimario} · {es.serie.length} serie
                            </p>
                          </div>
                        </div>

                        {/* Tabella serie */}
                        <div className="px-4 pb-3 pt-2">
                          {/* Header tabella */}
                          <div className={`grid ${isCardio ? 'grid-cols-3' : 'grid-cols-4'} gap-1 mb-1`}>
                            <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">Serie</span>
                            {isCardio ? (
                              <>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">Durata</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">Livello</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">Peso</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">Rep</span>
                                <span className="text-[10px] font-semibold text-[var(--testo-terziario)] uppercase text-center">RPE</span>
                              </>
                            )}
                          </div>

                          {/* Righe serie */}
                          {es.serie.map((serie, sIdx) => (
                            <div
                              key={sIdx}
                              className={`grid ${isCardio ? 'grid-cols-3' : 'grid-cols-4'} gap-1 py-2.5 ${
                                sIdx < es.serie.length - 1 ? 'border-b border-[var(--bordo)]' : ''
                              }`}
                            >
                              <span className="text-sm text-center text-[var(--testo-secondario)]">
                                {serie.serieNumero}
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

                {/* Bottone elimina sessione */}
                <button
                  onClick={() => eliminaSessione(sessioneAperta.id)}
                  disabled={eliminando === sessioneAperta.id}
                  className="mt-2 w-full py-3 rounded-[var(--raggio-md)] text-sm font-medium text-[var(--pericolo)] bg-[var(--pericolo-dim)] hover:bg-[var(--pericolo)] hover:text-white transition-all disabled:opacity-50"
                >
                  {eliminando === sessioneAperta.id ? 'Eliminazione...' : '🗑️ Elimina Sessione'}
                </button>
              </div>
            </motion.div>
          </motion.div>
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
              setConfermaPassato(
                record === 0 ? 'Allenamento registrato nello storico.'
                  : record === 1 ? 'Allenamento registrato — e hai un nuovo record personale!'
                  : `Allenamento registrato — e hai ${record} nuovi record personali!`
              );
              setTimeout(() => setConfermaPassato(''), 6000);
              setPagina(1);
              caricaStorico();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
