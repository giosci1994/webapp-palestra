// ============================================
// GymMaster — Workout Plans page
// List, creation and detail of plans
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api, scaricaFile } from '../config/api.js';
import { LIVELLI } from '../utils/costanti.js';
import { formattaData, nomeGruppo } from '../utils/formattatori.js';
import { useLingua } from '../hooks/useLingua.js';
import { motion, AnimatePresence } from 'framer-motion';
import CreaScheda from '../componenti/specifici/CreaScheda.jsx';


export default function SchedeAllenamento() {
  const { t } = useLingua();
  const { utente } = useAuth();
  const [schede, setSchede] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraCrea, setMostraCrea] = useState(false);
  const [filtro, setFiltro] = useState('mie'); // Default: "Le mie" (mine)

  // Multiple selection for the Word export: a weekly program is several plans
  // in a single document, one per session.
  const [modalitaSelezione, setModalitaSelezione] = useState(false);
  const [selezionate, setSelezionate] = useState([]);
  const [titoloDocumento, setTitoloDocumento] = useState('');
  const [scaricando, setScaricando] = useState(false);
  const [erroreDownload, setErroreDownload] = useState('');

  // The selection order decides which plan becomes Session 1, Session 2, etc.
  const alternaSelezione = (id) =>
    setSelezionate(prec => prec.includes(id) ? prec.filter(x => x !== id) : [...prec, id]);

  const chiudiSelezione = () => {
    setModalitaSelezione(false);
    setSelezionate([]);
    setTitoloDocumento('');
    setErroreDownload('');
  };

  const scaricaSelezionate = async () => {
    if (selezionate.length === 0) return;
    try {
      setErroreDownload('');
      setScaricando(true);
      const titolo = titoloDocumento.trim();
      const percorso = `/schede/docx?ids=${selezionate.join(',')}` +
        (titolo ? `&titolo=${encodeURIComponent(titolo)}` : '');
      await scaricaFile(percorso, `${titolo || t('schedeAllenamento.nomeFileProgramma')}.docx`);
      chiudiSelezione();
    } catch (err) {
      setErroreDownload(err?.message || t('schedeAllenamento.downloadFallito'));
    } finally {
      setScaricando(false);
    }
  };

  // Advanced filters
  const [ricercaNome, setRicercaNome] = useState('');
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [filtroDifficolta, setFiltroDifficolta] = useState('');

  useEffect(() => {
    api.get('/schede')
      .then(risposta => setSchede(risposta.dati || []))
      .catch(err => console.error('Errore caricamento schede:', err))
      .finally(() => setCaricamento(false));
  }, []);

  const eliminaScheda = async (id) => {
    if (!confirm(t('schedeAllenamento.confermaElimina'))) return;
    try {
      await api.delete(`/schede/${id}`);
      setSchede(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  // Extract the unique muscle groups from all the plans
  const gruppiDisponibili = useMemo(() => {
    const tutti = new Set();
    schede.forEach(s => {
      s.esercizi?.forEach(e => {
        if (e.esercizio?.gruppoMuscoloPrimario) tutti.add(e.esercizio.gruppoMuscoloPrimario);
      });
    });
    return [...tutti].sort();
  }, [schede]);

  const schedeFiltrate = useMemo(() => {
    return schede.filter(s => {
      // Tab filter
      if (filtro === 'mie' && s.creatoreId !== utente.id) return false;
      if (filtro === 'globali' && s.visibilita !== 'GLOBALE') return false;

      // Name filter
      if (ricercaNome && !s.titolo.toLowerCase().includes(ricercaNome.toLowerCase())) return false;

      // Muscle group filter
      if (filtroGruppo) {
        const gruppi = s.esercizi?.map(e => e.esercizio?.gruppoMuscoloPrimario) || [];
        if (!gruppi.includes(filtroGruppo)) return false;
      }

      // Difficulty filter
      if (filtroDifficolta && s.livello !== filtroDifficolta) return false;

      return true;
    });
  }, [schede, filtro, utente.id, ricercaNome, filtroGruppo, filtroDifficolta]);

  const filtriAttivi = ricercaNome || filtroGruppo || filtroDifficolta;

  return (
    <div className="py-2 flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">{t('schedeAllenamento.titolo')}</h1>
          <p className="text-[var(--testo-secondario)] text-sm mt-1">
            {t('schedeAllenamento.sottotitolo', { totale: schede.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!modalitaSelezione && (
            <button
              onClick={() => setModalitaSelezione(true)}
              title={t('schedeAllenamento.unisciSchede')}
              className="text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondary,var(--testo-secondario))] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              ⬇ Word
            </button>
          )}
          <button onClick={() => setMostraCrea(true)} className="btn-primario">
            {t('schedeAllenamento.nuovaScheda')}
          </button>
        </div>
      </div>

      {/* Selection bar for the export */}
      <AnimatePresence>
        {modalitaSelezione && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="glass-card p-card-inner">
              <p className="text-sm font-bold mb-1">{t('schedeAllenamento.esportaWord')}</p>
              <p className="text-xs text-[var(--testo-secondario)] mb-3">
                {t('schedeAllenamento.esportaIstruzioni')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={titoloDocumento}
                  onChange={e => setTitoloDocumento(e.target.value)}
                  placeholder={t('schedeAllenamento.titoloDocumento')}
                  className="campo-input flex-1 min-w-[200px] text-sm"
                />
                <button
                  onClick={scaricaSelezionate}
                  disabled={selezionate.length === 0 || scaricando}
                  className="btn-primario text-sm disabled:opacity-50"
                >
                  {scaricando
                    ? t('schedeAllenamento.preparo')
                    : selezionate.length ? t('schedeAllenamento.scaricaConteggio', { numero: selezionate.length }) : t('schedeAllenamento.scarica')}
                </button>
                <button onClick={chiudiSelezione} className="text-sm px-3 py-2 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">
                  {t('comune.annulla')}
                </button>
              </div>
              {erroreDownload && <p className="text-xs text-[var(--pericolo)] mt-2">{erroreDownload}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filter tab */}
      <div className="schede-tab-container">
        {[
          { id: 'tutte', label: t('schedeAllenamento.tab.tutte'), icona: '📋' },
          { id: 'mie', label: t('schedeAllenamento.tab.mie'), icona: '👤' },
          { id: 'globali', label: t('schedeAllenamento.tab.globali'), icona: '🌍' }
        ].map(f => (
          <button key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`schede-tab ${filtro === f.id ? 'attivo' : ''}`}>
            <span className="schede-tab-icona">{f.icona}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Advanced filters bar */}
      <div className="schede-filtri-avanzati">
        <div className="schede-filtro-ricerca">
          <span className="schede-filtro-icona">🔍</span>
          <input
            type="text"
            value={ricercaNome}
            onChange={e => setRicercaNome(e.target.value)}
            placeholder={t('schedeAllenamento.cercaPerNome')}
            className="schede-filtro-input"
          />
          {ricercaNome && (
            <button onClick={() => setRicercaNome('')} className="schede-filtro-clear">✕</button>
          )}
        </div>

        <select
          value={filtroGruppo}
          onChange={e => setFiltroGruppo(e.target.value)}
          className="schede-filtro-select"
        >
          <option value="">{t('schedeAllenamento.tuttiMuscoli')}</option>
          {gruppiDisponibili.map(g => <option key={g} value={g}>{nomeGruppo(g)}</option>)}
        </select>

        <select
          value={filtroDifficolta}
          onChange={e => setFiltroDifficolta(e.target.value)}
          className="schede-filtro-select"
        >
          <option value="">{t('schedeAllenamento.tutteDifficolta')}</option>
          <option value="BASE">{t(LIVELLI.BASE.label)}</option>
          <option value="INTERMEDIO">{t(LIVELLI.INTERMEDIO.label)}</option>
          <option value="AVANZATO">{t(LIVELLI.AVANZATO.label)}</option>
        </select>

        {filtriAttivi && (
          <button
            onClick={() => { setRicercaNome(''); setFiltroGruppo(''); setFiltroDifficolta(''); }}
            className="schede-filtro-reset"
          >
            {t('schedeAllenamento.reset')}
          </button>
        )}
      </div>

      {/* Plan list */}
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : schedeFiltrate.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-[var(--testo-secondario)]">
            {filtriAttivi
              ? t('schedeAllenamento.nessunaCorrispondenza')
              : (filtro === 'mie' ? t('schedeAllenamento.nessunaSchedaCreata') : t('schedeAllenamento.nessunaScheda'))}
          </p>
          {!filtriAttivi && (
            <button onClick={() => setMostraCrea(true)} className="btn-primario mt-4">
              {t('schedeAllenamento.creaPrimaScheda')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {schedeFiltrate.map((scheda, i) => (
              <motion.div
                key={scheda.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                onClick={modalitaSelezione ? () => alternaSelezione(scheda.id) : undefined}
                className={`glass-card p-card-inner flex flex-col gap-3 group transition-all min-w-0 w-full overflow-hidden ${
                  modalitaSelezione
                    ? `cursor-pointer ${selezionate.includes(scheda.id) ? 'border-[var(--accent)]' : 'hover:border-[var(--bordo-hover)]'}`
                    : 'hover:border-[var(--bordo-hover)]'
                }`}
              >
                {/* Plan header */}
                <div className="flex items-start justify-between">
                  {modalitaSelezione && (
                    <span
                      className="w-6 h-6 rounded-full shrink-0 mr-2 mt-0.5 flex items-center justify-center text-xs font-bold border"
                      style={selezionate.includes(scheda.id)
                        ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                        : { borderColor: 'var(--bordo-light)', color: 'var(--testo-terziario)' }}
                      aria-label={selezionate.includes(scheda.id) ? t('schedeAllenamento.selezionata') : t('schedeAllenamento.nonSelezionata')}
                    >
                      {selezionate.includes(scheda.id) ? selezionate.indexOf(scheda.id) + 1 : ''}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{scheda.titolo}</h3>
                    {scheda.descrizione && (
                      <p className="text-sm text-[var(--testo-secondario)] mt-0.5 line-clamp-2">
                        {scheda.descrizione}
                      </p>
                    )}
                  </div>
                  {scheda.visibilita === 'GLOBALE' && (
                    <span className="badge accent ml-2 shrink-0">{t('schedeAllenamento.globale')}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${LIVELLI[scheda.livello]?.colore || 'accent'}`}>
                    {LIVELLI[scheda.livello] ? t(LIVELLI[scheda.livello].label) : scheda.livello}
                  </span>
                  <span className="text-xs text-[var(--testo-terziario)]">
                    {t('comune.esercizi', { count: scheda.esercizi?.length || 0 })}
                  </span>
                  <span className="text-xs text-[var(--testo-terziario)]">
                    •  {t('schedeAllenamento.sessioni', { count: scheda._count?.sessioni || 0 })}
                  </span>
                </div>

                {/* Muscle groups */}
                {scheda.esercizi?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(scheda.esercizi.map(e => e.esercizio?.gruppoMuscoloPrimario))].filter(Boolean).slice(0, 4).map(g => (
                      <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">
                        {nomeGruppo(g)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--bordo)]">
                  <span className="text-xs text-[var(--testo-terziario)]">
                    {t('schedeAllenamento.creatoDa', { nome: scheda.creatore?.nome ?? '', data: formattaData(scheda.creatoIl) })}
                  </span>
                  <div className="flex gap-2">
                    {!modalitaSelezione && scheda.creatoreId === utente.id && (
                      <button onClick={() => eliminaScheda(scheda.id)}
                        className="text-xs text-[var(--pericolo)] opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('comune.elimina')}
                      </button>
                    )}
                    {!modalitaSelezione && (
                      <Link to={`/schede/${scheda.id}`}
                        className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
                        {t('schedeAllenamento.dettagli')}
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}



      {/* Creation modal */}
      <AnimatePresence>
        {mostraCrea && (
          <CreaScheda
            onChiudi={() => setMostraCrea(false)}
            onCreata={(nuova) => {
              setSchede(prev => [nuova, ...prev]);
              setMostraCrea(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
