// ============================================
// GymMaster — Workout Live ("Azione")
// Interfaccia mobile-first per allenamento
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../config/api.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useTimer, formattaTempo } from '../hooks/useTimer.js';
import { RPE_LABELS } from '../utils/costanti.js';
import { formattaPeso, formattaData, nomeEsercizio} from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';

export default function WorkoutLive() {
  const { id } = useParams();
  const location = useLocation();
  const naviga = useNavigate();
  const wakeLock = useWakeLock();
  const timer = useTimer();

  // --- Persistenza progressi in localStorage ---
  // Chiave unica per sessione: sopravvive a tab kill / cambio app
  const CHIAVE_PROGRESSO = `gymmaster_workout_${id}`;
  const salvaTimeoutRef = useRef(null);

  // Recupera stato salvato (se esiste)
  const statoSalvato = useRef(null);
  if (statoSalvato.current === null) {
    try {
      const raw = localStorage.getItem(CHIAVE_PROGRESSO);
      statoSalvato.current = raw ? JSON.parse(raw) : false;
    } catch {
      statoSalvato.current = false;
    }
  }
  const ss = statoSalvato.current;

  const [sessione, setSessione] = useState(location.state?.sessione || null);
  const [esercizioIdx, setEsercizioIdx] = useState(ss ? ss.esercizioIdx : 0);
  const [serieCorrente, setSerieCorrente] = useState(ss ? ss.serieCorrente : 1);
  const [form, setForm] = useState(ss ? ss.form : { peso: '', rep: '', rpe: 7, minuti: '', resistenza: '' });
  const [serieCompletate, setSerieCompletate] = useState(ss ? ss.serieCompletate : []);
  const [mostraRiepilogo, setMostraRiepilogo] = useState(false);
  const [mostraSelettoreEsercizi, setMostraSelettoreEsercizi] = useState(false);
  const [mostraRicercaEsercizi, setMostraRicercaEsercizi] = useState(false);
  const [catalogoEsercizi, setCatalogoEsercizi] = useState([]);
  const [ricercaTesto, setRicercaTesto] = useState('');
  const [eserciziLive, setEserciziLive] = useState(ss ? ss.eserciziLive : []);
  const [caricamento, setCaricamento] = useState(!location.state?.sessione);
  const [timerAttivo, setTimerAttivo] = useState(false);
  const [nuoviRecord, setNuoviRecord] = useState([]);
  const [mostraVideo, setMostraVideo] = useState(false);
  const [tempoInizio] = useState(ss ? ss.tempoInizio : Date.now());
  const [oraAttuale, setOraAttuale] = useState(new Date());
  // Ultima volta che hai fatto ciascun esercizio, in qualsiasi scheda
  const [ultimiCarichi, setUltimiCarichi] = useState({});
  // Una serie alla volta: un doppio tocco registrava la stessa serie due volte
  const inviandoRef = useRef(false);
  const [inviando, setInviando] = useState(false);

  const salvaProgressi = (stato) => {
    try {
      localStorage.setItem(CHIAVE_PROGRESSO, JSON.stringify(stato));
    } catch {
      // localStorage pieno o non disponibile — ignora silenziosamente
    }
  };
  const statoAttuale = () => ({ esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio });

  // --- Salva progressi in localStorage (debounce 500ms) ---
  // Il ritardo serve solo a non scrivere a ogni tasto nei campi. Le serie
  // registrate si salvano subito, in completaSerie/saltaSerie: se l'app viene
  // chiusa in quel mezzo secondo, riaprendola la serie risulterebbe da fare e
  // verrebbe registrata una seconda volta.
  useEffect(() => {
    if (!id || mostraRiepilogo) return; // Non salvare dopo completamento

    if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    salvaTimeoutRef.current = setTimeout(() => salvaProgressi(statoAttuale()), 500);

    return () => {
      if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    };
  }, [esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio, id, mostraRiepilogo]);

  /** Pulisci progressi salvati (completamento o abbandono) */
  const pulisciProgressi = useCallback(() => {
    localStorage.removeItem(CHIAVE_PROGRESSO);
  }, [CHIAVE_PROGRESSO]);

  // Aggiorna orologio ogni secondo
  useEffect(() => {
    const interval = setInterval(() => setOraAttuale(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Carica sessione se non arriva dallo state
  useEffect(() => {
    if (!sessione && id) {
      api.get(`/sessioni/${id}`)
        .then(r => setSessione(r.dati))
        .catch(() => naviga('/schede'))
        .finally(() => setCaricamento(false));
    }
  }, [id]);

  // Attiva wake lock
  useEffect(() => {
    wakeLock.attiva();
    return () => wakeLock.disattiva();
  }, []);

  // Carichi dell'ultima volta per ogni esercizio in programma. Prima si
  // guardava solo l'ultima sessione della stessa scheda: con una scheda nuova
  // non compariva nulla, anche se l'esercizio era gia' stato fatto altrove.
  const idEsercizi = [...new Set(eserciziLive.map(e => e.esercizioId))].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!sessione?.id || !idEsercizi) return;
    let annullato = false;
    api.get(`/sessioni/ultimi-carichi?esercizi=${idEsercizi}&escludi=${sessione.id}`)
      .then(r => { if (!annullato) setUltimiCarichi(r.dati || {}); })
      .catch(() => { /* il riferimento e' un aiuto: senza, si procede */ });
    return () => { annullato = true; };
  }, [sessione?.id, idEsercizi]);

  useEffect(() => {
    // Inizializza eserciziLive solo se non già ripristinati da localStorage
    if (sessione?.scheda?.esercizi && eserciziLive.length === 0) {
      setEserciziLive([...sessione.scheda.esercizi]);
    }
  }, [sessione]);

  const apriRicerca = async () => {
    setMostraRicercaEsercizi(true);
    if (catalogoEsercizi.length === 0) {
      try {
        const r = await api.get('/esercizi');
        setCatalogoEsercizi(r.dati || []);
      } catch (err) { console.error(err); }
    }
  };

  const aggiungiEsercizioExtra = (es) => {
    const nuovoEsercizio = {
      esercizioId: es.id,
      esercizio: es,
      serieTarget: 3, // Default
      repTarget: 10,
      recuperoSecondi: 90
    };
    setEserciziLive(prev => {
      const aggiornati = [...prev, nuovoEsercizio];
      cambiaEsercizio(aggiornati.length - 1);
      return aggiornati;
    });
    setRicercaTesto('');
    setMostraRicercaEsercizi(false);
  };

  const esercizi = eserciziLive;
  const esercizioAttuale = esercizi[esercizioIdx];

  // Ricerca sul nome italiano e sull'originale inglese
  const testoRicerca = ricercaTesto.trim().toLowerCase();
  const eserciziFiltrati = catalogoEsercizi.filter(e =>
    `${e.nomeIt || ''} ${e.nome}`.toLowerCase().includes(testoRicerca)
  );

  // --- Tracking esercizi completati ---
  // Un esercizio è "completato" quando ha >= serieTarget serie registrate
  const contaSeriePerEsercizio = useCallback((idxEsercizio) => {
    const es = esercizi[idxEsercizio];
    if (!es) return 0;
    return serieCompletate.filter(s => s.esercizioId === es.esercizioId).length;
  }, [esercizi, serieCompletate]);

  const esercizioCompletato = useCallback((idxEsercizio) => {
    const es = esercizi[idxEsercizio];
    if (!es) return false;
    return contaSeriePerEsercizio(idxEsercizio) >= es.serieTarget;
  }, [esercizi, contaSeriePerEsercizio]);

  // Trova prossimo esercizio NON completato (partendo da indice dato)
  const prossimoEsercizioNonCompletato = useCallback((daDove = 0) => {
    for (let i = daDove; i < esercizi.length; i++) {
      if (!esercizioCompletato(i) && i !== esercizioIdx) return i;
    }
    // Se non trovato dopo, cerca dall'inizio (esercizi saltati prima)
    for (let i = 0; i < daDove; i++) {
      if (!esercizioCompletato(i) && i !== esercizioIdx) return i;
    }
    return -1; // Tutti completati
  }, [esercizi, esercizioCompletato, esercizioIdx]);

  // Esercizi saltati (non completati, prima dell'attuale nella lista)
  const eserciziSaltati = esercizi
    .map((es, idx) => ({ ...es, idx }))
    .filter((_, idx) => idx !== esercizioIdx && !esercizioCompletato(idx) && contaSeriePerEsercizio(idx) === 0);

  // Prossimo indice non completato (per navigazione)
  const prossimoIdx = prossimoEsercizioNonCompletato(esercizioIdx + 1);
  const tuttiCompletati = prossimoIdx === -1 && esercizioCompletato(esercizioIdx);

  // Calcolo Orari
  const oreMinuti = oraAttuale.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dataOdierna = oraAttuale.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  
  const millisecondiTrascorsi = Math.max(0, oraAttuale.getTime() - tempoInizio);
  const oreTrascorsi = Math.floor(millisecondiTrascorsi / 3600000);
  const minutiTrascorsi = Math.floor((millisecondiTrascorsi % 3600000) / 60000);
  const secondiTrascorsi = Math.floor((millisecondiTrascorsi % 60000) / 1000);
  const cronometro = `${oreTrascorsi > 0 ? oreTrascorsi + ':' : ''}${oreTrascorsi > 0 ? minutiTrascorsi.toString().padStart(2, '0') : minutiTrascorsi}:${secondiTrascorsi.toString().padStart(2, '0')}`;

  // Serie completate per l'esercizio attuale
  const serieEsercizio = serieCompletate.filter(
    s => s.esercizioId === esercizioAttuale?.esercizioId
  );

  const isCardio = esercizioAttuale?.esercizio?.attrezzatura?.categoria === 'CARDIO' || 
                   esercizioAttuale?.esercizio?.gruppoMuscoloPrimario?.toLowerCase() === 'cardio';

  // Serie dell'ultima volta per l'esercizio attuale
  const caricoPrecedente = ultimiCarichi[esercizioAttuale?.esercizioId] || null;
  const seriePrecedenti = caricoPrecedente?.serie || [];
  // Riferimento per la serie da fare: la stessa serie dell'ultima volta, o
  // l'ultima fatta se allora ne erano state fatte meno
  const riferimento = seriePrecedenti.length
    ? ([...seriePrecedenti].reverse().find(sp => sp.serieNumero === serieCorrente) || seriePrecedenti[seriePrecedenti.length - 1])
    : null;
  const riferimentoCardio = riferimento?.durataMinuti > 0;

  const usaRiferimento = () => {
    if (!riferimento) return;
    // Solo i parametri da impostare prima della serie: le ripetizioni si
    // scrivono dopo averla fatta, e precompilate verrebbero registrate per sbaglio
    if (riferimentoCardio) {
      setForm(p => ({ ...p, minuti: String(riferimento.durataMinuti), resistenza: riferimento.livelloResistenza ? String(riferimento.livelloResistenza) : p.resistenza }));
    } else {
      setForm(p => ({ ...p, peso: String(riferimento.pesoEffettivo) }));
    }
  };

  const completaSerie = async () => {
    if (inviandoRef.current) return;
    if (isCardio) {
      if (!form.minuti) return;
    } else {
      if (!form.peso || !form.rep) return;
    }

    const datiSerie = {
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: serieCorrente,
      pesoEffettivo: isCardio ? 0 : parseFloat(form.peso),
      repEffettive: isCardio ? 0 : parseInt(form.rep),
      rpe: form.rpe,
      completato: true,
      ...(isCardio && {
        durataMinuti: parseInt(form.minuti),
        livelloResistenza: parseFloat(form.resistenza) || 0
      })
    };

    inviandoRef.current = true;
    setInviando(true);
    try {
      const risposta = await api.post(`/sessioni/${sessione.id}/serie`, datiSerie);
      const nuoveCompletate = [...serieCompletate, risposta.dati];
      salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate, serieCorrente: serieCorrente + 1 });
      setSerieCompletate(nuoveCompletate);
      setSerieCorrente(serieCorrente + 1);

      // Avvia timer recupero
      if (esercizioAttuale?.recuperoSecondi) {
        timer.avvia(esercizioAttuale.recuperoSecondi);
        setTimerAttivo(true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      inviandoRef.current = false;
      setInviando(false);
    }
  };

  const saltaSerie = async () => {
    if (inviandoRef.current) return;
    inviandoRef.current = true;
    setInviando(true);
    try {
      await api.post(`/sessioni/${sessione.id}/serie`, {
        esercizioId: esercizioAttuale.esercizioId,
        serieNumero: serieCorrente,
        pesoEffettivo: 0,
        repEffettive: 0,
        completato: false,
        motivoSaltoEsercizio: 'Saltata'
      });
      salvaProgressi({ ...statoAttuale(), serieCorrente: serieCorrente + 1 });
      setSerieCorrente(serieCorrente + 1);
    } catch (err) {
      console.error(err);
    } finally {
      inviandoRef.current = false;
      setInviando(false);
    }
  };

  const prossimoEsercizio = () => {
    // Naviga al prossimo esercizio NON completato
    if (prossimoIdx !== -1) {
      cambiaEsercizio(prossimoIdx);
    }
  };

  const cambiaEsercizio = (nuovoIndice) => {
    setEsercizioIdx(nuovoIndice);
    setSerieCorrente(1);
    setForm(prev => ({ ...prev, rep: '', minuti: '' })); // Mantieni peso e resistenza
    timer.resetta();
    setTimerAttivo(false);
    setMostraSelettoreEsercizi(false);
    setMostraVideo(false);
  };

  const completaAllenamento = async () => {
    try {
      const risposta = await api.patch(`/sessioni/${sessione.id}/completa`, {
        noteFinali: ''
      });
      setNuoviRecord(risposta.recordPersonali || []);
      setMostraRiepilogo(true);
      pulisciProgressi(); // Pulisci localStorage al completamento
      wakeLock.disattiva();
    } catch (err) {
      alert(err.message);
    }
  };

  // Se il timer finisce, nascondi l'overlay
  useEffect(() => {
    if (timerAttivo && timer.secondiRimasti === 0 && !timer.inCorso) {
      setTimerAttivo(false);
    }
  }, [timer.secondiRimasti, timer.inCorso, timerAttivo]);

  if (caricamento) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primario)]">
        <div className="w-12 h-12 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  // Riepilogo finale
  if (mostraRiepilogo) {
    return (
      <div className="min-h-screen bg-[var(--bg-primario)] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Allenamento completato!</h1>
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">{serieCompletate.length}</p>
              <p className="text-xs text-[var(--testo-terziario)]">Serie completate</p>
            </div>
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">
                {formattaPeso(serieCompletate.reduce((s, l) => s + ((l.pesoEffettivo || 0) * (l.repEffettive || 0)), 0))} kg
              </p>
              <p className="text-xs text-[var(--testo-terziario)]">Volume totale</p>
            </div>
          </div>

          {/* Nuovi record */}
          {nuoviRecord.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-[var(--successo)] mb-2">🏆 Nuovi Record!</h3>
              {nuoviRecord.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded bg-[var(--successo-dim)]">
                  <span className="text-sm">{nomeEsercizio(r.esercizio)}</span>
                  <span className="font-bold text-[var(--successo)]">{formattaPeso(r.pesoMaxRaggiunto)} kg</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => naviga('/dashboard')} className="btn-primario w-full">
            Torna alla Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (!esercizioAttuale) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center">
          <p className="text-[var(--testo-secondario)]">Nessun esercizio nella scheda</p>
          <button onClick={() => naviga('/schede')} className="btn-primario mt-4">Torna alle schede</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primario)] flex flex-col"
         style={{ 
           paddingBottom: 'calc(16px + var(--safe-bottom))',
           paddingLeft: 'var(--safe-left)',
           paddingRight: 'var(--safe-right)'
         }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--bordo)]"
           style={{ paddingTop: 'calc(16px + var(--safe-top))' }}>
        <div>
          <button 
            onClick={() => setMostraSelettoreEsercizi(true)}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors bg-[var(--accent-dim)] px-2 py-1 rounded-[var(--raggio-sm)]"
          >
            Esercizio {esercizioIdx + 1}/{esercizi.length} ▾
          </button>
        </div>
        <div className="flex items-center gap-2">
          {wakeLock.attivo && <span className="text-xs text-[var(--successo)]">🔒 Schermo attivo</span>}
          <button onClick={completaAllenamento}
                  className="text-sm font-medium text-[var(--pericolo)] px-3 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--pericolo-dim)]">
            Termina
          </button>
        </div>
      </div>

      {/* Esercizio attuale */}
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-lg mx-auto w-full">
        {/* Orologio & Cronometro */}
        <div className="flex items-center justify-between bg-[var(--bg-terziario)] p-3 rounded-[var(--raggio-md)] -mt-2 shadow-sm border border-[var(--bordo)]">
          {/* Left: Orologio */}
          <div className="flex flex-col items-start">
            <span className="text-2xl font-bold tabular-nums leading-none text-[var(--testo-primario)]">{oreMinuti}</span>
            <span className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wider mt-1">{dataOdierna}</span>
          </div>

          {/* Right: Cronometro Allenamento */}
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-[var(--accent)] tabular-nums leading-none">{cronometro}</span>
            <span className="text-[10px] text-[var(--accent)] opacity-80 uppercase tracking-wider mt-1">Tempo Allenamento</span>
          </div>
        </div>

        {/* Nome esercizio */}
        <motion.div key={esercizioIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="text-center py-2">
          <h2 className="text-xl md:text-2xl font-bold">{nomeEsercizio(esercizioAttuale.esercizio)}</h2>
          <p className="text-sm text-[var(--testo-terziario)] mt-1">
            {esercizioAttuale.esercizio.gruppoMuscoloPrimario}
            {isCardio
              ? (() => {
                  const p = [];
                  if (esercizioAttuale.durataMinuti) p.push(`${esercizioAttuale.durataMinuti} min`);
                  if (esercizioAttuale.velocitaKmh != null) p.push(`${esercizioAttuale.velocitaKmh} km/h`);
                  if (esercizioAttuale.inclinazione != null) p.push(`incl ${esercizioAttuale.inclinazione}%`);
                  if (esercizioAttuale.livelloResistenza != null) p.push(`liv ${esercizioAttuale.livelloResistenza}`);
                  return p.length ? ' · ' + p.join(' · ') : '';
                })()
              : ` · ${esercizioAttuale.serieTarget} × ${esercizioAttuale.repTarget} · ${esercizioAttuale.recuperoSecondi}s rec.`}
          </p>
        </motion.div>

        {/* Video esercizio (YouTube embed) */}
        {esercizioAttuale.esercizio.linkVideo && (() => {
          const url = esercizioAttuale.esercizio.linkVideo;
          // Estrai videoId da youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
          let videoId = null;
          const mShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
          const mLong = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
          const mEmbed = url.match(/embed\/([a-zA-Z0-9_-]+)/);
          videoId = mShort?.[1] || mLong?.[1] || mEmbed?.[1];

          if (!videoId) return null;
          const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;

          return (
            <div className="workout-video-sezione">
              <button
                onClick={() => setMostraVideo(v => !v)}
                className="workout-video-toggle"
              >
                <span className="workout-video-toggle-icona">🎬</span>
                <span>{mostraVideo ? 'Nascondi video' : 'Vedi come si esegue'}</span>
                <span className="workout-video-toggle-freccia">{mostraVideo ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence>
                {mostraVideo && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="workout-video-container">
                      <iframe
                        src={embedUrl}
                        className="workout-video-player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={nomeEsercizio(esercizioAttuale.esercizio)}
                        frameBorder="0"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* Serie completate */}
        {serieEsercizio.length > 0 && (
          <div className="flex flex-col gap-1">
            {serieEsercizio.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-[var(--raggio-sm)] bg-[var(--successo-dim)]">
                <span className="text-sm text-[var(--successo)] font-medium">Serie {i + 1} ✓</span>
                <span className="text-sm">
                  {s.durataMinuti ? (
                    `${s.durataMinuti} min ${s.livelloResistenza ? `(Liv. ${s.livelloResistenza})` : ''}`
                  ) : (
                    `${formattaPeso(s.pesoEffettivo)} kg × ${s.repEffettive}`
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Timer recupero overlay */}
        <AnimatePresence>
          {timerAttivo && timer.secondiRimasti > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-6 text-center"
            >
              <p className="text-xs text-[var(--testo-terziario)] mb-2">RECUPERO</p>
              <p className="text-[120px] font-extrabold testo-gradient mb-4 leading-none tabular-nums tracking-tighter">
                {formattaTempo(timer.secondiRimasti)}
              </p>
              <div className="w-full h-2 rounded-full bg-[var(--bg-terziario)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--accent)', width: `${(timer.secondiRimasti / esercizioAttuale.recuperoSecondi) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <button onClick={() => { timer.resetta(); setTimerAttivo(false); }}
                      className="mt-4 text-sm text-[var(--accent)] font-medium px-4 py-1.5 rounded-full border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors">
                Salta recupero →
              </button>
              <div className="mt-4 pt-3 border-t border-[var(--bordo)]">
                <p className="text-xs text-[var(--testo-secondario)] font-semibold uppercase tracking-wider">
                  {serieCorrente <= esercizioAttuale.serieTarget 
                    ? `Prossima: Serie ${serieCorrente} di ${esercizioAttuale.serieTarget}`
                    : (prossimoIdx !== -1
                        ? `Prossimo Esercizio: ${nomeEsercizio(esercizi[prossimoIdx].esercizio)}`
                        : `Prossima Azione: Fine Allenamento`)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input serie — solo se timer non attivo */}
        {(!timerAttivo || timer.secondiRimasti === 0) && serieCorrente <= esercizioAttuale.serieTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-center text-[var(--testo-secondario)]">
              Serie {serieCorrente} / {esercizioAttuale.serieTarget}
            </p>

            {/* Ultima volta: per decidere il carico prima di iniziare la serie */}
            {riferimento && (
              <button
                type="button"
                onClick={usaRiferimento}
                className="flex items-center justify-between gap-3 w-full px-3 py-2.5 rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)] text-left hover:border-[var(--accent)] transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-[var(--testo-terziario)]">
                    Ultima volta · {formattaData(caricoPrecedente.data)}
                  </span>
                  <span className="block text-base font-bold tabular-nums">
                    {riferimentoCardio
                      ? `${riferimento.durataMinuti} min${riferimento.livelloResistenza ? ` · liv. ${riferimento.livelloResistenza}` : ''}`
                      : `${riferimento.pesoEffettivo > 0 ? `${formattaPeso(riferimento.pesoEffettivo)} kg` : 'Corpo libero'} × ${riferimento.repEffettive}`}
                  </span>
                </span>
                <span className="text-xs font-bold text-[var(--accent)] shrink-0">Usa</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              {isCardio ? (
                <>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">Durata (minuti)</label>
                    <input type="number" value={form.minuti} onChange={e => setForm(p => ({...p, minuti: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder="0"
                           inputMode="numeric" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">Resistenza / Liv.</label>
                    <input type="number" value={form.resistenza} onChange={e => setForm(p => ({...p, resistenza: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder="0"
                           inputMode="decimal" step="0.5" min="0" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">Peso (kg)</label>
                    <input type="number" value={form.peso} onChange={e => setForm(p => ({...p, peso: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder={riferimento && !riferimentoCardio ? String(riferimento.pesoEffettivo) : '0'}
                           inputMode="decimal" step="0.5" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">Ripetizioni</label>
                    <input type="number" value={form.rep} onChange={e => setForm(p => ({...p, rep: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder={riferimento && !riferimentoCardio ? String(riferimento.repEffettive) : '0'}
                           inputMode="numeric" min="0" />
                  </div>
                </>
              )}
            </div>

            {/* RPE slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[var(--testo-terziario)]">RPE (sforzo percepito)</label>
                <span className="text-xs font-medium text-[var(--accent)]">{form.rpe} — {RPE_LABELS[form.rpe]}</span>
              </div>
              <input type="range" min="1" max="10" value={form.rpe}
                     onChange={e => setForm(p => ({...p, rpe: parseInt(e.target.value)}))}
                     className="w-full accent-[var(--accent)]" />
            </div>

            {/* Bottoni azione — ENORMI */}
            <div className="flex flex-col gap-2 mt-2">
              <button onClick={completaSerie} disabled={inviando || (isCardio ? !form.minuti : (!form.peso || !form.rep))}
                      className={`btn-enorme ${
                        (isCardio ? !form.minuti : (!form.peso || !form.rep)) 
                          ? 'opacity-80 bg-[var(--pericolo-dim)] text-[var(--pericolo)] border border-[var(--pericolo)]/50 cursor-not-allowed' 
                          : 'successo'
                      }`}>
                ✓ Serie Completata
              </button>

              <button onClick={saltaSerie} disabled={inviando}
                      className="btn-enorme disabled:opacity-60" style={{ background: 'var(--bg-terziario)', color: 'var(--testo-secondario)' }}>
                ⏭ Salta Serie
              </button>

              <button onClick={() => setMostraSelettoreEsercizi(true)}
                      className="btn-enorme mt-2" style={{ background: 'var(--bg-primario)', border: '1px solid var(--bordo)' }}>
                🔄 Cambia Esercizio
              </button>
            </div>
          </div>
        )}

        {/* Prossimo esercizio / Completa */}
        {serieCorrente > esercizioAttuale.serieTarget && (
          <div className="flex flex-col gap-3 mt-4">
            {prossimoIdx !== -1 ? (
              <>
                <button onClick={prossimoEsercizio} className="btn-enorme">
                  {nomeEsercizio(esercizi[prossimoIdx].esercizio)} →
                </button>

                {/* Promemoria esercizi saltati */}
                {eserciziSaltati.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[var(--raggio-md)] border border-[var(--attenzione)] overflow-hidden"
                    style={{ background: 'var(--attenzione-dim, rgba(245,158,11,0.1))' }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--attenzione)]/30">
                      <span className="text-sm">⏭️</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--attenzione, #F59E0B)' }}>
                        {eserciziSaltati.length} eserciz{eserciziSaltati.length === 1 ? 'io' : 'i'} da fare
                      </span>
                    </div>
                    <div className="px-3 py-2 flex flex-col gap-1">
                      {eserciziSaltati.slice(0, 4).map(es => (
                        <button
                          key={es.idx}
                          onClick={() => cambiaEsercizio(es.idx)}
                          className="flex items-center justify-between text-xs py-1 hover:text-[var(--accent)] transition-colors"
                        >
                          <span className="text-[var(--testo-secondario)]">{nomeEsercizio(es.esercizio)}</span>
                          <span style={{ color: 'var(--attenzione, #F59E0B)' }}>Vai →</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <button onClick={completaAllenamento} className="btn-enorme successo">
                🏆 Completa Allenamento
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drawer Selettore Esercizi */}
      <AnimatePresence>
        {mostraSelettoreEsercizi && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setMostraSelettoreEsercizi(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="glass-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-[var(--bordo)] flex items-center justify-between sticky top-0 bg-[var(--bg-primario)]/90 backdrop-blur-md z-10">
                <h3 className="font-bold text-lg">Seleziona Esercizio</h3>
                <button onClick={() => setMostraSelettoreEsercizi(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-terziario)] hover:bg-[var(--bordo-hover)] transition-colors">✕</button>
              </div>
              <div className="p-4 overflow-y-auto flex flex-col gap-2" style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
                {esercizi.map((es, idx) => {
                  const tutteSeriFatte = esercizioCompletato(idx);
                  const seriFatte = contaSeriePerEsercizio(idx);
                  const inCorso = idx === esercizioIdx;
                  const cardioItem = es.durataMinuti != null || es.riscaldamento;
                  return (
                    <button
                      key={es.id || idx}
                      onClick={() => cambiaEsercizio(idx)}
                      className={`flex items-center gap-3 p-3 text-left rounded-xl border transition-all ${
                        inCorso 
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)]' 
                          : tutteSeriFatte
                            ? 'border-[var(--successo)]/30 bg-[var(--successo-dim)]'
                            : 'border-transparent bg-[var(--bg-terziario)] hover:border-[var(--bordo-hover)]'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        inCorso ? 'bg-[var(--accent)] text-white' 
                        : tutteSeriFatte ? 'bg-[var(--successo)] text-white'
                        : 'bg-[var(--bg-primario)] text-[var(--testo-secondario)]'
                      }`}>
                        {tutteSeriFatte ? '✓' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate ${
                          inCorso ? 'text-[var(--accent)]' 
                          : tutteSeriFatte ? 'text-[var(--successo)]' : ''
                        }`}>
                          {nomeEsercizio(es.esercizio)}
                        </p>
                        <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
                          {tutteSeriFatte
                            ? (cardioItem ? 'Completato' : `${seriFatte}/${es.serieTarget} serie — completato`)
                            : seriFatte > 0
                              ? (cardioItem ? 'In corso' : `${seriFatte}/${es.serieTarget} serie fatte`)
                              : (cardioItem ? (es.durataMinuti ? `${es.durataMinuti} min` : 'Cardio') : `${es.serieTarget}x${es.repTarget}`)
                          }
                        </p>
                      </div>
                      {tutteSeriFatte && !inCorso && (
                        <div className="text-[var(--successo)] shrink-0 pr-2 text-lg">✅</div>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={apriRicerca}
                  className="flex items-center justify-center gap-2 p-3 mt-2 rounded-xl border border-dashed border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
                >
                  ➕ Aggiungi Esercizio Extra
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer Ricerca Esercizi */}
      <AnimatePresence>
        {mostraRicercaEsercizi && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setMostraRicercaEsercizi(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="glass-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-[var(--bordo)] flex items-center justify-between sticky top-0 bg-[var(--bg-primario)]/90 backdrop-blur-md z-10">
                <h3 className="font-bold text-lg">Aggiungi Esercizio</h3>
                <button onClick={() => setMostraRicercaEsercizi(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-terziario)] hover:bg-[var(--bordo-hover)] transition-colors">✕</button>
              </div>
              
              <div className="p-4 border-b border-[var(--bordo)]">
                <input
                  type="text"
                  placeholder="Cerca esercizio..."
                  value={ricercaTesto}
                  onChange={(e) => setRicercaTesto(e.target.value)}
                  className="w-full bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-xl px-4 py-3 text-sm focus:border-[var(--accent)] outline-none"
                  autoFocus
                />
              </div>

              <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2" style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
                {eserciziFiltrati.map((es) => (
                  <button
                    key={es.id}
                    onClick={() => aggiungiEsercizioExtra(es)}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--bordo)] bg-[var(--bg-terziario)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors text-left"
                  >
                    <div>
                      <p className="font-semibold text-sm">{nomeEsercizio(es)}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{es.gruppoMuscoloPrimario} · {es.attrezzatura?.nome || 'Varie'}</p>
                    </div>
                    <span className="text-[var(--accent)] font-bold">➕</span>
                  </button>
                ))}
                {catalogoEsercizi.length > 0 && eserciziFiltrati.length === 0 && (
                  <p className="text-center text-[var(--testo-terziario)] text-sm py-4">Nessun esercizio trovato</p>
                )}
                {catalogoEsercizi.length === 0 && (
                  <p className="text-center text-[var(--testo-terziario)] text-sm py-4">Caricamento esercizi...</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
