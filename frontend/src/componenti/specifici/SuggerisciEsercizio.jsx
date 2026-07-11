// ============================================
// GymMaster — Componente Suggerisci Esercizio
// Form per proporre nuovi esercizi al catalogo
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../../config/api.js';
import { GRUPPI_MUSCOLARI } from '../../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';

// Badge di stato per i suggerimenti
const STATI_BADGE = {
  IN_ATTESA: { label: 'In attesa', classe: 'bg-[var(--avviso-dim)] text-[var(--avviso)]' },
  APPROVATO: { label: 'Approvato', classe: 'bg-[var(--successo-dim)] text-[var(--successo)]' },
  RIFIUTATO: { label: 'Rifiutato', classe: 'bg-[var(--pericolo-dim)] text-[var(--pericolo)]' }
};

export default function SuggerisciEsercizio({ className }) {
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [successo, setSuccesso] = useState(false);
  const [suggerimenti, setSuggerimenti] = useState([]);
  const [mostraStorico, setMostraStorico] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    gruppoMuscoloPrimario: '',
    gruppoMuscoloSecondario: '',
    attrezzaturaSuggerita: '',
    descrizione: ''
  });

  // Carica lo storico dei suggerimenti dell'utente
  useEffect(() => {
    if (aperto) {
      api.get('/suggerimenti-esercizi')
        .then(r => setSuggerimenti(r.dati || []))
        .catch(() => {});
    }
  }, [aperto, successo]);

  const resetForm = () => {
    setForm({ nome: '', gruppoMuscoloPrimario: '', gruppoMuscoloSecondario: '', attrezzaturaSuggerita: '', descrizione: '' });
    setSuccesso(false);
  };

  const invia = async () => {
    if (!form.nome.trim() || !form.gruppoMuscoloPrimario) return;

    setInvio(true);
    try {
      await api.post('/suggerimenti-esercizi', form);
      setSuccesso(true);
      setForm({ nome: '', gruppoMuscoloPrimario: '', gruppoMuscoloSecondario: '', attrezzaturaSuggerita: '', descrizione: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setInvio(false);
    }
  };

  const gruppi = Object.keys(GRUPPI_MUSCOLARI);

  return (
    <div className={className}>
      {/* Toggle button */}
      <motion.button
        onClick={() => { setAperto(!aperto); if (!aperto) setSuccesso(false); }}
        className="w-full glass-card p-4 flex items-center justify-between group hover:border-[var(--accent)] transition-all"
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <div className="text-left">
            <p className="font-semibold text-sm">Non trovi un esercizio?</p>
            <p className="text-xs text-[var(--testo-terziario)]">Suggeriscine uno nuovo all'amministratore</p>
          </div>
        </div>
        <motion.span
          animate={{ rotate: aperto ? 180 : 0 }}
          className="text-[var(--testo-terziario)] text-lg"
        >
          ▼
        </motion.span>
      </motion.button>

      {/* Contenuto espandibile */}
      <AnimatePresence>
        {aperto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="glass-card mt-2 p-5 border-t-2 border-[var(--accent)]">
              {successo ? (
                /* Messaggio di conferma */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <span className="text-5xl mb-4 block">✅</span>
                  <h3 className="text-lg font-bold mb-2">Proposta inviata!</h3>
                  <p className="text-sm text-[var(--testo-secondario)] mb-4">
                    L'amministratore esaminerà il tuo suggerimento e ti notificherà l'esito.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button onClick={resetForm} className="btn-primario text-sm">
                      Suggerisci un altro
                    </button>
                    <button onClick={() => setAperto(false)} className="btn-secondario text-sm">
                      Chiudi
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Form di suggerimento */
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-sm text-[var(--testo-secondario)] flex items-center gap-2">
                    <span>📝</span> Proponi un nuovo esercizio
                  </h3>

                  <input
                    type="text"
                    value={form.nome}
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                    className="campo-input"
                    placeholder="Nome esercizio *"
                    autoFocus
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={form.gruppoMuscoloPrimario}
                      onChange={e => setForm(p => ({ ...p, gruppoMuscoloPrimario: e.target.value }))}
                      className="campo-input"
                    >
                      <option value="" disabled>Gruppo primario *</option>
                      {gruppi.map(g => (
                        <option key={g} value={g}>{GRUPPI_MUSCOLARI[g]?.emoji} {g}</option>
                      ))}
                    </select>

                    <select
                      value={form.gruppoMuscoloSecondario}
                      onChange={e => setForm(p => ({ ...p, gruppoMuscoloSecondario: e.target.value }))}
                      className="campo-input"
                    >
                      <option value="">Gruppo secondario</option>
                      {gruppi.map(g => (
                        <option key={g} value={g}>{GRUPPI_MUSCOLARI[g]?.emoji} {g}</option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    value={form.attrezzaturaSuggerita}
                    onChange={e => setForm(p => ({ ...p, attrezzaturaSuggerita: e.target.value }))}
                    className="campo-input"
                    placeholder="Attrezzatura (es: Manubri, Cavi, Sbarra...)"
                  />

                  <textarea
                    value={form.descrizione}
                    onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))}
                    className="campo-input"
                    rows={2}
                    placeholder="Descrizione o note (opzionale)"
                  />

                  <button
                    onClick={invia}
                    disabled={invio || !form.nome.trim() || !form.gruppoMuscoloPrimario}
                    className="btn-primario w-full"
                  >
                    {invio ? 'Invio in corso...' : '📤 Invia suggerimento'}
                  </button>
                </div>
              )}

              {/* Storico suggerimenti */}
              {suggerimenti.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[var(--bordo)]">
                  <button
                    onClick={() => setMostraStorico(!mostraStorico)}
                    className="text-xs font-semibold text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)] flex items-center gap-1 transition-colors"
                  >
                    <span>{mostraStorico ? '▾' : '▸'}</span>
                    I tuoi suggerimenti ({suggerimenti.length})
                  </button>

                  <AnimatePresence>
                    {mostraStorico && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-2 mt-3">
                          {suggerimenti.map(s => (
                            <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
                              <span className="text-lg">{GRUPPI_MUSCOLARI[s.gruppoMuscoloPrimario]?.emoji || '💪'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{s.nome}</p>
                                <p className="text-[10px] text-[var(--testo-terziario)]">{s.gruppoMuscoloPrimario}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATI_BADGE[s.stato]?.classe}`}>
                                {STATI_BADGE[s.stato]?.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
