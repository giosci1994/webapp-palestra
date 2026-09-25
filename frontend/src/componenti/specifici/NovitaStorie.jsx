// ============================================
// GymMaster — Novità in stile "storie"
// Bolla fluttuante + visore swipe (stile Instagram).
// Auto-apertura al primo avvio sulle novità non viste.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../config/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

const CHIAVE_VISTE = 'novita_viste';

function leggiViste() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_VISTE) || '[]'); } catch { return []; }
}
function salvaViste(ids) {
  try { localStorage.setItem(CHIAVE_VISTE, JSON.stringify(ids)); } catch { /* ignora */ }
}

function parsePunti(punti) {
  if (!punti) return [];
  if (Array.isArray(punti)) return punti;
  try { const p = JSON.parse(punti); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function NovitaStorie() {
  const naviga = useNavigate();
  const [novita, setNovita] = useState([]);
  const [viste, setViste] = useState(leggiViste);
  const [aperto, setAperto] = useState(false);
  const [indice, setIndice] = useState(0);
  const touchX = useRef(null);

  useEffect(() => {
    api.get('/novita').then((r) => {
      const lista = r.dati || [];
      setNovita(lista);
      const visteAttuali = leggiViste();
      const primaNonVista = lista.findIndex((n) => !visteAttuali.includes(n.id));
      if (primaNonVista >= 0) {
        setIndice(primaNonVista);
        setAperto(true);
      }
    }).catch(() => {});
  }, []);

  const nonViste = novita.filter((n) => !viste.includes(n.id)).length;

  if (novita.length === 0) return null;

  const apri = (i = 0) => { setIndice(i); setAperto(true); };
  const chiudi = () => {
    setAperto(false);
    const ids = novita.map((n) => n.id);
    setViste(ids);
    salvaViste(ids);
  };
  const prossima = () => { if (indice < novita.length - 1) setIndice(indice + 1); else chiudi(); };
  const precedente = () => { if (indice > 0) setIndice(indice - 1); };

  const storia = novita[indice];
  const punti = parsePunti(storia?.punti);
  const c1 = storia?.coloreInizio || '#8b5cf6';
  const c2 = storia?.coloreFine || '#06b6d4';

  const onCta = () => {
    const rotta = storia?.ctaRotta;
    chiudi();
    if (!rotta) return;
    if (/^https?:\/\//.test(rotta)) window.open(rotta, '_blank', 'noopener');
    else naviga(rotta);
  };

  return (
    <>
      {/* Bolla fluttuante */}
      <button
        onClick={() => apri(0)}
        aria-label="Novità"
        className="fixed z-40 right-4 bottom-[calc(88px+var(--safe-bottom))] md:bottom-6 w-12 h-12 rounded-full flex items-center justify-center shadow-[var(--ombra-modale)] active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
      >
        <Sparkles size={22} className="text-white" />
        {nonViste > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--pericolo)] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg-primario)]">
            {nonViste}
          </span>
        )}
      </button>

      <AnimatePresence>
        {aperto && storia && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={chiudi}
          >
            <div
              className="w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchX.current == null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                if (dx < -40) prossima(); else if (dx > 40) precedente();
                touchX.current = null;
              }}
            >
              {/* Barrette di avanzamento (solo con più di una novità) */}
              {novita.length > 1 && (
                <div className="flex gap-1 mb-3 px-1">
                  {novita.map((_, i) => (
                    <div key={i} className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
                      <div className="h-full rounded-full bg-white" style={{ width: i <= indice ? '100%' : '0%' }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Card storia */}
              <motion.div
                key={storia.id}
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-[20px] overflow-hidden relative"
                style={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="px-5 pt-6 pb-5 text-center relative" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                  <span className="absolute top-3 right-3 text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.22)' }}>Novità</span>
                  {storia.immagine ? (
                    <img src={storia.immagine} alt="" className="w-16 h-16 rounded-[18px] mx-auto object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-[18px] mx-auto flex items-center justify-center text-3xl" style={{ background: 'rgba(255,255,255,0.18)' }}>
                      {storia.icona || '✨'}
                    </div>
                  )}
                </div>

                <div className="px-5 pt-4 pb-5">
                  <h3 className="text-center text-lg font-bold text-[var(--testo-primario)]">{storia.titolo}</h3>
                  {storia.sottotitolo && (
                    <p className="text-center text-sm text-[var(--testo-secondario)] mt-1.5 leading-relaxed">{storia.sottotitolo}</p>
                  )}

                  {punti.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4">
                      {punti.map((p, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: 'var(--accent-dim)' }}>
                            {p.icona || '•'}
                          </div>
                          <span className="text-sm text-[var(--testo-secondario)]">{p.testo}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {storia.ctaTesto && (
                    <button onClick={onCta} className="w-full mt-6 py-3.5 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-transform"
                      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                      {storia.ctaTesto}
                    </button>
                  )}
                </div>
              </motion.div>

              {/* Indietro / avanti, su ogni schermo: e' l'unico comando per scorrere
                  oltre allo swipe, che sul telefono non si scopre da soli */}
              <div className="flex justify-between mt-2 px-1">
                <button onClick={precedente} disabled={indice === 0}
                  className="text-white/70 disabled:opacity-25 flex items-center gap-1 text-sm py-2.5 pr-3">
                  <ChevronLeft size={18} /> Indietro
                </button>
                <button onClick={prossima} className="text-white/70 flex items-center gap-1 text-sm py-2.5 pl-3">
                  {indice < novita.length - 1 ? 'Avanti' : 'Chiudi'} <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
