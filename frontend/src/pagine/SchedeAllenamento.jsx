// ============================================
// GymMaster — Pagina Schede Allenamento
// Lista, creazione e dettaglio schede
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api, scaricaFile } from '../config/api.js';
import { LIVELLI } from '../utils/costanti.js';
import { formattaData } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import CreaScheda from '../componenti/specifici/CreaScheda.jsx';


export default function SchedeAllenamento() {
  const { utente } = useAuth();
  const [schede, setSchede] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraCrea, setMostraCrea] = useState(false);
  const [filtro, setFiltro] = useState('mie'); // Default: "Le mie"

  // Selezione multipla per l'esportazione in Word: un programma settimanale
  // sono piu' schede in un unico documento, una per sessione.
  const [modalitaSelezione, setModalitaSelezione] = useState(false);
  const [selezionate, setSelezionate] = useState([]);
  const [titoloDocumento, setTitoloDocumento] = useState('');
  const [scaricando, setScaricando] = useState(false);
  const [erroreDownload, setErroreDownload] = useState('');

  // L'ordine di selezione decide quale scheda diventa la Sessione 1, la 2, ecc.
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
      await scaricaFile(percorso, `${titolo || 'programma'}.docx`);
      chiudiSelezione();
    } catch (err) {
      setErroreDownload(err?.message || 'Download non riuscito');
    } finally {
      setScaricando(false);
    }
  };

  // Filtri avanzati
  const [ricercaNome, setRicercaNome] = useState('');
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [filtroDifficolta, setFiltroDifficolta] = useState('');

  useEffect(() => { caricaSchede(); }, []);

  const caricaSchede = async () => {
    try {
      setCaricamento(true);
      const risposta = await api.get('/schede');
      setSchede(risposta.dati || []);
    } catch (err) {
      console.error('Errore caricamento schede:', err);
    } finally {
      setCaricamento(false);
    }
  };

  const eliminaScheda = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questa scheda?')) return;
    try {
      await api.delete(`/schede/${id}`);
      setSchede(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  // Estrai gruppi muscolari unici da tutte le schede
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
      // Filtro tab
      if (filtro === 'mie' && s.creatoreId !== utente.id) return false;
      if (filtro === 'globali' && s.visibilita !== 'GLOBALE') return false;

      // Filtro nome
      if (ricercaNome && !s.titolo.toLowerCase().includes(ricercaNome.toLowerCase())) return false;

      // Filtro gruppo muscolare
      if (filtroGruppo) {
        const gruppi = s.esercizi?.map(e => e.esercizio?.gruppoMuscoloPrimario) || [];
        if (!gruppi.includes(filtroGruppo)) return false;
      }

      // Filtro difficoltà
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
          <h1 className="text-2xl font-bold">Gestione Schede</h1>
          <p className="text-[var(--testo-secondario)] text-sm mt-1">
            Crea, modifica e gestisci le tue schede di allenamento ({schede.length} totali)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!modalitaSelezione && (
            <button
              onClick={() => setModalitaSelezione(true)}
              title="Unisci piu' schede in un unico documento Word"
              className="text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--bordo-light)] text-[var(--testo-secondary,var(--testo-secondario))] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              ⬇ Word
            </button>
          )}
          <button onClick={() => setMostraCrea(true)} className="btn-primario">
            ＋ Nuova Scheda
          </button>
        </div>
      </div>

      {/* Barra selezione per l'esportazione */}
      <AnimatePresence>
        {modalitaSelezione && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="glass-card p-card-inner">
              <p className="text-sm font-bold mb-1">Esporta in Word</p>
              <p className="text-xs text-[var(--testo-secondario)] mb-3">
                Tocca le schede da includere: diventeranno Sessione 1, 2, 3… nell'ordine in cui le scegli.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={titoloDocumento}
                  onChange={e => setTitoloDocumento(e.target.value)}
                  placeholder="Titolo del documento (facoltativo)"
                  className="campo-input flex-1 min-w-[200px] text-sm"
                />
                <button
                  onClick={scaricaSelezionate}
                  disabled={selezionate.length === 0 || scaricando}
                  className="btn-primario text-sm disabled:opacity-50"
                >
                  {scaricando ? 'Preparo…' : `Scarica ${selezionate.length || ''}`}
                </button>
                <button onClick={chiudiSelezione} className="text-sm px-3 py-2 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">
                  Annulla
                </button>
              </div>
              {erroreDownload && <p className="text-xs text-[var(--pericolo)] mt-2">{erroreDownload}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Filtro Categoria */}
      <div className="schede-tab-container">
        {[
          { id: 'tutte', label: 'Tutte', icona: '📋' },
          { id: 'mie', label: 'Le mie', icona: '👤' },
          { id: 'globali', label: 'Globali', icona: '🌍' }
        ].map(f => (
          <button key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`schede-tab ${filtro === f.id ? 'attivo' : ''}`}>
            <span className="schede-tab-icona">{f.icona}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Barra filtri avanzati */}
      <div className="schede-filtri-avanzati">
        <div className="schede-filtro-ricerca">
          <span className="schede-filtro-icona">🔍</span>
          <input
            type="text"
            value={ricercaNome}
            onChange={e => setRicercaNome(e.target.value)}
            placeholder="Cerca per nome..."
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
          <option value="">Tutti i muscoli</option>
          {gruppiDisponibili.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          value={filtroDifficolta}
          onChange={e => setFiltroDifficolta(e.target.value)}
          className="schede-filtro-select"
        >
          <option value="">Tutte le difficoltà</option>
          <option value="BASE">Base</option>
          <option value="INTERMEDIO">Intermedio</option>
          <option value="AVANZATO">Avanzato</option>
        </select>

        {filtriAttivi && (
          <button
            onClick={() => { setRicercaNome(''); setFiltroGruppo(''); setFiltroDifficolta(''); }}
            className="schede-filtro-reset"
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* Lista Schede */}
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : schedeFiltrate.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-[var(--testo-secondario)]">
            {filtriAttivi ? 'Nessuna scheda corrisponde ai filtri' : (filtro === 'mie' ? 'Non hai ancora creato schede' : 'Nessuna scheda trovata')}
          </p>
          {!filtriAttivi && (
            <button onClick={() => setMostraCrea(true)} className="btn-primario mt-4">
              Crea la tua prima scheda
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
                {/* Header scheda */}
                <div className="flex items-start justify-between">
                  {modalitaSelezione && (
                    <span
                      className="w-6 h-6 rounded-full shrink-0 mr-2 mt-0.5 flex items-center justify-center text-xs font-bold border"
                      style={selezionate.includes(scheda.id)
                        ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                        : { borderColor: 'var(--bordo-light)', color: 'var(--testo-terziario)' }}
                      aria-label={selezionate.includes(scheda.id) ? 'Selezionata' : 'Non selezionata'}
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
                    <span className="badge accent ml-2 shrink-0">Globale</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${LIVELLI[scheda.livello]?.colore || 'accent'}`}>
                    {LIVELLI[scheda.livello]?.label || scheda.livello}
                  </span>
                  <span className="text-xs text-[var(--testo-terziario)]">
                    {scheda.esercizi?.length || 0} esercizi
                  </span>
                  <span className="text-xs text-[var(--testo-terziario)]">
                    •  {scheda._count?.sessioni || 0} sessioni
                  </span>
                </div>

                {/* Gruppi muscolari */}
                {scheda.esercizi?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(scheda.esercizi.map(e => e.esercizio?.gruppoMuscoloPrimario))].filter(Boolean).slice(0, 4).map(g => (
                      <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--bordo)]">
                  <span className="text-xs text-[var(--testo-terziario)]">
                    di {scheda.creatore?.nome} · {formattaData(scheda.creatoIl)}
                  </span>
                  <div className="flex gap-2">
                    {!modalitaSelezione && scheda.creatoreId === utente.id && (
                      <button onClick={() => eliminaScheda(scheda.id)}
                        className="text-xs text-[var(--pericolo)] opacity-0 group-hover:opacity-100 transition-opacity">
                        Elimina
                      </button>
                    )}
                    {!modalitaSelezione && (
                      <Link to={`/schede/${scheda.id}`}
                        className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
                        Dettagli →
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}



      {/* Modale creazione */}
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
