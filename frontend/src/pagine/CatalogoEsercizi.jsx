// ============================================
// GymMaster — Catalogo Esercizi
// Pagina consultazione completa del database
// esercizi con video YouTube integrati
// ============================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { nomeEsercizio, nomeEsercizioOriginale} from '../utils/formattatori.js';
import { api } from '../config/api.js';
import { GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, X, Play, ChevronDown, ChevronUp, 
  Dumbbell, Target, Zap, ArrowLeft, SlidersHorizontal
} from 'lucide-react';
import SuggerisciEsercizio from '../componenti/specifici/SuggerisciEsercizio.jsx';

// --- Costanti per i filtri ---
const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Tutte le difficoltà' },
  { value: 'Principiante', label: '🟢 Principiante' },
  { value: 'Novizio', label: '🔵 Novizio' },
  { value: 'Intermedio', label: '🟡 Intermedio' },
  { value: 'Avanzato', label: '🟠 Avanzato' },
  { value: 'Esperto', label: '🔴 Esperto' },
  { value: 'Master', label: '⚫ Master' },
  { value: 'Gran Master', label: '💎 Gran Master' },
  { value: 'Leggendario', label: '👑 Leggendario' },
];

const BODY_REGION_OPTIONS = [
  { value: '', label: 'Tutte le regioni' },
  { value: 'Parte Superiore', label: '💪 Parte Superiore' },
  { value: 'Parte Inferiore', label: '🦵 Parte Inferiore' },
  { value: 'Core', label: '🧱 Core' },
  { value: 'Tutto il Corpo', label: '🏋️ Tutto il Corpo' },
];

const MECHANICS_OPTIONS = [
  { value: '', label: 'Tutte le meccaniche' },
  { value: 'Composto', label: '🔗 Composto' },
  { value: 'Isolamento', label: '🎯 Isolamento' },
];

const DIFFICULTY_COLORS = {
  'Principiante': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
  'Novizio': { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  'Intermedio': { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' },
  'Avanzato': { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316' },
  'Esperto': { bg: 'rgba(244, 63, 94, 0.15)', text: '#F43F5E' },
  'Master': { bg: 'rgba(139, 92, 246, 0.15)', text: '#8B5CF6' },
  'Gran Master': { bg: 'rgba(168, 85, 247, 0.15)', text: '#A855F7' },
  'Leggendario': { bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308' },
};

// --- Helper: converte URL YouTube in embed ---
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  // Formati supportati: youtu.be/ID, youtube.com/watch?v=ID
  let videoId = null;
  try {
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split(/[?&#]/)[0];
    } else if (url.includes('youtube.com/watch')) {
      videoId = new URL(url).searchParams.get('v');
    } else if (url.includes('youtube.com/embed/')) {
      videoId = url.split('embed/')[1]?.split(/[?&#]/)[0];
    }
  } catch (e) { /* URL non valido */ }
  
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

// --- Componente VideoPlayer ---
function VideoPlayer({ url, nome }) {
  const embedUrl = getYouTubeEmbedUrl(url);
  
  if (!embedUrl) return null;

  return (
    <div className="relative w-full rounded-[var(--raggio-md)] overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
      <iframe
        src={embedUrl}
        title={`Video: ${nome}`}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

// --- Componente Card Esercizio Espanso ---
function EsercizioCard({ esercizio, isExpanded, onToggle }) {
  const gruppo = GRUPPI_MUSCOLARI[esercizio.gruppoMuscoloPrimario];
  const diffColor = DIFFICULTY_COLORS[esercizio.difficulty] || { bg: 'rgba(100,100,100,0.15)', text: '#94A3B8' };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-[var(--accent-glow)]' : ''}`}
    >
      {/* Header clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-card-inner py-4 text-left hover:bg-[var(--bg-terziario)] transition-colors"
      >
        {/* Emoji gruppo */}
        <div className="w-10 h-10 rounded-[var(--raggio-sm)] flex items-center justify-center text-lg shrink-0"
             style={{ background: gruppo?.colore ? `${gruppo.colore}22` : 'var(--bg-terziario)' }}>
          {gruppo?.emoji || '💪'}
        </div>

        {/* Nome e info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--testo-primario)] truncate text-[0.95rem]">{nomeEsercizio(esercizio)}</p>
          {/* Nome originale inglese: è quello che si cerca nei video tutorial */}
          {nomeEsercizioOriginale(esercizio) && (
            <p className="text-[11px] text-[var(--testo-terziario)] truncate italic">{nomeEsercizioOriginale(esercizio)}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-[var(--testo-terziario)]">{esercizio.gruppoMuscoloPrimario}</span>
            {esercizio.attrezzatura && (
              <>
                <span className="text-[var(--testo-terziario)] text-[8px]">•</span>
                <span className="text-[11px] text-[var(--testo-terziario)]">{esercizio.attrezzatura.nome}</span>
              </>
            )}
          </div>
        </div>

        {/* Badge difficoltà */}
        {esercizio.difficulty && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
                style={{ background: diffColor.bg, color: diffColor.text }}>
            {esercizio.difficulty}
          </span>
        )}

        {/* Video indicator */}
        {esercizio.linkVideo && (
          <Play size={14} className="text-[var(--pericolo)] shrink-0" />
        )}

        {/* Expand icon */}
        {isExpanded ? <ChevronUp size={18} className="text-[var(--testo-terziario)] shrink-0" /> : <ChevronDown size={18} className="text-[var(--testo-terziario)] shrink-0" />}
      </button>

      {/* Contenuto espanso */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-card-inner pb-5 pt-2 border-t border-[var(--bordo-light)]">
              {/* Video */}
              {esercizio.linkVideo && (
                <div className="mt-4 mb-4">
                  <VideoPlayer url={esercizio.linkVideo} nome={nomeEsercizio(esercizio)} />
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {esercizio.difficulty && (
                  <InfoBadge label="Difficoltà" value={esercizio.difficulty} color={diffColor} />
                )}
                {esercizio.bodyRegion && (
                  <InfoBadge label="Regione" value={esercizio.bodyRegion} />
                )}
                {esercizio.mechanics && (
                  <InfoBadge label="Meccanica" value={esercizio.mechanics} />
                )}
                {esercizio.movementPattern && (
                  <InfoBadge label="Movimento" value={esercizio.movementPattern} />
                )}
                {esercizio.laterality && (
                  <InfoBadge label="Lateralità" value={esercizio.laterality} />
                )}
                {esercizio.posture && (
                  <InfoBadge label="Postura" value={esercizio.posture} />
                )}
                {esercizio.forceType && esercizio.forceType !== 'Unsorted*' && (
                  <InfoBadge label="Forza" value={esercizio.forceType} />
                )}
                {esercizio.classification && esercizio.classification !== 'Unsorted*' && (
                  <InfoBadge label="Tipo" value={esercizio.classification} />
                )}
              </div>

              {/* Muscoli */}
              {esercizio.gruppoMuscoloSecondario && (
                <div className="mt-3 flex items-start gap-2">
                  <Target size={14} className="text-[var(--testo-terziario)] mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-[var(--testo-terziario)] block">Muscoli secondari</span>
                    <span className="text-xs text-[var(--testo-secondario)]">{esercizio.gruppoMuscoloSecondario}</span>
                  </div>
                </div>
              )}

              {/* Descrizione */}
              {esercizio.descrizione && (
                <p className="text-xs text-[var(--testo-terziario)] mt-3 italic">{esercizio.descrizione}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- Badge Info ---
function InfoBadge({ label, value, color }) {
  return (
    <div className="rounded-[var(--raggio-sm)] p-2 bg-[var(--bg-terziario)]">
      <span className="text-[10px] text-[var(--testo-terziario)] block">{label}</span>
      <span className="text-xs font-medium" style={color ? { color: color.text } : {}}>{value}</span>
    </div>
  );
}

// --- Pagina Catalogo ---
const PAGE_SIZE = 30;

export default function CatalogoEsercizi() {
  const [esercizi, setEsercizi] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [filtroDifficulty, setFiltroDifficulty] = useState('');
  const [filtroRegion, setFiltroRegion] = useState('');
  const [filtroMechanics, setFiltroMechanics] = useState('');
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [paginaVisibile, setPaginaVisibile] = useState(1);
  const loaderRef = useRef(null);

  // Caricamento dati
  useEffect(() => {
    api.get('/esercizi')
      .then(r => setEsercizi(r.dati || []))
      .catch(err => console.error('Errore caricamento esercizi:', err))
      .finally(() => setCaricamento(false));
  }, []);

  // Filtri combinati
  const eserciziFiltrati = useMemo(() => {
    return esercizi.filter(e => {
      if (filtroGruppo && e.gruppoMuscoloPrimario !== filtroGruppo) return false;
      if (filtroDifficulty && e.difficulty !== filtroDifficulty) return false;
      if (filtroRegion && e.bodyRegion !== filtroRegion) return false;
      if (filtroMechanics && e.mechanics !== filtroMechanics) return false;
      if (ricerca) {
        const q = ricerca.toLowerCase();
        if (!`${e.nomeIt || ''} ${e.nome}`.toLowerCase().includes(q) && 
            !e.gruppoMuscoloPrimario?.toLowerCase().includes(q) &&
            !(e.gruppoMuscoloSecondario || '').toLowerCase().includes(q) &&
            !(e.attrezzatura?.nome || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [esercizi, filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics, ricerca]);

  // Paginazione virtuale (carica PAGE_SIZE alla volta)
  const eserciziVisibili = useMemo(() => {
    return eserciziFiltrati.slice(0, paginaVisibile * PAGE_SIZE);
  }, [eserciziFiltrati, paginaVisibile]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && eserciziVisibili.length < eserciziFiltrati.length) {
        setPaginaVisibile(prev => prev + 1);
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [eserciziVisibili.length, eserciziFiltrati.length]);

  // Reset pagina quando cambiano i filtri
  useEffect(() => {
    setPaginaVisibile(1);
    setExpandedId(null);
  }, [filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics, ricerca]);

  const gruppiUnici = useMemo(() => {
    return [...new Set(esercizi.map(e => e.gruppoMuscoloPrimario))].sort();
  }, [esercizi]);

  const filtriAttivi = [filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics].filter(Boolean).length;

  const resetFiltri = () => {
    setFiltroGruppo('');
    setFiltroDifficulty('');
    setFiltroRegion('');
    setFiltroMechanics('');
    setRicerca('');
  };

  return (
    <div className="py-2 pb-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-[var(--raggio-md)] flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-alt))' }}>
            <Dumbbell size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Catalogo Esercizi</h1>
            <p className="text-sm text-[var(--testo-terziario)]">
              {eserciziFiltrati.length.toLocaleString('it-IT')} esercizi
              {filtriAttivi > 0 && ` (filtrati da ${esercizi.length.toLocaleString('it-IT')})`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Barra ricerca + filtri */}
      <div className="sticky top-0 z-20 pb-3 -mx-4 px-4 md:-mx-10 md:px-10" style={{ background: 'linear-gradient(to bottom, var(--bg-primario) 70%, transparent)' }}>
        <div className="flex gap-2 items-center">
          {/* Ricerca */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--testo-terziario)]" />
            <input
              type="text"
              value={ricerca}
              onChange={e => setRicerca(e.target.value)}
              className="campo-input pl-10 pr-8"
              placeholder="Cerca esercizio, muscolo, attrezzatura..."
            />
            {ricerca && (
              <button onClick={() => setRicerca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--testo-terziario)] hover:text-[var(--testo-primario)]">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Toggle Filtri */}
          <button
            onClick={() => setMostraFiltri(!mostraFiltri)}
            className={`shrink-0 p-3 rounded-[var(--raggio-md)] border transition-all ${mostraFiltri || filtriAttivi > 0 ? 'bg-[var(--accent-dim)] border-[var(--accent-glow)] text-[var(--accent)]' : 'bg-[var(--bg-terziario)] border-[var(--bordo)] text-[var(--testo-secondario)]'}`}
          >
            <SlidersHorizontal size={20} />
            {filtriAttivi > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                {filtriAttivi}
              </span>
            )}
          </button>
        </div>

        {/* Pannello Filtri */}
        <AnimatePresence>
          {mostraFiltri && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <select value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} className="campo-input text-sm">
                  <option value="">Tutti i muscoli</option>
                  {gruppiUnici.map(g => (
                    <option key={g} value={g}>{GRUPPI_MUSCOLARI[g]?.emoji || '💪'} {g}</option>
                  ))}
                </select>

                <select value={filtroDifficulty} onChange={e => setFiltroDifficulty(e.target.value)} className="campo-input text-sm">
                  {DIFFICULTY_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>

                <select value={filtroRegion} onChange={e => setFiltroRegion(e.target.value)} className="campo-input text-sm">
                  {BODY_REGION_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>

                <select value={filtroMechanics} onChange={e => setFiltroMechanics(e.target.value)} className="campo-input text-sm">
                  {MECHANICS_OPTIONS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {filtriAttivi > 0 && (
                <button onClick={resetFiltri} className="mt-2 text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                  <X size={12} /> Rimuovi tutti i filtri
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Filters (chips regioni corpo) */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
        {BODY_REGION_OPTIONS.filter(r => r.value).map(region => (
          <button
            key={region.value}
            onClick={() => setFiltroRegion(filtroRegion === region.value ? '' : region.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              filtroRegion === region.value 
                ? 'bg-[var(--accent-dim)] border-[var(--accent-glow)] text-[var(--accent)]'
                : 'bg-[var(--bg-terziario)] border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--bordo-hover)]'
            }`}
          >
            {region.label}
          </button>
        ))}
      </div>

      {/* Lista Esercizi */}
      {caricamento ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : eserciziFiltrati.length === 0 ? (
        <div className="text-center py-16">
          <Dumbbell size={48} className="mx-auto mb-4 text-[var(--testo-terziario)]" />
          <p className="text-lg font-semibold text-[var(--testo-secondario)]">Nessun esercizio trovato</p>
          <p className="text-sm text-[var(--testo-terziario)] mt-1">Prova a modificare i filtri di ricerca</p>
          <button onClick={resetFiltri} className="mt-4 text-sm text-[var(--accent)] hover:underline">
            Rimuovi filtri
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {eserciziVisibili.map((es) => (
              <EsercizioCard
                key={es.id}
                esercizio={es}
                isExpanded={expandedId === es.id}
                onToggle={() => setExpandedId(expandedId === es.id ? null : es.id)}
              />
            ))}
          </div>

          {/* Infinite scroll trigger */}
          {eserciziVisibili.length < eserciziFiltrati.length && (
            <div ref={loaderRef} className="flex justify-center py-6">
              <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
            </div>
          )}

          {/* Counter finale */}
          {eserciziVisibili.length >= eserciziFiltrati.length && eserciziFiltrati.length > 0 && (
            <p className="text-center text-xs text-[var(--testo-terziario)] mt-6 pb-4">
              {eserciziFiltrati.length.toLocaleString('it-IT')} esercizi totali
            </p>
          )}
        </>
      )}

      {/* Suggerisci un esercizio mancante */}
      <div className="mt-8 pt-4">
        <SuggerisciEsercizio className="w-full" />
      </div>
    </div>
  );
}
