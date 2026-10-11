// ============================================
// GymMaster — Exercise Catalog
// Page for browsing the whole exercise database
// with embedded YouTube videos
// ============================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { nomeEsercizio, nomeEsercizioOriginale, nomeGruppo, nomeAttrezzatura, formattaNumero } from '../utils/formattatori.js';
import { useLingua } from '../hooks/useLingua.js';
import { api } from '../config/api.js';
import { indicizzaEsercizi, cerca } from '../utils/ricerca.js';
import { usePreferiti } from '../hooks/usePreferiti.js';
import { useAPezzi } from '../hooks/useAPezzi.js';
import { GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, X, Play, ChevronDown, ChevronUp, 
  Dumbbell, Target, SlidersHorizontal, Star
} from 'lucide-react';
import SuggerisciEsercizio from '../componenti/specifici/SuggerisciEsercizio.jsx';

// --- Constants for the filters ---
// The values are the Italian ones stored with the exercises (they are what is
// compared); the text shown comes from the translation files, see
// valoreTradotto() and etichettaOpzione() below.
const DIFFICULTY_OPTIONS = [
  { value: '' },
  { value: 'Principiante', emoji: '🟢' },
  { value: 'Novizio', emoji: '🔵' },
  { value: 'Intermedio', emoji: '🟡' },
  { value: 'Avanzato', emoji: '🟠' },
  { value: 'Esperto', emoji: '🔴' },
  { value: 'Master', emoji: '⚫' },
  { value: 'Gran Master', emoji: '💎' },
  { value: 'Leggendario', emoji: '👑' },
];

const BODY_REGION_OPTIONS = [
  { value: '' },
  { value: 'Parte Superiore', emoji: '💪' },
  { value: 'Parte Inferiore', emoji: '🦵' },
  { value: 'Core', emoji: '🧱' },
  { value: 'Tutto il Corpo', emoji: '🏋️' },
];

const MECHANICS_OPTIONS = [
  { value: '' },
  { value: 'Composto', emoji: '🔗' },
  { value: 'Isolamento', emoji: '🎯' },
];

/**
 * A stored value ("Principiante", "Parte Superiore", "Composto") in the
 * current language; one without a translation shows as it is.
 * `gruppo` is the part of the translation file it lives in.
 */
function valoreTradotto(t, gruppo, valore) {
  const chiave = `catalogoEsercizi.${gruppo}.${valore}`;
  const testo = t(chiave);
  return testo === chiave ? valore : testo;
}

/** What a filter option shows: emoji and name, or "All…" for the empty one */
function etichettaOpzione(t, gruppo, opzione) {
  if (!opzione.value) return t(`catalogoEsercizi.${gruppo}.tutte`);
  return `${opzione.emoji} ${valoreTradotto(t, gruppo, opzione.value)}`;
}

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

// --- Helper: converts a YouTube URL into an embed URL ---
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  // Supported formats: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
  let videoId = null;
  try {
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split(/[?&#]/)[0];
    } else if (url.includes('youtube.com/watch')) {
      videoId = new URL(url).searchParams.get('v');
    } else if (url.includes('youtube.com/embed/')) {
      videoId = url.split('embed/')[1]?.split(/[?&#]/)[0];
    }
  } catch { /* Invalid URL */ }
  
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

// --- VideoPlayer component ---
function VideoPlayer({ url, nome }) {
  const { t } = useLingua();
  const embedUrl = getYouTubeEmbedUrl(url);
  
  if (!embedUrl) return null;

  return (
    <div className="relative w-full rounded-[var(--raggio-md)] overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
      <iframe
        src={embedUrl}
        title={t('catalogoEsercizi.video', { nome })}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

// --- Expanded Exercise Card component ---
function EsercizioCard({ esercizio, isExpanded, onToggle, preferito, onPreferito }) {
  const { t } = useLingua();
  const gruppo = GRUPPI_MUSCOLARI[esercizio.gruppoMuscoloPrimario];
  const diffColor = DIFFICULTY_COLORS[esercizio.difficulty] || { bg: 'rgba(100,100,100,0.15)', text: '#94A3B8' };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-[var(--accent-glow)]' : ''}`}
    >
      <div className="flex items-stretch">
      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center gap-3 pl-6 pr-2 py-4 text-left hover:bg-[var(--bg-terziario)] transition-colors"
      >
        {/* Muscle group emoji */}
        <div className="w-10 h-10 rounded-[var(--raggio-sm)] flex items-center justify-center text-lg shrink-0"
             style={{ background: gruppo?.colore ? `${gruppo.colore}22` : 'var(--bg-terziario)' }}>
          {gruppo?.emoji || '💪'}
        </div>

        {/* Name and info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--testo-primario)] truncate text-[0.95rem]">{nomeEsercizio(esercizio)}</p>
          {/* Original English name: it is the one people search for in video tutorials */}
          {nomeEsercizioOriginale(esercizio) && (
            <p className="text-[11px] text-[var(--testo-terziario)] truncate italic">{nomeEsercizioOriginale(esercizio)}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-[var(--testo-terziario)]">{nomeGruppo(esercizio.gruppoMuscoloPrimario)}</span>
            {esercizio.attrezzatura && (
              <>
                <span className="text-[var(--testo-terziario)] text-[8px]">•</span>
                <span className="text-[11px] text-[var(--testo-terziario)]">{nomeAttrezzatura(esercizio.attrezzatura.nome)}</span>
              </>
            )}
          </div>
        </div>

        {/* Difficulty badge */}
        {esercizio.difficulty && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
                style={{ background: diffColor.bg, color: diffColor.text }}>
            {valoreTradotto(t, 'difficolta', esercizio.difficulty)}
          </span>
        )}

        {/* Video indicator */}
        {esercizio.linkVideo && (
          <Play size={14} className="text-[var(--pericolo)] shrink-0" />
        )}

        {/* Expand icon */}
        {isExpanded ? <ChevronUp size={18} className="text-[var(--testo-terziario)] shrink-0" /> : <ChevronDown size={18} className="text-[var(--testo-terziario)] shrink-0" />}
      </button>

      {/* Favorites star */}
      <button
        onClick={onPreferito}
        aria-pressed={preferito}
        aria-label={preferito ? t('catalogoEsercizi.togliPreferiti') : t('catalogoEsercizi.aggiungiPreferiti')}
        title={preferito ? t('catalogoEsercizi.togliPreferiti') : t('catalogoEsercizi.aggiungiPreferiti')}
        className={`shrink-0 pl-2 pr-5 flex items-center transition-colors hover:bg-[var(--bg-terziario)] ${preferito ? 'text-[#EAB308]' : 'text-[var(--testo-terziario)] hover:text-[var(--testo-secondario)]'}`}
      >
        <Star size={18} fill={preferito ? 'currentColor' : 'none'} />
      </button>
      </div>

      {/* Expanded content */}
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
                  <InfoBadge label={t('catalogoEsercizi.etichetta.difficolta')} value={valoreTradotto(t, 'difficolta', esercizio.difficulty)} color={diffColor} />
                )}
                {esercizio.bodyRegion && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.regione')} value={valoreTradotto(t, 'regione', esercizio.bodyRegion)} />
                )}
                {esercizio.mechanics && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.meccanica')} value={valoreTradotto(t, 'meccanica', esercizio.mechanics)} />
                )}
                {esercizio.movementPattern && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.movimento')} value={esercizio.movementPattern} />
                )}
                {esercizio.laterality && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.lateralita')} value={esercizio.laterality} />
                )}
                {esercizio.posture && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.postura')} value={esercizio.posture} />
                )}
                {esercizio.forceType && esercizio.forceType !== 'Unsorted*' && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.forza')} value={esercizio.forceType} />
                )}
                {esercizio.classification && esercizio.classification !== 'Unsorted*' && (
                  <InfoBadge label={t('catalogoEsercizi.etichetta.tipo')} value={esercizio.classification} />
                )}
              </div>

              {/* Muscles */}
              {esercizio.gruppoMuscoloSecondario && (
                <div className="mt-3 flex items-start gap-2">
                  <Target size={14} className="text-[var(--testo-terziario)] mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-[var(--testo-terziario)] block">{t('catalogoEsercizi.muscoliSecondari')}</span>
                    <span className="text-xs text-[var(--testo-secondario)]">
                      {/* Stored as a list of groups separated by commas */}
                      {esercizio.gruppoMuscoloSecondario.split(',').map(g => nomeGruppo(g.trim())).join(', ')}
                    </span>
                  </div>
                </div>
              )}

              {/* Description */}
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

// --- Info Badge ---
function InfoBadge({ label, value, color }) {
  return (
    <div className="rounded-[var(--raggio-sm)] p-2 bg-[var(--bg-terziario)]">
      <span className="text-[10px] text-[var(--testo-terziario)] block">{label}</span>
      <span className="text-xs font-medium" style={color ? { color: color.text } : {}}>{value}</span>
    </div>
  );
}

// --- Catalog page ---
const PAGE_SIZE = 30;

export default function CatalogoEsercizi() {
  const { t } = useLingua();
  const [esercizi, setEsercizi] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [filtroDifficulty, setFiltroDifficulty] = useState('');
  const [filtroRegion, setFiltroRegion] = useState('');
  const [filtroMechanics, setFiltroMechanics] = useState('');
  const [soloPreferiti, setSoloPreferiti] = useState(false);
  const { preferiti, alternaPreferito } = usePreferiti();
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const loaderRef = useRef(null);

  // Loaded pages and the open exercise belong to the filters you picked them
  // with: changing a filter starts over from the top, all closed. Adding a star
  // does not change the filters, so it does not restart the list.
  const chiaveFiltri = [filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics, soloPreferiti, ricerca].join('|');
  const [aperto, setAperto] = useState({ chiave: chiaveFiltri, id: null });
  const expandedId = aperto.chiave === chiaveFiltri ? aperto.id : null;
  const setExpandedId = id => setAperto({ chiave: chiaveFiltri, id });

  // Data loading
  useEffect(() => {
    api.get('/esercizi')
      .then(r => setEsercizi(r.dati || []))
      .catch(err => console.error('Errore caricamento esercizi:', err))
      .finally(() => setCaricamento(false));
  }, []);

  // Typo-tolerant search (utils/ricerca.js): the index is built once
  const indiceRicerca = useMemo(() => indicizzaEsercizi(esercizi, { conDettagli: true }), [esercizi]);

  // Combined filters; with a search, the results in order of relevance
  const eserciziFiltrati = useMemo(() => {
    return cerca(indiceRicerca, ricerca).filter(e => {
      if (filtroGruppo && e.gruppoMuscoloPrimario !== filtroGruppo) return false;
      if (filtroDifficulty && e.difficulty !== filtroDifficulty) return false;
      if (filtroRegion && e.bodyRegion !== filtroRegion) return false;
      if (filtroMechanics && e.mechanics !== filtroMechanics) return false;
      if (soloPreferiti && !preferiti.has(e.id)) return false;
      return true;
    });
  }, [indiceRicerca, filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics, soloPreferiti, preferiti, ricerca]);

  // Virtual pagination (loads PAGE_SIZE at a time)
  const { visibili: eserciziVisibili, restanti, mostraAltri } = useAPezzi(eserciziFiltrati, PAGE_SIZE, chiaveFiltri);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && restanti > 0) mostraAltri();
    }, { threshold: 0.1 });

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [eserciziVisibili.length, restanti, mostraAltri]);

  const gruppiUnici = useMemo(() => {
    return [...new Set(esercizi.map(e => e.gruppoMuscoloPrimario))].sort();
  }, [esercizi]);

  const filtriAttivi = [filtroGruppo, filtroDifficulty, filtroRegion, filtroMechanics, soloPreferiti].filter(Boolean).length;

  const resetFiltri = () => {
    setFiltroGruppo('');
    setFiltroDifficulty('');
    setFiltroRegion('');
    setFiltroMechanics('');
    setSoloPreferiti(false);
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
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{t('catalogoEsercizi.titolo')}</h1>
            <p className="text-sm text-[var(--testo-terziario)]">
              {filtriAttivi > 0
                ? t('catalogoEsercizi.conteggioFiltrati', { count: eserciziFiltrati.length, numero: formattaNumero(eserciziFiltrati.length), totale: formattaNumero(esercizi.length) })
                : t('catalogoEsercizi.conteggio', { count: eserciziFiltrati.length, numero: formattaNumero(eserciziFiltrati.length) })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Search bar + filters */}
      <div className="sticky top-0 z-20 pb-3 -mx-4 px-4 md:-mx-10 md:px-10" style={{ background: 'linear-gradient(to bottom, var(--bg-primario) 70%, transparent)' }}>
        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--testo-terziario)]" />
            <input
              type="text"
              value={ricerca}
              onChange={e => setRicerca(e.target.value)}
              className="campo-input pl-10 pr-8"
              placeholder={t('catalogoEsercizi.cerca')}
            />
            {ricerca && (
              <button onClick={() => setRicerca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--testo-terziario)] hover:text-[var(--testo-primario)]">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filters toggle */}
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

        {/* Filters panel */}
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
                  <option value="">{t('catalogoEsercizi.tuttiMuscoli')}</option>
                  {gruppiUnici.map(g => (
                    <option key={g} value={g}>{GRUPPI_MUSCOLARI[g]?.emoji || '💪'} {nomeGruppo(g)}</option>
                  ))}
                </select>

                <select value={filtroDifficulty} onChange={e => setFiltroDifficulty(e.target.value)} className="campo-input text-sm">
                  {DIFFICULTY_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{etichettaOpzione(t, 'difficolta', d)}</option>
                  ))}
                </select>

                <select value={filtroRegion} onChange={e => setFiltroRegion(e.target.value)} className="campo-input text-sm">
                  {BODY_REGION_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{etichettaOpzione(t, 'regione', r)}</option>
                  ))}
                </select>

                <select value={filtroMechanics} onChange={e => setFiltroMechanics(e.target.value)} className="campo-input text-sm">
                  {MECHANICS_OPTIONS.map(m => (
                    <option key={m.value} value={m.value}>{etichettaOpzione(t, 'meccanica', m)}</option>
                  ))}
                </select>
              </div>

              {filtriAttivi > 0 && (
                <button onClick={resetFiltri} className="mt-2 text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                  <X size={12} /> {t('catalogoEsercizi.rimuoviTuttiFiltri')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Filters (body region chips) */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setSoloPreferiti(!soloPreferiti)}
          aria-pressed={soloPreferiti}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
            soloPreferiti
              ? 'bg-[var(--accent-dim)] border-[var(--accent-glow)] text-[var(--accent)]'
              : 'bg-[var(--bg-terziario)] border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--bordo-hover)]'
          }`}
        >
          {preferiti.size > 0 ? t('catalogoEsercizi.preferitiConteggio', { numero: preferiti.size }) : t('catalogoEsercizi.preferiti')}
        </button>
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
            {etichettaOpzione(t, 'regione', region)}
          </button>
        ))}
      </div>

      {/* Exercise list */}
      {caricamento ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : eserciziFiltrati.length === 0 ? (
        <div className="text-center py-16">
          <Dumbbell size={48} className="mx-auto mb-4 text-[var(--testo-terziario)]" />
          <p className="text-lg font-semibold text-[var(--testo-secondario)]">{t('catalogoEsercizi.nessunEsercizio')}</p>
          <p className="text-sm text-[var(--testo-terziario)] mt-1">
            {soloPreferiti && preferiti.size === 0
              ? t('catalogoEsercizi.nessunPreferito')
              : t('catalogoEsercizi.provaFiltri')}
          </p>
          <button onClick={resetFiltri} className="mt-4 text-sm text-[var(--accent)] hover:underline">
            {t('catalogoEsercizi.rimuoviFiltri')}
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
                preferito={preferiti.has(es.id)}
                onPreferito={() => alternaPreferito(es.id)}
              />
            ))}
          </div>

          {/* Infinite scroll trigger */}
          {restanti > 0 && (
            <div ref={loaderRef} className="flex justify-center py-6">
              <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
            </div>
          )}

          {/* Final counter */}
          {restanti === 0 && eserciziFiltrati.length > 0 && (
            <p className="text-center text-xs text-[var(--testo-terziario)] mt-6 pb-4">
              {t('catalogoEsercizi.totali', { count: eserciziFiltrati.length, numero: formattaNumero(eserciziFiltrati.length) })}
            </p>
          )}
        </>
      )}

      {/* Suggest a missing exercise */}
      <div className="mt-8 pt-4">
        <SuggerisciEsercizio className="w-full" />
      </div>
    </div>
  );
}
