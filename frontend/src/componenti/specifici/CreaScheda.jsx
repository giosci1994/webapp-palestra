// ============================================
// GymMaster — Componente Creazione Scheda
// Modale per creare una nuova scheda allenamento
// ============================================

import { useState, useEffect } from 'react';
import { nomeEsercizio } from '../../utils/formattatori.js';
import { api } from '../../config/api.js';
import { GRUPPI_MUSCOLARI } from '../../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';

export default function CreaScheda({ onChiudi, onCreata, schedaEsistente = null }) {
  const [step, setStep] = useState(1); // 1: info base, 2: aggiungi esercizi
  const [form, setForm] = useState(
    schedaEsistente 
      ? { titolo: schedaEsistente.titolo, descrizione: schedaEsistente.descrizione || '', livello: schedaEsistente.livello, visibilita: schedaEsistente.visibilita }
      : { titolo: '', descrizione: '', livello: 'BASE', visibilita: 'PERSONALE' }
  );
  const [eserciziSelezionati, setEserciziSelezionati] = useState(
    schedaEsistente && schedaEsistente.esercizi 
      ? schedaEsistente.esercizi.map(es => ({
          esercizioId: es.esercizioId,
          nome: nomeEsercizio(es.esercizio),
          gruppo: es.esercizio.gruppoMuscoloPrimario,
          serieTarget: es.serieTarget,
          repTarget: es.repTarget,
          recuperoSecondi: es.recuperoSecondi,
          note: es.note || '',
          // Campi cardio (preservati per le voci create dal bot)
          riscaldamento: es.riscaldamento,
          durataMinuti: es.durataMinuti,
          velocitaKmh: es.velocitaKmh,
          inclinazione: es.inclinazione,
          livelloResistenza: es.livelloResistenza,
          distanzaKm: es.distanzaKm
        }))
      : []
  );
  const [eserciziCatalogo, setEserciziCatalogo] = useState([]);
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  // Carica catalogo esercizi
  useEffect(() => {
    api.get('/esercizi').then(r => setEserciziCatalogo(r.dati || [])).catch(() => {});
  }, []);

  const eserciziFiltrati = eserciziCatalogo.filter(e => {
    if (filtroGruppo && e.gruppoMuscoloPrimario !== filtroGruppo) return false;
    if (ricerca && !`${e.nomeIt || ''} ${e.nome}`.toLowerCase().includes(ricerca.toLowerCase())) return false;
    return true;
  });

  const gruppiUnici = [...new Set(eserciziCatalogo.map(e => e.gruppoMuscoloPrimario))].sort();

  const toggleEsercizio = (esercizio) => {
    setEserciziSelezionati(prev => {
      const esiste = prev.find(e => e.esercizioId === esercizio.id);
      if (esiste) return prev.filter(e => e.esercizioId !== esercizio.id);
      return [...prev, {
        esercizioId: esercizio.id,
        nome: nomeEsercizio(esercizio),
        gruppo: esercizio.gruppoMuscoloPrimario,
        serieTarget: 3,
        repTarget: '8-12',
        recuperoSecondi: 90,
        note: ''
      }];
    });
  };

  const aggiornaPianoEsercizio = (idx, campo, valore) => {
    setEserciziSelezionati(prev => prev.map((e, i) =>
      i === idx ? { ...e, [campo]: valore } : e
    ));
  };

  // Sposta esercizio su o giù nella lista
  const spostaEsercizio = (idx, direzione) => {
    setEserciziSelezionati(prev => {
      const nuovoIdx = idx + direzione;
      if (nuovoIdx < 0 || nuovoIdx >= prev.length) return prev;
      const copia = [...prev];
      [copia[idx], copia[nuovoIdx]] = [copia[nuovoIdx], copia[idx]];
      return copia;
    });
  };

  const gestisciCrea = async () => {
    setCaricamento(true);
    try {
      const payload = {
        ...form,
        esercizi: eserciziSelezionati.map(e => {
          const cardio = e.riscaldamento || e.durataMinuti != null || e.velocitaKmh != null ||
                         e.livelloResistenza != null || e.distanzaKm != null;
          if (cardio) {
            return {
              esercizioId: e.esercizioId,
              serieTarget: e.serieTarget ?? 1,
              repTarget: e.repTarget ?? null,
              recuperoSecondi: e.recuperoSecondi ?? 0,
              riscaldamento: !!e.riscaldamento,
              durataMinuti: e.durataMinuti ?? null,
              velocitaKmh: e.velocitaKmh ?? null,
              inclinazione: e.inclinazione ?? null,
              livelloResistenza: e.livelloResistenza ?? null,
              distanzaKm: e.distanzaKm ?? null
            };
          }
          return {
            esercizioId: e.esercizioId,
            serieTarget: parseInt(e.serieTarget),
            repTarget: e.repTarget,
            recuperoSecondi: parseInt(e.recuperoSecondi),
            note: e.note?.trim() || null
          };
        })
      };
      let risposta;
      if (schedaEsistente) {
        risposta = await api.put(`/schede/${schedaEsistente.id}`, payload);
      } else {
        risposta = await api.post('/schede', payload);
      }
      onCreata(risposta.dati);
    } catch (err) {
      alert(err.message);
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}
      onClick={(e) => e.target === e.currentTarget && onChiudi()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--ombra-modale)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--bordo)]">
          <h2 className="text-xl font-bold">
            {schedaEsistente ? 'Modifica Scheda' : (step === 1 ? 'Nuova Scheda' : 'Aggiungi Esercizi')}
          </h2>
          <button onClick={onChiudi} className="text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] text-xl p-1">✕</button>
        </div>

        {/* Contenuto */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 ? (
            /* Step 1: Info base */
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Titolo *</label>
                <input type="text" value={form.titolo} onChange={e => setForm(p => ({...p, titolo: e.target.value}))}
                       className="campo-input" placeholder="Es: Push Day - Petto e Tricipiti" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Descrizione</label>
                <textarea value={form.descrizione} onChange={e => setForm(p => ({...p, descrizione: e.target.value}))}
                          className="campo-input" rows={2} placeholder="Descrizione opzionale" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Livello</label>
                  <select value={form.livello} onChange={e => setForm(p => ({...p, livello: e.target.value}))} className="campo-input">
                    <option value="BASE">Base</option>
                    <option value="INTERMEDIO">Intermedio</option>
                    <option value="AVANZATO">Avanzato</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Visibilità</label>
                  <select value={form.visibilita} onChange={e => setForm(p => ({...p, visibilita: e.target.value}))} className="campo-input">
                    <option value="PERSONALE">Personale</option>
                    <option value="GLOBALE">Globale</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Step 2: Aggiungi esercizi */
            <div className="flex flex-col gap-5">
              {/* Esercizi selezionati */}
              {eserciziSelezionati.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--testo-secondario)] mb-3">
                    Selezionati ({eserciziSelezionati.length}) — <span className="text-[10px] font-normal text-[var(--testo-terziario)]">usa ▲▼ per riordinare</span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                      {eserciziSelezionati.map((es, idx) => (
                        <motion.div
                          key={es.esercizioId}
                          layout
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          className="esercizio-selezionato-card"
                        >
                          {/* Riga nome esercizio */}
                          <div className="esercizio-sel-header">
                            {/* Frecce riordinamento */}
                            <div className="flex flex-col shrink-0">
                              <button
                                onClick={() => spostaEsercizio(idx, -1)}
                                disabled={idx === 0}
                                className="btn-freccia-ordine"
                                title="Sposta su"
                              >▲</button>
                              <button
                                onClick={() => spostaEsercizio(idx, 1)}
                                disabled={idx === eserciziSelezionati.length - 1}
                                className="btn-freccia-ordine"
                                title="Sposta giù"
                              >▼</button>
                            </div>
                            <span className="esercizio-sel-numero">{idx + 1}</span>
                            <span className="esercizio-sel-nome">{es.nome}</span>
                            <button onClick={() => toggleEsercizio({ id: es.esercizioId })}
                                    className="text-[var(--pericolo)] text-sm px-1 hover:scale-110 transition-transform shrink-0"
                                    title="Rimuovi esercizio">✕</button>
                          </div>

                          {/* Riga parametri - MIGLIORATA */}
                          <div className="esercizio-sel-parametri">
                            <div className="esercizio-param-gruppo">
                              <label className="esercizio-param-label">Serie</label>
                              <input type="number" value={es.serieTarget} onChange={e => aggiornaPianoEsercizio(idx, 'serieTarget', e.target.value)}
                                     className="esercizio-param-input" style={{ width: '52px' }} min={1} max={10} />
                            </div>
                            <span className="esercizio-param-sep">×</span>
                            <div className="esercizio-param-gruppo">
                              <label className="esercizio-param-label">Rep</label>
                              <input type="text" value={es.repTarget} onChange={e => aggiornaPianoEsercizio(idx, 'repTarget', e.target.value)}
                                     className="esercizio-param-input" style={{ width: '64px' }} />
                            </div>
                            <div className="esercizio-param-gruppo ml-auto">
                              <label className="esercizio-param-label">Rec.</label>
                              <input type="number" value={es.recuperoSecondi} onChange={e => aggiornaPianoEsercizio(idx, 'recuperoSecondi', e.target.value)}
                                     className="esercizio-param-input" style={{ width: '64px' }} step={15} min={0} />
                              <span className="esercizio-param-unita">s</span>
                            </div>
                          </div>

                          {/* Indicazione tecnica: correzioni posturali, tempi,
                              esecuzione unilaterale. Facoltativa. */}
                          <input
                            type="text"
                            value={es.note || ''}
                            onChange={e => aggiornaPianoEsercizio(idx, 'note', e.target.value)}
                            placeholder="Nota tecnica (facoltativa) — es. gomiti a 45°, pausa di 2 secondi in cima"
                            className="w-full mt-2 px-3 py-2 rounded-[var(--raggio-sm)] text-xs bg-[var(--bg-terziario)] text-[var(--testo-primario)] border border-[var(--bordo-light)] focus:border-[var(--accent)] focus:outline-none"
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Filtro gruppo muscolare evidenziato */}
              <div className="crea-scheda-filtro-gruppo">
                <label className="text-sm font-semibold text-[var(--testo-primario)] mb-2 block">Filtra per gruppo muscolare</label>
                <div className="crea-scheda-gruppi-wrap">
                  <button
                    onClick={() => setFiltroGruppo('')}
                    className={`crea-scheda-gruppo-btn ${!filtroGruppo ? 'attivo' : ''}`}
                  >Tutti</button>
                  {gruppiUnici.map(g => {
                    const info = GRUPPI_MUSCOLARI[g];
                    return (
                      <button key={g}
                        onClick={() => setFiltroGruppo(g === filtroGruppo ? '' : g)}
                        className={`crea-scheda-gruppo-btn ${filtroGruppo === g ? 'attivo' : ''}`}
                        style={filtroGruppo === g && info ? { borderColor: info.colore, background: `${info.colore}22` } : {}}
                      >
                        {info?.emoji && <span>{info.emoji}</span>}
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Barra ricerca */}
              <input type="text" value={ricerca} onChange={e => setRicerca(e.target.value)}
                     className="campo-input campo-ricerca" placeholder="🔍 Cerca esercizio..." />

              {/* Catalogo esercizi */}
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {eserciziFiltrati.length === 0 ? (
                  <div className="text-center py-6 text-[var(--testo-terziario)]">Nessun esercizio trovato</div>
                ) : eserciziFiltrati.map(es => {
                  const selezionato = eserciziSelezionati.some(e => e.esercizioId === es.id);
                  return (
                    <button key={es.id} onClick={() => toggleEsercizio(es)}
                            className={`flex items-center gap-3 p-2.5 rounded-[var(--raggio-md)] text-left transition-all text-sm ${
                              selezionato ? 'bg-[var(--accent-dim)] border border-[var(--accent)]' : 'hover:bg-[var(--bg-terziario)]'
                            }`}>
                      <span className="text-lg">{selezionato ? '✅' : '➕'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{nomeEsercizio(es)}</p>
                        <p className="text-xs text-[var(--testo-terziario)]">
                          {es.gruppoMuscoloPrimario} {es.attrezzatura ? `· ${es.attrezzatura.nome}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--bordo)]">
          {step === 2 ? (
            <button onClick={() => setStep(1)} className="btn-secondario">← Indietro</button>
          ) : <div />}
          {step === 1 ? (
            <button onClick={() => setStep(2)} disabled={!form.titolo.trim()} className="btn-primario">
              Aggiungi esercizi →
            </button>
          ) : (
            <button onClick={gestisciCrea} disabled={caricamento} className="btn-primario">
              {caricamento ? 'Salvataggio...' : (schedaEsistente ? `Salva modifiche (${eserciziSelezionati.length} es.)` : `Crea scheda (${eserciziSelezionati.length} es.)`)}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
