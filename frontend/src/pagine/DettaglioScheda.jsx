// ============================================
// GymMaster — Dettaglio Scheda
// Visualizzazione completa e avvio allenamento
// ============================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, scaricaFile } from '../config/api.js';
import { LIVELLI, GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import CreaScheda from '../componenti/specifici/CreaScheda.jsx';
import { useAuth } from '../contesti/AuthContesto.jsx';

export default function DettaglioScheda() {
  const { id } = useParams();
  const naviga = useNavigate();
  const { utente } = useAuth();
  const [scheda, setScheda] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraModifica, setMostraModifica] = useState(false);
  const [scaricando, setScaricando] = useState(false);
  const [erroreDownload, setErroreDownload] = useState('');

  // Scarica la scheda come .docx per consultarla in palestra anche offline
  const scaricaDocx = async () => {
    try {
      setErroreDownload('');
      setScaricando(true);
      await scaricaFile(`/schede/${scheda.id}/docx`, `${scheda.titolo || 'scheda'}.docx`);
    } catch (err) {
      setErroreDownload(err?.message || 'Download non riuscito');
    } finally {
      setScaricando(false);
    }
  };
  const [descrizioneEspansa, setDescrizioneEspansa] = useState(false);
  const [clonando, setClonando] = useState(false);

  useEffect(() => {
    api.get(`/schede/${id}`)
      .then(r => setScheda(r.dati))
      .catch(err => { alert(err.message); naviga('/schede'); })
      .finally(() => setCaricamento(false));
  }, [id]);

  const avviaAllenamento = async () => {
    try {
      const risposta = await api.post('/sessioni', { schedaId: parseInt(id) });
      naviga(`/allenamento/${risposta.dati.id}`, { state: { sessione: risposta.dati } });
    } catch (err) {
      alert(err.message);
    }
  };

  const clonaScheda = async () => {
    try {
      setClonando(true);
      const r = await api.post(`/schede/${id}/clona`);
      naviga(`/schede/${r.dati.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setClonando(false);
    }
  };

  if (caricamento) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  if (!scheda) return null;

  return (
    <div className="py-2 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Back */}
        <Link to="/schede" className="text-sm text-[var(--testo-secondario)] hover:text-[var(--accent)] mb-4 inline-block">
          ← Torna alle schede
        </Link>

        {/* Header */}
        <div className="glass-card p-card-inner mb-4">
          {/* Su telefono titolo e comandi vanno incolonnati: affiancati, il
              titolo si spezzava in cinque righe e i pulsanti uscivano dal bordo. */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-3 sm:gap-4">
            <h1 className="text-2xl font-bold min-w-0">{scheda.titolo}</h1>

            <div className="flex gap-2 items-center flex-wrap sm:shrink-0">
              <span className={`badge ${LIVELLI[scheda.livello]?.colore || 'accent'}`}>
                {LIVELLI[scheda.livello]?.label}
              </span>
              {scheda.creatore?.id === utente?.id ? (
                <button
                  onClick={() => setMostraModifica(true)}
                  className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] font-semibold px-2 py-1 rounded-[var(--raggio-sm)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                >
                  ✏️ Modifica
                </button>
              ) : (
                <button
                  onClick={clonaScheda}
                  disabled={clonando}
                  className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] font-semibold px-2 py-1 rounded-[var(--raggio-sm)] hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
                  title="Salva una copia personale modificabile"
                >
                  {clonando ? 'Clono…' : '⧉ Clona'}
                </button>
              )}

              <button
                onClick={scaricaDocx}
                disabled={scaricando}
                title="Scarica in formato Word, per consultarla offline"
                className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] font-semibold px-2 py-1 rounded-[var(--raggio-sm)] hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
              >
                {scaricando ? 'Preparo…' : '⬇ Word'}
              </button>
            </div>
          </div>

          {erroreDownload && (
            <p className="text-xs text-[var(--pericolo)] mb-2">{erroreDownload}</p>
          )}

          {scheda.descrizione && (
            <div className="mt-2 mb-4">
              <p className={`text-[var(--testo-secondario)] text-sm leading-relaxed transition-all duration-300 ${
                scheda.descrizione.length > 180 && !descrizioneEspansa ? 'line-clamp-4' : ''
              }`}>
                {scheda.descrizione}
              </p>
              {scheda.descrizione.length > 180 && (
                <button
                  onClick={() => setDescrizioneEspansa(!descrizioneEspansa)}
                  className="flex items-center gap-1 text-xs text-[var(--accent)] font-semibold mt-2 hover:text-[var(--accent-hover)] transition-colors focus:outline-none"
                >
                  {descrizioneEspansa ? 'Mostra meno' : 'Mostra tutto'}
                  <svg
                    className={`w-3.5 h-3.5 transform transition-transform duration-200 ${
                      descrizioneEspansa ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-[var(--testo-terziario)] border-t border-[var(--bordo)] pt-3 mt-1">
            Creata da {scheda.creatore?.nome} · {scheda.esercizi?.length} esercizi
          </p>
        </div>

        {/* Lista esercizi */}
        <div className="flex flex-col gap-2 mb-6">
          {scheda.esercizi?.map((es, i) => {
            const cardio = es.riscaldamento || es.durataMinuti != null || es.velocitaKmh != null ||
                           es.livelloResistenza != null || es.distanzaKm != null;
            const partiCardio = [];
            if (es.durataMinuti != null) partiCardio.push(`${es.durataMinuti} min`);
            if (es.velocitaKmh != null) partiCardio.push(`${es.velocitaKmh} km/h`);
            if (es.inclinazione != null) partiCardio.push(`incl ${es.inclinazione}%`);
            if (es.livelloResistenza != null) partiCardio.push(`liv ${es.livelloResistenza}`);
            if (es.distanzaKm != null) partiCardio.push(`${es.distanzaKm} km`);
            return (
            <motion.div
              key={es.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card px-card-inner py-4"
            >
              <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                   style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">
                  {es.riscaldamento ? '🔥 ' : cardio ? '🏃 ' : ''}{es.esercizio.nome}
                  {es.riscaldamento && <span className="text-xs text-[var(--accent)]"> · riscaldamento</span>}
                </p>
                <p className="text-xs text-[var(--testo-terziario)]">
                  {es.esercizio.gruppoMuscoloPrimario}
                  {es.esercizio.attrezzatura ? ` · ${es.esercizio.attrezzatura.nome}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                {cardio ? (
                  <p className="text-sm font-semibold">{partiCardio.join(' · ') || 'Cardio'}</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold">{es.serieTarget} × {es.repTarget}</p>
                    <p className="text-xs text-[var(--testo-terziario)]">{es.recuperoSecondi}s rec.</p>
                  </>
                )}
              </div>
              </div>

              {/* Indicazione tecnica scritta per questo esercizio in questa scheda */}
              {es.note && (
                <p className="text-xs text-[var(--testo-secondario)] mt-2.5 sm:pl-12 leading-relaxed border-l-2 border-[var(--accent-dim)] pl-3 sm:border-l-0">
                  {es.note}
                </p>
              )}
            </motion.div>
            );
          })}
        </div>

        {/* CTA Avvia */}
        <button onClick={avviaAllenamento} className="btn-enorme">
          🏋️ Inizia Allenamento
        </button>
      </motion.div>

      {/* Modale Modifica */}
      <AnimatePresence>
        {mostraModifica && (
          <CreaScheda
            schedaEsistente={scheda}
            onChiudi={() => setMostraModifica(false)}
            onCreata={(aggiornata) => {
              setScheda(aggiornata);
              setMostraModifica(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
