// ============================================
// GymMaster — Workout page
// View optimized for starting a plan quickly
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { useAllenamentoInCorso } from '../contesti/AllenamentoInCorsoContesto.jsx';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { LIVELLI } from '../utils/costanti.js';
import { nomeGruppo } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Plus } from 'lucide-react';

// The two plan views live outside Allenamento: declared inside it, they would
// be new components on every render of the page, recreated from scratch
// (with the entrance animation starting over).

// ─── MOBILE: grid of big squares with a large play button in the middle ───
function GrigliaSchede({ lista, onApri }) {
  const { t } = useLingua();
  return (
    <div className="grid grid-cols-2 gap-4 md:hidden">
      {lista.map((scheda, i) => (
        <motion.div
          key={scheda.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onApri(scheda)}
          className="aspect-square glass-card p-4 flex flex-col justify-between cursor-pointer hover:border-[var(--accent-hover)] transition-all duration-300 relative overflow-hidden group"
          style={{ background: 'var(--vetro)' }}
        >
          {/* Decorative gradient background */}
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-20 group-hover:opacity-35 transition-opacity duration-500" style={{ background: 'var(--accent)' }}></div>
          <div className="absolute -bottom-10 -left-10 w-20 h-20 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity duration-500" style={{ background: 'var(--accent-alt)' }}></div>

          {/* Title at the top */}
          <h3 className="font-bold text-sm leading-tight line-clamp-2 text-center text-[var(--testo-primario)] z-10 font-sans">
            {scheda.titolo}
          </h3>

          {/* Large Play button in the middle */}
          <div className="flex-1 flex items-center justify-center z-10">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-[var(--ombra-accent)] group-hover:scale-110 group-hover:shadow-[0_8px_20px_var(--accent-glow)]"
                 style={{
                   background: 'linear-gradient(135deg, var(--accent), var(--accent-alt))',
                 }}>
              <Play size={18} fill="currentColor" className="ml-0.5" />
            </div>
          </div>

          {/* Info at the bottom */}
          <div className="flex items-center justify-between w-full z-10">
            <span className={`badge ${
              scheda.livello === 'BASE' ? 'successo' :
              scheda.livello === 'INTERMEDIO' ? 'avviso' :
              scheda.livello === 'AVANZATO' ? 'pericolo' : 'accent'
            } text-[9px] px-2 py-0.5`}>
              {LIVELLI[scheda.livello] ? t(LIVELLI[scheda.livello].label) : scheda.livello}
            </span>
            <span className="text-[11px] font-semibold text-[var(--testo-secondario)]">
              {t('allenamento.eserciziBreve', { count: scheda.esercizi?.length || 0 })}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── DESKTOP: premium horizontal list view ───
function ListaSchede({ lista, onApri }) {
  const { t } = useLingua();
  return (
    <div className="hidden md:flex flex-col gap-3">
      {lista.map((scheda, i) => {
        const gruppi = [...new Set(scheda.esercizi?.map(e => e.esercizio?.gruppoMuscoloPrimario))].filter(Boolean).slice(0, 5);
        return (
          <motion.div
            key={scheda.id}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onApri(scheda)}
            className="glass-card flex items-center gap-5 p-card-inner cursor-pointer group hover:border-[var(--bordo-hover)] transition-all relative overflow-hidden"
            style={{ borderLeft: '3px solid var(--accent)' }}
          >
            {/* Decorative glow on hover */}
            <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-15 transition-opacity duration-500" style={{ background: 'var(--accent)' }}></div>

            {/* Main info */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-bold text-lg truncate">{scheda.titolo}</h3>
                {scheda.visibilita === 'GLOBALE' && (
                  <span className="badge accent shrink-0 text-[10px]">{t('allenamento.globale')}</span>
                )}
              </div>
              {scheda.descrizione && (
                <p className="text-sm text-[var(--testo-secondario)] line-clamp-1 mb-2">{scheda.descrizione}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`badge ${LIVELLI[scheda.livello]?.colore || 'accent'}`}>
                  {LIVELLI[scheda.livello] ? t(LIVELLI[scheda.livello].label) : scheda.livello}
                </span>
                <span className="text-xs text-[var(--testo-terziario)]">
                  {t('comune.esercizi', { count: scheda.esercizi?.length || 0 })}
                </span>
                <span className="text-xs text-[var(--testo-terziario)]">
                  · {t('allenamento.sessioni', { count: scheda._count?.sessioni || 0 })}
                </span>
                {gruppi.length > 0 && (
                  <div className="flex gap-1 ml-1">
                    {gruppi.map(g => (
                      <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-terziario)] text-[var(--testo-secondario)]">
                        {nomeGruppo(g)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Start button */}
            <div className="shrink-0 relative z-10">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all group-hover:scale-110 group-hover:shadow-lg"
                   style={{
                     background: 'linear-gradient(135deg, var(--accent), var(--accent-alt))',
                     boxShadow: '0 4px 15px var(--accent-dim)',
                     color: 'white'
                   }}>
                ▶
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Allenamento() {
  const { t } = useLingua();
  const { utente } = useAuth();
  const naviga = useNavigate();
  const { avvia } = useAllenamentoInCorso();
  const [schede, setSchede] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [schedaSelezionata, setSchedaSelezionata] = useState(null);
  const [avviando, setAvviando] = useState(false);

  // /allenamento?scheda=ID comes from the reminder, the calendar and the
  // suggestion on the dashboard: the plan opens ready to start.
  // The parameter stays the source of truth while the dialog is open, so it
  // also works when this page is already the one on screen.
  const [parametri, setParametri] = useSearchParams();
  const richiesta = Number(parametri.get('scheda')) || null;
  const richiestaInLista = richiesta ? schede.find(s => s.id === richiesta) : null;
  // Plans assigned by the personal trainer do not appear in this page's lists
  const [richiestaFuoriLista, setRichiestaFuoriLista] = useState(null);

  useEffect(() => {
    if (caricamento || !richiesta || richiestaInLista || richiestaFuoriLista?.id === richiesta) return;
    let annullato = false;
    api.get(`/schede/${richiesta}`)
      .then(r => { if (!annullato) setRichiestaFuoriLista(r.dati); })
      .catch(() => { if (!annullato) setParametri({}, { replace: true }); });
    return () => { annullato = true; };
  }, [caricamento, richiesta, richiestaInLista, richiestaFuoriLista, setParametri]);

  const schedaAperta = schedaSelezionata
    ?? richiestaInLista
    ?? (richiestaFuoriLista?.id === richiesta ? richiestaFuoriLista : null);

  const chiudiRiquadro = () => {
    setSchedaSelezionata(null);
    if (richiesta) setParametri({}, { replace: true });
  };

  useEffect(() => {
    api.get('/schede')
      .then(risposta => setSchede(risposta.dati || []))
      .catch(err => console.error('Errore caricamento schede:', err))
      .finally(() => setCaricamento(false));
  }, []);

  const avviaAllenamento = async (schedaId) => {
    try {
      setAvviando(true);
      // With another workout open the user chooses first (AllenamentoInCorsoContesto):
      // the plan's box closes, so the choice is the only window on screen
      if (!(await avvia(schedaId))) {
        setAvviando(false);
        chiudiRiquadro();
      }
    } catch (err) {
      alert(err.message);
      setAvviando(false);
    }
  };

  const mieSchede = schede.filter(s => s.creatoreId === utente.id);
  const schedeGlobali = schede.filter(s => s.visibilita === 'GLOBALE' && s.creatoreId !== utente.id);

  return (
    <div className="py-2 pb-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold mb-1">{t('allenamento.titolo')}</h1>
        <p className="text-[var(--testo-secondario)]">{t('allenamento.sottotitolo')}</p>
      </div>

      {/* Without a plan: the exercises are chosen during the workout */}
      <button
        type="button"
        onClick={() => avviaAllenamento(null)}
        disabled={avviando}
        className="glass-card w-full mb-8 px-5 py-4 flex items-center gap-4 text-left border border-dashed border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
      >
        <span className="shrink-0 w-11 h-11 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
          <Plus size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-bold">{t('allenamento.libero.titolo')}</span>
          <span className="block text-sm text-[var(--testo-secondario)]">{t('allenamento.libero.testo')}</span>
        </span>
      </button>

      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : schede.length === 0 ? (
        <div className="glass-card p-8 text-center mt-10">
          <div className="text-5xl mb-4">🏋️‍♂️</div>
          <h2 className="text-xl font-bold mb-2">{t('allenamento.nessunaScheda.titolo')}</h2>
          <p className="text-[var(--testo-secondario)] mb-4">
            {t('allenamento.nessunaScheda.testo')}
          </p>
          <button onClick={() => naviga('/schede')} className="btn-primario">
            {t('allenamento.nessunaScheda.vai')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {mieSchede.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span>👤</span> {t('allenamento.tueSchede')}
              </h2>
              <GrigliaSchede lista={mieSchede} onApri={setSchedaSelezionata} />
              <ListaSchede lista={mieSchede} onApri={setSchedaSelezionata} />
            </section>
          )}

          {schedeGlobali.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span>🌍</span> {t('allenamento.schedeGlobali')}
              </h2>
              <GrigliaSchede lista={schedeGlobali} onApri={setSchedaSelezionata} />
              <ListaSchede lista={schedeGlobali} onApri={setSchedaSelezionata} />
            </section>
          )}
        </div>
      )}

      {/* Start confirmation popup */}
      <AnimatePresence>
        {schedaAperta && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !avviando && chiudiRiquadro()}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card w-full max-w-sm p-card-inner overflow-hidden relative"
              >
                {/* Decorative effect */}
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: 'var(--accent)' }}></div>

                <div className="text-center relative z-10">
                  <div className="w-16 h-16 bg-[var(--accent-dim)] rounded-full flex items-center justify-center text-3xl mx-auto mb-4 text-[var(--accent)] shadow-[var(--ombra-accent)]">
                    🏋️‍♂️
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{schedaAperta.titolo}</h3>
                  <p className="text-[var(--testo-secondario)] text-sm mb-6">
                    {t('allenamento.conferma.testo', { count: schedaAperta.esercizi?.length || 0 })}
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => avviaAllenamento(schedaAperta.id)}
                      disabled={avviando}
                      className="btn-enorme w-full"
                    >
                      {avviando ? t('allenamento.conferma.avvio') : t('allenamento.conferma.inizia')}
                    </button>
                    <button 
                      onClick={chiudiRiquadro}
                      disabled={avviando}
                      className="w-full py-3 rounded-[var(--raggio-md)] font-semibold text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] hover:bg-[var(--bg-terziario)] transition-all"
                    >
                      {t('comune.annulla')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
