// ============================================
// GymMaster — Workout Live ("Azione")
// Mobile-first interface for the workout
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../config/api.js';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';
import { localeCorrente } from '../i18n/index.js';
import { accoda, inviaOra, togliDallaCoda } from '../utils/codaSerie.js';
import { useCodaSerie, useVoceInCoda } from '../hooks/useCodaSerie.js';
import { entro, chiudiNotificheRecupero } from '../utils/push.js';
import { indicizzaEsercizi, cerca, preferitiPrima } from '../utils/ricerca.js';
import { usePreferiti } from '../hooks/usePreferiti.js';
import { useAPezzi } from '../hooks/useAPezzi.js';
import { statoDaSessione, ESERCIZIO_EXTRA } from '../utils/ripresa.js';
import { propostaCarico, incrementoPer } from '../utils/progressione.js';
import { diLavoro, volumeDi, ordinaSerie, rampaRiscaldamento, pesoDrop } from '../utils/tipiSerie.js';
import { usePushNotifiche } from '../hooks/usePushNotifiche.js';
import { bilanciereDi, dischiPerLato, descriviDischi } from '../utils/dischi.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useTimer, formattaTempo } from '../hooks/useTimer.js';
import { leggiRecupero, salvaRecupero, togliRecupero } from '../utils/recupero.js';
import { RPE_LABELS, RIAPERTURA_MAX_MINUTI } from '../utils/costanti.js';
import { formattaPeso, formattaNumero, formattaData, formattaDurata, nomeEsercizio, nomeGruppo, nomeAttrezzatura } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import FineAllenamento from '../componenti/specifici/FineAllenamento.jsx';

/** The load proposal by outcome: label (a translation key) and colors of the card */
const STILE_PROPOSTA = {
  sali: { etichetta: 'workoutLive.proposta.sali', colore: 'var(--successo)', bordo: 'var(--successo)', sfondo: 'var(--successo-dim)' },
  resta: { etichetta: 'workoutLive.proposta.resta', colore: 'var(--accent)', bordo: 'var(--accent-glow)', sfondo: 'var(--accent-dim)' },
  scarico: { etichetta: 'workoutLive.proposta.scarico', colore: 'var(--avviso)', bordo: 'var(--avviso)', sfondo: 'var(--bg-terziario)' }
};
const kg = n => n.toLocaleString(localeCorrente(), { maximumFractionDigits: 2 });
/** Now, read in event handlers (a rest that starts), not while rendering */
const adesso = () => Date.now();

/** How long "Termina" (finish) waits for the queue to send, before showing the summary offline */
const ATTESA_CHIUSURA_MS = 8000;
/** A set is usually sent in a moment: the warning only for those stuck for a few seconds */
const CODA_FERMA_MS = 3000;
/** What the queue needs for a workout (also to recreate it, if it disappears on the server) */
const perLaCoda = s => ({ id: s.id, schedaId: s.schedaId, dataInizio: s.dataInizio });

export default function WorkoutLive() {
  const { t } = useLingua();
  const { id } = useParams();
  const location = useLocation();
  const naviga = useNavigate();
  const wakeLock = useWakeLock();
  // A rest still running when the app was closed carries on, with the time
  // that passed meanwhile (utils/recupero.js)
  const [recuperoSalvato] = useState(() => leggiRecupero(id, Date.now()));
  const recuperoRef = useRef(recuperoSalvato);
  const timer = useTimer(recuperoSalvato?.fine ?? null);
  // With push notifications on, the end of the rest arrives even with the screen locked
  const push = usePushNotifiche();
  const avvisoRecuperoRef = useRef(recuperoSalvato?.avvisato ?? false);
  // Sets, skips and "Termina" go through the queue on the phone (utils/codaSerie.js):
  // they are sent right away if there is a network, otherwise as soon as it is back
  const { utente } = useAuth();
  const utenteId = utente?.id;
  const coda = useCodaSerie(utenteId);

  // --- Progress persistence in localStorage ---
  // Unique key per session: survives tab kill / app switch
  const CHIAVE_PROGRESSO = `gymmaster_workout_${id}`;
  const salvaTimeoutRef = useRef(null);

  // Restore the saved state (if any): read only once, on the first render
  const [ss] = useState(() => {
    try {
      const raw = localStorage.getItem(CHIAVE_PROGRESSO);
      return raw ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  });

  const [sessione, setSessione] = useState(location.state?.sessione || null);
  // Opened when it was already over: an end-of-rest notification tapped hours
  // later, another device. It is shown as finished, without the stopwatch
  // running from the start of the workout
  const giaConclusa = Boolean(sessione?.dataFine);
  const [esercizioIdx, setEsercizioIdx] = useState(ss ? ss.esercizioIdx : 0);
  const [serieCorrente, setSerieCorrente] = useState(ss ? ss.serieCorrente : 1);
  const [form, setForm] = useState(ss ? ss.form : { peso: '', rep: '', rpe: 7, minuti: '', resistenza: '', drop: [] });
  const [serieCompletate, setSerieCompletate] = useState(ss ? ss.serieCompletate : []);
  const [mostraRiepilogo, setMostraRiepilogo] = useState(false);
  const [riprendendo, setRiprendendo] = useState(false);
  const [chiudendo, setChiudendo] = useState(false);
  // "Termina" first asks what time you finished (componenti/specifici/FineAllenamento.jsx)
  const [chiediFine, setChiediFine] = useState(false);
  const [fineScelta, setFineScelta] = useState(null);
  // "Termina" queued: while it is there the workout is closed only on the
  // phone; once sent, the server's response brings the records and the end
  const [idChiusura, setIdChiusura] = useState(null);
  const chiusura = useVoceInCoda(utenteId, idChiusura);
  const [mostraSelettoreEsercizi, setMostraSelettoreEsercizi] = useState(false);
  const [mostraRicercaEsercizi, setMostraRicercaEsercizi] = useState(false);
  const [catalogoEsercizi, setCatalogoEsercizi] = useState([]);
  const [ricercaTesto, setRicercaTesto] = useState('');
  // The exercises restored from localStorage, otherwise the plan's ones
  // (if the session already comes from the previous page; if not, on load)
  const [eserciziLive, setEserciziLive] = useState(() =>
    ss?.eserciziLive?.length ? ss.eserciziLive : [...(location.state?.sessione?.scheda?.esercizi ?? [])]);
  const [caricamento, setCaricamento] = useState(!location.state?.sessione);
  // Rest started by the last set: it is active until the timer reaches zero
  // (timerAttivo, derived from the timer without an effect that turns it off)
  const [recuperoAvviato, setRecuperoAvviato] = useState(Boolean(recuperoSalvato));
  // Duration of the rest in progress: the progress bar cannot use the current
  // exercise's one, which after the automatic switch is already the next one
  const [durataRecupero, setDurataRecupero] = useState(recuperoSalvato?.durata ?? 0);
  // Rest at the top of the screen instead of in place of the fields: after the
  // last set the next exercise is already shown, so during the rest you see
  // what is coming and can move to the machine.
  const [recuperoInCima, setRecuperoInCima] = useState(recuperoSalvato?.inCima ?? false);
  const timerAttivo = recuperoAvviato && !(timer.secondiRimasti === 0 && !timer.inCorso);
  const nuoviRecord = chiusura.risposta?.recordPersonali || [];
  // Closed hours after the last set: the server makes it end there (and it cannot be resumed)
  const finitoAllUltimaSerie = chiusura.risposta?.dimenticata ? new Date(chiusura.risposta.dati.dataFine) : null;
  // Ended at a time picked long before now: the server no longer lets it be
  // resumed (RIAPERTURA_MAX_MINUTI after the end). Still queued on the phone,
  // instead, it is resumed by taking "Termina" out of the queue
  const fineChiusura = chiusura.risposta?.dati?.dataFine ? new Date(chiusura.risposta.dati.dataFine) : (fineScelta != null ? new Date(fineScelta) : null);
  const [mostraVideo, setMostraVideo] = useState(false);
  const [mostraSerieCompletate, setMostraSerieCompletate] = useState(false);
  const [tempoInizio, setTempoInizio] = useState(() => ss ? ss.tempoInizio : Date.now());
  const [oraAttuale, setOraAttuale] = useState(new Date());
  // The last time you did each exercise, in any plan
  const [ultimiCarichi, setUltimiCarichi] = useState({});
  // A double tap recorded the same set twice: after a set the buttons
  // rest for a moment
  const inviandoRef = useRef(false);
  const [inviando, setInviando] = useState(false);
  const riposaUnAttimo = () => {
    inviandoRef.current = true;
    setInviando(true);
    setTimeout(() => {
      inviandoRef.current = false;
      setInviando(false);
    }, 600);
  };

  /** Queue a set (done or skipped) and try to send it right away */
  const registraSerie = (dati) => {
    const voce = accoda(utenteId, { tipo: 'serie', sessione: perLaCoda(sessione), dati });
    inviaOra(utenteId).catch(err => console.error('Invio della serie:', err));
    return voce;
  };

  const salvaProgressi = useCallback((stato) => {
    try {
      localStorage.setItem(CHIAVE_PROGRESSO, JSON.stringify(stato));
    } catch {
      // localStorage full or unavailable — ignore silently
    }
  }, [CHIAVE_PROGRESSO]);
  const statoAttuale = () => ({ esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio });

  // --- Save progress in localStorage (500ms debounce) ---
  // The delay only avoids writing on every keystroke in the fields. Recorded
  // sets are saved right away, in completaSerie/saltaSerie: if the app were
  // closed in that half second, on reopening the set would show as still to do
  // and would be recorded a second time.
  useEffect(() => {
    if (!id || mostraRiepilogo || giaConclusa) return; // Do not save after completion

    if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    salvaTimeoutRef.current = setTimeout(
      () => salvaProgressi({ esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio }), 500);

    return () => {
      if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    };
  }, [esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio, id, mostraRiepilogo, giaConclusa, salvaProgressi]);

  /** Clear the saved progress (completion or abandonment) */
  const pulisciProgressi = useCallback(() => {
    localStorage.removeItem(CHIAVE_PROGRESSO);
    togliRecupero(id);
  }, [CHIAVE_PROGRESSO, id]);

  // Update the clock every second
  useEffect(() => {
    const interval = setInterval(() => setOraAttuale(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  /** The point where you were, rebuilt from the sets on the server (utils/ripresa.js) */
  const ricostruisci = useCallback((dati) => {
    const stato = statoDaSessione(dati);
    setEserciziLive(stato.eserciziLive);
    setSerieCompletate(stato.serieCompletate);
    setEsercizioIdx(stato.esercizioIdx);
    setSerieCorrente(stato.serieCorrente);
    setTempoInizio(stato.tempoInizio);
  }, []);

  // Load the session if it does not come from the state
  useEffect(() => {
    if (!sessione && id) {
      api.get(`/sessioni/${id}`)
        .then(r => {
          setSessione(r.dati);
          // Finished: nothing to rebuild, the screen says it is over
          if (ss || r.dati.dataFine) return;
          // Nothing in the browser (resumed from the history, another device):
          // the point where you were is rebuilt from the sets on the server
          ricostruisci(r.dati);
        })
        .catch(() => naviga('/schede'))
        .finally(() => setCaricamento(false));
    }
  }, [id, sessione, ss, naviga, ricostruisci]);

  // Already over: progress left in the browser would bring it back as in
  // progress, and the end-of-rest notification would keep leading here
  const { resetta: azzeraRecupero } = timer;
  useEffect(() => {
    if (!giaConclusa) return;
    pulisciProgressi();
    azzeraRecupero();
    chiudiNotificheRecupero();
  }, [giaConclusa, pulisciProgressi, azzeraRecupero]);

  // Back in the app, the end-of-rest notification has done its job: it does
  // not stay among the notifications until the end of the workout
  useEffect(() => {
    const tornato = () => { if (document.visibilityState === 'visible') chiudiNotificheRecupero(); };
    document.addEventListener('visibilitychange', tornato);
    return () => document.removeEventListener('visibilitychange', tornato);
  }, []);

  // Enable the wake lock (enable and disable do not change between renders)
  const { attiva: attivaWakeLock, disattiva: disattivaWakeLock } = wakeLock;
  useEffect(() => {
    if (giaConclusa) return;
    attivaWakeLock();
    return () => disattivaWakeLock();
  }, [giaConclusa, attivaWakeLock, disattivaWakeLock]);

  // Last time's loads for each scheduled exercise. Before, we looked only at
  // the last session of the same plan: with a new plan nothing appeared, even
  // if the exercise had already been done elsewhere.
  const idEsercizi = [...new Set(eserciziLive.map(e => e.esercizioId))].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!sessione?.id || !idEsercizi) return;
    let annullato = false;
    api.get(`/sessioni/ultimi-carichi?esercizi=${idEsercizi}&escludi=${sessione.id}`)
      .then(r => { if (!annullato) setUltimiCarichi(r.dati || {}); })
      .catch(() => { /* the reference is a help: without it, we carry on */ });
    return () => { annullato = true; };
  }, [sessione?.id, idEsercizi]);

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
      ...ESERCIZIO_EXTRA
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

  // Typo-tolerant search on the Italian name and the English original (utils/ricerca.js),
  // with the user's favorites first
  const { preferiti } = usePreferiti();
  const indiceRicerca = useMemo(() => indicizzaEsercizi(catalogoEsercizi), [catalogoEsercizi]);
  const eserciziFiltrati = useMemo(
    () => preferitiPrima(cerca(indiceRicerca, ricercaTesto), preferiti),
    [indiceRicerca, ricercaTesto, preferiti]
  );
  const { visibili: eserciziVisibili, restanti, mostraAltri } = useAPezzi(eserciziFiltrati);

  // --- Tracking of completed exercises ---
  // An exercise is "completed" when it has >= serieTarget recorded working
  // sets: warm-up and drop sets do not count (utils/tipiSerie.js)
  const contaSeriePerEsercizio = useCallback((idxEsercizio) => {
    const es = esercizi[idxEsercizio];
    if (!es) return 0;
    return serieCompletate.filter(s => s.esercizioId === es.esercizioId && diLavoro(s)).length;
  }, [esercizi, serieCompletate]);

  const esercizioCompletato = useCallback((idxEsercizio) => {
    const es = esercizi[idxEsercizio];
    if (!es) return false;
    return contaSeriePerEsercizio(idxEsercizio) >= es.serieTarget;
  }, [esercizi, contaSeriePerEsercizio]);

  // Find the next NOT completed exercise (starting from the given index)
  const prossimoEsercizioNonCompletato = useCallback((daDove = 0) => {
    for (let i = daDove; i < esercizi.length; i++) {
      if (!esercizioCompletato(i) && i !== esercizioIdx) return i;
    }
    // If none is found after it, search from the start (exercises skipped earlier)
    for (let i = 0; i < daDove; i++) {
      if (!esercizioCompletato(i) && i !== esercizioIdx) return i;
    }
    return -1; // All completed
  }, [esercizi, esercizioCompletato, esercizioIdx]);

  // Skipped exercises: every other exercise with no sets logged yet
  const eserciziSaltati = esercizi
    .map((es, idx) => ({ ...es, idx }))
    .filter((_, idx) => idx !== esercizioIdx && !esercizioCompletato(idx) && contaSeriePerEsercizio(idx) === 0);

  // Next not completed index (for navigation)
  const prossimoIdx = prossimoEsercizioNonCompletato(esercizioIdx + 1);

  // Time calculation
  const oreMinuti = oraAttuale.toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' });
  const dataOdierna = oraAttuale.toLocaleDateString(localeCorrente(), { weekday: 'short', day: 'numeric', month: 'short' });
  
  const millisecondiTrascorsi = Math.max(0, oraAttuale.getTime() - tempoInizio);
  const oreTrascorsi = Math.floor(millisecondiTrascorsi / 3600000);
  const minutiTrascorsi = Math.floor((millisecondiTrascorsi % 3600000) / 60000);
  const secondiTrascorsi = Math.floor((millisecondiTrascorsi % 60000) / 1000);
  const cronometro = `${oreTrascorsi > 0 ? oreTrascorsi + ':' : ''}${oreTrascorsi > 0 ? minutiTrascorsi.toString().padStart(2, '0') : minutiTrascorsi}:${secondiTrascorsi.toString().padStart(2, '0')}`;

  // Sets saved on the phone that have not arrived yet: we say so only when
  // they have been waiting for a few seconds (with a network they go right away)
  const codaFerma = coda.quante > 0 && oraAttuale.getTime() - Date.parse(coda.dalle) > CODA_FERMA_MS;

  // Completed sets for the current exercise: warm-up, then each set with its drop sets
  const serieEsercizio = ordinaSerie(serieCompletate.filter(
    s => s.esercizioId === esercizioAttuale?.esercizioId
  ));

  // With a barbell, the plates to load per side for the weight entered
  const bilanciere = bilanciereDi(esercizioAttuale?.esercizio);
  const dischi = bilanciere ? dischiPerLato(form.peso, bilanciere.peso) : null;

  const isCardio = esercizioAttuale?.esercizio?.attrezzatura?.categoria === 'CARDIO' || 
                   esercizioAttuale?.esercizio?.gruppoMuscoloPrimario?.toLowerCase() === 'cardio';

  // Last time's sets for the current exercise
  const caricoPrecedente = ultimiCarichi[esercizioAttuale?.esercizioId] || null;
  const seriePrecedenti = caricoPrecedente?.serie || [];
  // Reference for the set to do: the same set as last time, or the last one
  // done if fewer were done back then
  const riferimento = seriePrecedenti.length
    ? ([...seriePrecedenti].reverse().find(sp => sp.serieNumero === serieCorrente) || seriePrecedenti[seriePrecedenti.length - 1])
    : null;
  const riferimentoCardio = riferimento?.durataMinuti > 0;

  // Today's weight from double progression over the last times (utils/progressione.js)
  const incremento = incrementoPer(esercizioAttuale?.esercizio);
  const proposta = isCardio ? null : propostaCarico({
    storico: caricoPrecedente?.storico ?? [],
    serieTarget: esercizioAttuale?.serieTarget,
    repTarget: esercizioAttuale?.repTarget,
    incremento
  });
  const usaProposta = () => setForm(p => ({ ...p, peso: String(proposta.peso) }));

  // --- Warm-up and drop sets (utils/tipiSerie.js) ---
  // Before the first working set, the ramp up to today's weight: the one
  // entered, otherwise the proposal or last time's. The heaviest steps above
  // the warm-ups already done remain.
  const lavoroIniziato = serieEsercizio.some(diLavoro);
  const riscaldamenti = serieEsercizio.filter(s => s.tipo === 'RISCALDAMENTO');
  const pesoDiLavoro = Number(form.peso) || proposta?.peso || (riferimento && !riferimentoCardio ? riferimento.pesoEffettivo : 0);
  const pesoScaldato = Math.max(0, ...riscaldamenti.map(s => s.pesoEffettivo));
  const rampa = isCardio || lavoroIniziato
    ? []
    : rampaRiscaldamento(pesoDiLavoro, { incremento, minimo: bilanciere?.peso ?? 0 }).filter(p => p.peso > pesoScaldato);
  // The drop sets of the current set: weight/reps rows below the main one
  const drop = form.drop ?? [];
  const dropIncompleto = drop.some(d => (d.peso === '') !== (d.rep === ''));
  const serieIncompleta = isCardio ? !form.minuti : (!form.peso || !form.rep || dropIncompleto);

  const aggiungiDrop = () => setForm(p => {
    const righe = p.drop ?? [];
    const proposto = pesoDrop(righe.length ? righe[righe.length - 1].peso : p.peso, incremento);
    return { ...p, drop: [...righe, { peso: proposto != null ? String(proposto) : '', rep: '' }] };
  });
  const cambiaDrop = (indice, campo, valore) =>
    setForm(p => ({ ...p, drop: (p.drop ?? []).map((d, i) => (i === indice ? { ...d, [campo]: valore } : d)) }));
  const togliDrop = (indice) => setForm(p => ({ ...p, drop: (p.drop ?? []).filter((_, i) => i !== indice) }));

  /**
   * A warm-up set: it shows among the sets done but does not count among
   * the plan's sets and does not start the rest. true if recorded.
   */
  const registraRiscaldamento = (peso, ripetizioni) => {
    if (inviandoRef.current || !(peso >= 0) || !(ripetizioni > 0)) return false;
    riposaUnAttimo();
    const dati = {
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: riscaldamenti.length + 1,
      tipo: 'RISCALDAMENTO',
      pesoEffettivo: peso,
      repEffettive: ripetizioni,
      completato: true
    };
    const voce = registraSerie(dati);
    const nuoveCompletate = [...serieCompletate, { ...dati, idClient: voce.id, registrataIl: voce.il }];
    salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate });
    setSerieCompletate(nuoveCompletate);
    return true;
  };
  const riscaldamentoDalForm = () => {
    if (registraRiscaldamento(parseFloat(form.peso), parseInt(form.rep))) setForm(p => ({ ...p, rep: '' }));
  };

  const completaSerie = () => {
    if (inviandoRef.current || serieIncompleta) return;

    const datiSerie = {
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: serieCorrente,
      tipo: 'LAVORO',
      pesoEffettivo: isCardio ? 0 : parseFloat(form.peso),
      repEffettive: isCardio ? 0 : parseInt(form.rep),
      rpe: form.rpe,
      completato: true,
      ...(isCardio && {
        durataMinuti: parseInt(form.minuti),
        livelloResistenza: parseFloat(form.resistenza) || 0
      })
    };

    // The drop sets done with this set: same number, right after it
    const dropFatti = isCardio ? [] : drop.filter(d => d.peso !== '' && d.rep !== '').map(d => ({
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: serieCorrente,
      tipo: 'DROP',
      pesoEffettivo: parseFloat(d.peso),
      repEffettive: parseInt(d.rep),
      completato: true
    }));

    riposaUnAttimo();
    // With the time they were done: "Termina" proposes the last set as the end when it was long ago
    const registrate = [datiSerie, ...dropFatti].map(dati => {
      const voce = registraSerie(dati);
      return { ...dati, idClient: voce.id, registrataIl: voce.il };
    });
    const nuoveCompletate = [...serieCompletate, ...registrate];
    // Once the exercise is finished we move straight to the next not completed one.
    // prossimoIdx already excludes the current exercise, and this set does not
    // change the state of the others: the value computed in render is the right one.
    const passaAvanti = serieCorrente >= esercizioAttuale.serieTarget && prossimoIdx !== -1;
    if (passaAvanti) {
      const nuovoForm = formPerNuovoEsercizio(form);
      salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate, esercizioIdx: prossimoIdx, serieCorrente: 1, form: nuovoForm });
      setSerieCompletate(nuoveCompletate);
      apriEsercizio(prossimoIdx);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Weight and reps stay for the next set, the drop sets do not
      const formDopo = { ...form, drop: [] };
      salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate, serieCorrente: serieCorrente + 1, form: formDopo });
      setSerieCompletate(nuoveCompletate);
      setSerieCorrente(serieCorrente + 1);
      setForm(formDopo);
    }

    // Rest: the one of the exercise just finished, even if we have already moved on
    const prossimo = passaAvanti
      ? t('workoutLive.recupero.notifica', { nome: nomeEsercizio(esercizi[prossimoIdx].esercizio), numero: 1 })
      : t('workoutLive.recupero.notifica', { nome: nomeEsercizio(esercizioAttuale.esercizio), numero: serieCorrente + 1 });
    if (esercizioAttuale?.recuperoSecondi) avviaRecupero(esercizioAttuale.recuperoSecondi, passaAvanti, prossimo);
    else fermaRecupero();
  };

  const saltaSerie = () => {
    if (inviandoRef.current) return;
    riposaUnAttimo();
    registraSerie({
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: serieCorrente,
      pesoEffettivo: 0,
      repEffettive: 0,
      completato: false,
      motivoSaltoEsercizio: 'Saltata'
    });
    if (serieCorrente >= esercizioAttuale.serieTarget && prossimoIdx !== -1) {
      salvaProgressi({ ...statoAttuale(), esercizioIdx: prossimoIdx, serieCorrente: 1, form: formPerNuovoEsercizio(form) });
      cambiaEsercizio(prossimoIdx);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      salvaProgressi({ ...statoAttuale(), serieCorrente: serieCorrente + 1 });
      setSerieCorrente(serieCorrente + 1);
    }
  };

  const prossimoEsercizio = () => {
    // Go to the next NOT completed exercise
    if (prossimoIdx !== -1) {
      cambiaEsercizio(prossimoIdx);
    }
  };

  /**
   * Fields for a new exercise: weight, reps and minutes are cleared (the
   * previous one's weight, with its plates, would only be misleading: the
   * placeholder shows the proposal or last time's), and the drop sets with them.
   * RPE and resistance stay.
   */
  const formPerNuovoEsercizio = (f) => ({ ...f, peso: '', rep: '', minuti: '', drop: [] });

  /** Show another exercise without touching the rest. */
  const apriEsercizio = (nuovoIndice) => {
    setEsercizioIdx(nuovoIndice);
    setSerieCorrente(1);
    setForm(formPerNuovoEsercizio);
    setMostraSelettoreEsercizi(false);
    setMostraVideo(false);
  };

  /**
   * @param {number} secondi
   * @param {boolean} inCima - rest at the top, above the next exercise
   * @param {string} prossimo - what comes next, for the notification: "Panca piana · serie 2"
   */
  const avviaRecupero = (secondi, inCima, prossimo) => {
    const fine = adesso() + secondi * 1000;
    timer.avvia(secondi, { fine });
    setDurataRecupero(secondi);
    setRecuperoAvviato(true);
    setRecuperoInCima(inCima);
    // The app's timer stops with the screen locked: tell the server, with
    // this workout, where the tap on the notification comes back to
    if (push.iscritto) {
      avvisoRecuperoRef.current = true;
      api.post('/notifiche/push/recupero', { secondi, prossimo, sessioneId: Number(id) }).catch(() => {});
    }
    // Kept on the phone: closed and reopened, the app finds the rest where the clock says
    recuperoRef.current = { fine, durata: secondi, inCima, avvisato: avvisoRecuperoRef.current };
    salvaRecupero(id, recuperoRef.current);
  };

  /** Rest interrupted or workout finished: no notification */
  const annullaAvvisoRecupero = () => {
    if (!avvisoRecuperoRef.current) return;
    avvisoRecuperoRef.current = false;
    api.delete('/notifiche/push/recupero').catch(() => {});
  };

  const fermaRecupero = () => {
    timer.resetta();
    setRecuperoAvviato(false);
    setRecuperoInCima(false);
    annullaAvvisoRecupero();
    recuperoRef.current = null;
    togliRecupero(id);
  };

  const cambiaEsercizio = (nuovoIndice) => {
    apriEsercizio(nuovoIndice);
    // The rest is about the body, not the exercise: if it is running it
    // keeps going, at the top, above the exercise just picked
    if (timerAttivo) {
      setRecuperoInCima(true);
      if (recuperoRef.current) {
        recuperoRef.current = { ...recuperoRef.current, inCima: true };
        salvaRecupero(id, recuperoRef.current);
      }
    }
  };

  // "Termina" is queued after the sets: it is sent with them, or when the network is back.
  // The summary waits a little for the sending (for the records), then shows anyway.
  // `fine`: the end picked in FineAllenamento, in milliseconds
  const completaAllenamento = async (fine) => {
    if (chiudendo) return;
    setChiudendo(true);
    setFineScelta(fine);
    const voce = accoda(utenteId, {
      tipo: 'completa', sessione: perLaCoda(sessione), dati: { noteFinali: '', fine: new Date(fine).toISOString() }
    });
    try {
      await entro(inviaOra(utenteId), ATTESA_CHIUSURA_MS, 'Rete lenta');
    } catch {
      // No network, or a network that does not respond: it stays queued and is sent later
    }
    annullaAvvisoRecupero();
    chiudiNotificheRecupero();
    setIdChiusura(voce.id);
    setChiediFine(false);
    setMostraRiepilogo(true);
    setChiudendo(false);
    pulisciProgressi(); // Clear localStorage on completion
    wakeLock.disattiva();
  };

  const tornaAllAllenamento = () => {
    setIdChiusura(null);
    setFineScelta(null);
    setMostraRiepilogo(false);
    salvaProgressi(statoAttuale());
    wakeLock.attiva();
  };

  // "Ho chiuso per sbaglio" (I closed it by mistake): the session goes back to in
  // progress and you start again from where you were, with the sets already done
  // (they are all still here, in memory)
  const riprendiAllenamento = async () => {
    // Closed without a network: "Termina" is still on the phone, removing it is enough
    if (togliDallaCoda(utenteId, [idChiusura])) {
      tornaAllAllenamento();
      return;
    }
    setRiprendendo(true);
    try {
      await api.patch(`/sessioni/${sessione.id}/riapri`);
      tornaAllAllenamento();
    } catch (err) {
      alert(err.message);
    } finally {
      setRiprendendo(false);
    }
  };

  // Finished, but still in time to resume it (the server says until when):
  // it goes back to in progress from the sets on the server
  const riprendiConclusa = async () => {
    setRiprendendo(true);
    try {
      await api.patch(`/sessioni/${id}/riapri`);
      const r = await api.get(`/sessioni/${id}`);
      ricostruisci(r.dati);
      setSessione(r.dati);
    } catch (err) {
      alert(err.message);
    } finally {
      setRiprendendo(false);
    }
  };

  if (caricamento) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primario)]">
        <div className="w-12 h-12 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  if (giaConclusa) {
    const fine = new Date(sessione.dataFine);
    const ora = d => d.toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' });
    const riapribileFino = sessione.riapribileFinoA ? new Date(sessione.riapribileFinoA) : null;
    const riprendibile = riapribileFino && oraAttuale < riapribileFino;
    return (
      <div className="min-h-screen bg-[var(--bg-primario)] flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🏁</div>
          <h1 className="text-2xl font-bold mb-2">{t('workoutLive.conclusa.titolo')}</h1>
          <p className="text-sm text-[var(--testo-secondario)]">
            {t('workoutLive.conclusa.testo', { giorno: formattaData(fine), ora: ora(fine) })}
          </p>
          {sessione.durataMinuti > 0 && (
            <p className="text-sm text-[var(--testo-secondario)] mt-1">
              {t('workoutLive.conclusa.durata', { durata: formattaDurata(sessione.durataMinuti) })}
            </p>
          )}
          <div className="flex flex-col gap-3 mt-6">
            <button onClick={() => naviga('/storico')} className="btn-primario w-full">
              {t('workoutLive.conclusa.storico')}
            </button>
            {riprendibile && (
              <>
                <button onClick={riprendiConclusa} disabled={riprendendo} className="btn-secondario w-full">
                  {riprendendo ? t('workoutLive.unAttimo') : t('workoutLive.conclusa.riprendi')}
                </button>
                <p className="text-[11px] text-[var(--testo-terziario)] -mt-1">
                  {t('workoutLive.conclusa.riprendiFino', { ora: ora(riapribileFino) })}
                </p>
              </>
            )}
            <button onClick={() => naviga('/dashboard')} className="text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] py-2">
              {t('workoutLive.riepilogo.tornaDashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Final summary
  if (mostraRiepilogo) {
    return (
      <div className="min-h-screen bg-[var(--bg-primario)] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">{t('workoutLive.riepilogo.titolo')}</h1>
          {chiusura.inCoda && (
            <p className="text-xs text-[var(--testo-secondario)] px-3 py-2 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              {t('workoutLive.riepilogo.senzaRete')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">{serieCompletate.filter(diLavoro).length}</p>
              <p className="text-xs text-[var(--testo-terziario)]">{t('workoutLive.riepilogo.serieCompletate')}</p>
            </div>
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">
                {formattaPeso(volumeDi(serieCompletate))} kg
              </p>
              <p className="text-xs text-[var(--testo-terziario)]">{t('workoutLive.riepilogo.volumeTotale')}</p>
            </div>
          </div>

          {/* New records */}
          {nuoviRecord.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-[var(--successo)] mb-2">{t('workoutLive.riepilogo.nuoviRecord')}</h3>
              {nuoviRecord.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded bg-[var(--successo-dim)]">
                  <span className="text-sm">{nomeEsercizio(r.esercizio)}</span>
                  <span className="font-bold text-[var(--successo)]">{formattaPeso(r.pesoMaxRaggiunto)} kg</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => naviga('/dashboard')} className="btn-primario w-full">
            {t('workoutLive.riepilogo.tornaDashboard')}
          </button>
          {finitoAllUltimaSerie ? (
            <p className="text-xs text-[var(--testo-terziario)] mt-3">
              {t('workoutLive.riepilogo.rimastoAperto', { ora: finitoAllUltimaSerie.toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' }) })}
            </p>
          ) : !chiusura.inCoda && fineChiusura && oraAttuale - fineChiusura > RIAPERTURA_MAX_MINUTI * 60 * 1000 ? (
            <p className="text-xs text-[var(--testo-terziario)] mt-3">
              {t('workoutLive.riepilogo.terminatoAlle', { ora: fineChiusura.toLocaleTimeString(localeCorrente(), { hour: '2-digit', minute: '2-digit' }) })}
            </p>
          ) : (
            <>
              <button onClick={riprendiAllenamento} disabled={riprendendo} className="btn-secondario w-full mt-3">
                {riprendendo ? t('workoutLive.unAttimo') : t('workoutLive.riepilogo.riprendi')}
              </button>
              <p className="text-[11px] text-[var(--testo-terziario)] mt-2">{t('workoutLive.riepilogo.riprendiEntro', { minuti: RIAPERTURA_MAX_MINUTI })}</p>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // Exercise search drawer: during the workout, and to pick the first
  // exercise of a free workout
  const cassettoRicerca = (
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
            <h3 className="font-bold text-lg">{t('workoutLive.ricerca.titolo')}</h3>
            <button onClick={() => setMostraRicercaEsercizi(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-terziario)] hover:bg-[var(--bordo-hover)] transition-colors">✕</button>
          </div>
          
          <div className="p-4 border-b border-[var(--bordo)]">
            <input
              type="text"
              placeholder={t('workoutLive.ricerca.cerca')}
              value={ricercaTesto}
              onChange={(e) => setRicercaTesto(e.target.value)}
              className="w-full bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-xl px-4 py-3 text-sm focus:border-[var(--accent)] outline-none"
              autoFocus
            />
          </div>

          <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2" style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
            {eserciziVisibili.map((es) => (
              <button
                key={es.id}
                onClick={() => aggiungiEsercizioExtra(es)}
                className="flex items-center justify-between p-3 rounded-xl border border-[var(--bordo)] bg-[var(--bg-terziario)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors text-left"
              >
                <div>
                  <p className="font-semibold text-sm">{preferiti.has(es.id) && <span title={t('workoutLive.ricerca.preferito')}>⭐ </span>}{nomeEsercizio(es)}</p>
                  <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{nomeGruppo(es.gruppoMuscoloPrimario)} · {es.attrezzatura?.nome ? nomeAttrezzatura(es.attrezzatura.nome) : t('workoutLive.ricerca.varie')}</p>
                </div>
                <span className="text-[var(--accent)] font-bold">➕</span>
              </button>
            ))}
{restanti > 0 && (
              <button onClick={mostraAltri} className="text-sm text-[var(--accent)] py-3 hover:underline">
                {t('workoutLive.ricerca.mostraAltri', { numero: formattaNumero(restanti) })}
              </button>
            )}
            {catalogoEsercizi.length > 0 && eserciziFiltrati.length === 0 && (
              <p className="text-center text-[var(--testo-terziario)] text-sm py-4">{t('workoutLive.ricerca.nessunoTrovato')}</p>
            )}
            {catalogoEsercizi.length === 0 && (
              <p className="text-center text-[var(--testo-terziario)] text-sm py-4">{t('workoutLive.ricerca.caricamento')}</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );

  if (!esercizioAttuale) {
    // A free workout starts empty: the exercises are added one by one
    const libero = sessione && !sessione.schedaId;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-sm">
          <p className="text-[var(--testo-secondario)]">{libero ? t('workoutLive.libero.vuoto') : t('workoutLive.nessunEsercizio')}</p>
          {libero ? (
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={apriRicerca} className="btn-primario">{t('workoutLive.libero.aggiungi')}</button>
              <button onClick={() => naviga('/dashboard')} className="btn-secondario">{t('workoutLive.libero.esci')}</button>
            </div>
          ) : (
            <button onClick={() => naviga('/schede')} className="btn-primario mt-4">{t('workoutLive.tornaAlleSchede')}</button>
          )}
        </div>
        {cassettoRicerca}
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
            {t('workoutLive.barra.esercizioNumero', { numero: esercizioIdx + 1, totale: esercizi.length })}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {wakeLock.attivo && <span className="text-xs text-[var(--successo)]">{t('workoutLive.barra.schermoAttivo')}</span>}
          <button onClick={() => setChiediFine(true)} disabled={chiudendo}
                  className="text-sm font-medium text-[var(--pericolo)] px-3 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--pericolo-dim)] disabled:opacity-60">
            {chiudendo ? t('workoutLive.unAttimo') : t('workoutLive.barra.termina')}
          </button>
        </div>
      </div>

      {codaFerma && (
        <p className="px-4 py-2 text-xs text-center text-[var(--testo-secondario)] bg-[var(--bg-terziario)] border-b border-[var(--bordo)]">
          {t('workoutLive.barra.codaFerma', { count: coda.quante })}
        </p>
      )}

      {/* Rest after the last set: it stays in view while you get ready for the next exercise */}
      {timerAttivo && recuperoInCima && timer.secondiRimasti > 0 && (
        <div className="sticky z-30 px-4 pt-3" style={{ top: 'var(--safe-top)' }}>
          <div className="max-w-lg mx-auto rounded-[var(--raggio-md)] border border-[var(--accent)]/40 bg-[var(--bg-secondario)] shadow-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">{t('workoutLive.recupero.titolo')}</p>
                <p className="text-xs text-[var(--testo-secondario)] truncate">{t('workoutLive.recupero.prossimo', { nome: nomeEsercizio(esercizioAttuale.esercizio) })}</p>
              </div>
              <p className="text-3xl font-extrabold tabular-nums leading-none testo-gradient" role="timer" aria-label={t('workoutLive.recupero.ariaTimer', { tempo: formattaTempo(timer.secondiRimasti) })}>
                {formattaTempo(timer.secondiRimasti)}
              </p>
              <button onClick={fermaRecupero}
                      className="text-xs font-medium text-[var(--accent)] px-3 py-1.5 rounded-full border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors shrink-0">
                {t('workoutLive.recupero.salta')}
              </button>
            </div>
            <div className="h-1 bg-[var(--bg-terziario)]">
              <div className="h-full bg-[var(--accent)] transition-[width] duration-1000 ease-linear"
                   style={{ width: `${(timer.secondiRimasti / (durataRecupero || 1)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Current exercise */}
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-lg mx-auto w-full">
        {/* Clock & Stopwatch */}
        <div className="flex items-center justify-between bg-[var(--bg-terziario)] p-3 rounded-[var(--raggio-md)] -mt-2 shadow-sm border border-[var(--bordo)]">
          {/* Left: Clock */}
          <div className="flex flex-col items-start">
            <span className="text-2xl font-bold tabular-nums leading-none text-[var(--testo-primario)]">{oreMinuti}</span>
            <span className="text-[10px] text-[var(--testo-terziario)] uppercase tracking-wider mt-1">{dataOdierna}</span>
          </div>

          {/* Right: Workout stopwatch */}
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-[var(--accent)] tabular-nums leading-none">{cronometro}</span>
            <span className="text-[10px] text-[var(--accent)] opacity-80 uppercase tracking-wider mt-1">{t('workoutLive.tempoAllenamento')}</span>
          </div>
        </div>

        {/* Exercise name */}
        <motion.div key={esercizioIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="text-center py-2">
          <h2 className="text-xl md:text-2xl font-bold">{nomeEsercizio(esercizioAttuale.esercizio)}</h2>
          <p className="text-sm text-[var(--testo-terziario)] mt-1">
            {nomeGruppo(esercizioAttuale.esercizio.gruppoMuscoloPrimario)}
            {isCardio
              ? (() => {
                  const p = [];
                  if (esercizioAttuale.durataMinuti) p.push(`${esercizioAttuale.durataMinuti} min`);
                  if (esercizioAttuale.velocitaKmh != null) p.push(`${esercizioAttuale.velocitaKmh} km/h`);
                  if (esercizioAttuale.inclinazione != null) p.push(t('workoutLive.esercizio.inclinazione', { valore: esercizioAttuale.inclinazione }));
                  if (esercizioAttuale.livelloResistenza != null) p.push(t('workoutLive.esercizio.livello', { valore: esercizioAttuale.livelloResistenza }));
                  return p.length ? ' · ' + p.join(' · ') : '';
                })()
              : ` · ${t('workoutLive.esercizio.riepilogoSerie', { serie: esercizioAttuale.serieTarget, rep: esercizioAttuale.repTarget, secondi: esercizioAttuale.recuperoSecondi })}`}
          </p>
        </motion.div>

        {/* Exercise video (YouTube embed) */}
        {esercizioAttuale.esercizio.linkVideo && (() => {
          const url = esercizioAttuale.esercizio.linkVideo;
          // Extract the videoId from youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
          const mShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
          const mLong = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
          const mEmbed = url.match(/embed\/([a-zA-Z0-9_-]+)/);
          const videoId = mShort?.[1] || mLong?.[1] || mEmbed?.[1];

          if (!videoId) return null;
          const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;

          return (
            <div className="workout-video-sezione">
              <button
                onClick={() => setMostraVideo(v => !v)}
                className="workout-video-toggle"
              >
                <span className="workout-video-toggle-icona">🎬</span>
                <span>{mostraVideo ? t('workoutLive.video.nascondi') : t('workoutLive.video.mostra')}</span>
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

        {/* Completed sets: warm-up, then each set with its drop sets */}
        {serieEsercizio.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setMostraSerieCompletate(v => !v)}
              className="flex items-center justify-between px-3 py-2 rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)] hover:border-[var(--accent)] transition-colors"
            >
              <span className="text-sm font-medium text-[var(--testo-secondario)]">
                {t('workoutLive.serieFatte.titolo', { count: serieEsercizio.length })}
              </span>
              <span className="text-xs text-[var(--testo-terziario)]">{mostraSerieCompletate ? '▲' : '▼'}</span>
            </button>
            <AnimatePresence>
              {mostraSerieCompletate && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 pt-1">
                    {serieEsercizio.map((s, i) => (
                      <div key={s.idClient ?? s.id ?? i}
                           className={`flex items-center justify-between px-3 py-2 rounded-[var(--raggio-sm)] ${
                             s.tipo === 'RISCALDAMENTO' ? 'bg-[var(--bg-terziario)]' : 'bg-[var(--successo-dim)]'
                           } ${s.tipo === 'DROP' ? 'ml-6' : ''}`}>
                        <span className={`text-sm font-medium ${s.tipo === 'RISCALDAMENTO' ? 'text-[var(--testo-secondario)]' : 'text-[var(--successo)]'}`}>
                          {s.tipo === 'RISCALDAMENTO'
                            ? t('workoutLive.serieFatte.riscaldamento')
                            : s.tipo === 'DROP' ? t('workoutLive.drop.etichetta') : t('workoutLive.serieFatte.serie', { numero: s.serieNumero ?? i + 1 })}
                        </span>
                        <span className="text-sm">
                          {s.durataMinuti ? (
                            `${s.durataMinuti} min ${s.livelloResistenza ? t('workoutLive.serieFatte.livello', { livello: s.livelloResistenza }) : ''}`
                          ) : (
                            `${formattaPeso(s.pesoEffettivo)} kg × ${s.repEffettive}`
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Rest timer overlay */}
        <AnimatePresence>
          {timerAttivo && timer.secondiRimasti > 0 && !recuperoInCima && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-6 text-center"
            >
              <p className="text-xs text-[var(--testo-terziario)] mb-2">{t('workoutLive.recupero.titoloMaiuscolo')}</p>
              <p className="text-[120px] font-extrabold testo-gradient mb-4 leading-none tabular-nums tracking-tighter">
                {formattaTempo(timer.secondiRimasti)}
              </p>
              <div className="w-full h-2 rounded-full bg-[var(--bg-terziario)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--accent)', width: `${(timer.secondiRimasti / (durataRecupero || 1)) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <button onClick={fermaRecupero}
                      className="mt-4 text-sm text-[var(--accent)] font-medium px-4 py-1.5 rounded-full border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors">
                {t('workoutLive.recupero.saltaRecupero')}
              </button>
              {/* With the screen locked the timer stops: say so, and where to fix it */}
              {push.caricato && push.supportate && push.serverAttivo && !push.iscritto && push.permesso !== 'denied' && (
                <p className="mt-3 text-[11px] text-[var(--testo-terziario)]">
                  <Testo t="workoutLive.recupero.schermoBloccato"
                         componenti={{ link: <Link to="/profilo?tab=notifiche" className="text-[var(--accent)] underline" /> }} />
                </p>
              )}
              <div className="mt-4 pt-3 border-t border-[var(--bordo)]">
                <p className="text-xs text-[var(--testo-secondario)] font-semibold uppercase tracking-wider">
                  {serieCorrente <= esercizioAttuale.serieTarget 
                    ? t('workoutLive.recupero.prossimaSerie', { numero: serieCorrente, totale: esercizioAttuale.serieTarget })
                    : (prossimoIdx !== -1
                        ? t('workoutLive.recupero.prossimoEsercizio', { nome: nomeEsercizio(esercizi[prossimoIdx].esercizio) })
                        : t('workoutLive.recupero.fineAllenamento'))}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Set input: when the rest timer is off, finished or moved to the top */}
        {(!timerAttivo || timer.secondiRimasti === 0 || recuperoInCima) && serieCorrente <= esercizioAttuale.serieTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-center text-[var(--testo-secondario)]">
              {t('workoutLive.serieCorrente', { numero: serieCorrente, totale: esercizioAttuale.serieTarget })}
            </p>

            {/* Today's proposal: up, same or deload, and why */}
            {proposta && (
              <button
                type="button"
                onClick={usaProposta}
                className="flex items-center justify-between gap-3 w-full px-3 py-2.5 rounded-[var(--raggio-md)] border text-left hover:border-[var(--accent)] transition-colors"
                style={{ borderColor: STILE_PROPOSTA[proposta.esito].bordo, background: STILE_PROPOSTA[proposta.esito].sfondo }}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold" style={{ color: STILE_PROPOSTA[proposta.esito].colore }}>
                    {t(STILE_PROPOSTA[proposta.esito].etichetta)}
                  </span>
                  <span className="block text-base font-bold tabular-nums">
                    {kg(proposta.peso)} kg × {proposta.ripetizioni.min === proposta.ripetizioni.max
                      ? proposta.ripetizioni.min
                      : `${proposta.ripetizioni.min}-${proposta.ripetizioni.max}`}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--testo-secondario)] mt-0.5">{proposta.motivo}</span>
                </span>
                <span className="text-xs font-bold text-[var(--accent)] shrink-0">{t('workoutLive.usa')}</span>
              </button>
            )}

            {/* Before the first set: the warm-up ramp, one tap per step done */}
            {rampa.length > 0 && (
              <div className="px-3 py-2.5 rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)]">
                <p className="text-[11px] text-[var(--testo-terziario)] mb-2">
                  {t('workoutLive.rampa', { peso: kg(pesoDiLavoro) })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {rampa.map(passo => (
                    <button key={passo.peso} type="button" disabled={inviando}
                            onClick={() => registraRiscaldamento(passo.peso, passo.rep)}
                            className="px-3 py-1.5 rounded-full border border-[var(--bordo)] bg-[var(--bg-primario)] text-sm font-semibold tabular-nums hover:border-[var(--accent)] transition-colors disabled:opacity-60">
                      {kg(passo.peso)} kg × {passo.rep}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {isCardio ? (
                <>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">{t('workoutLive.campi.durata')}</label>
                    <input type="number" value={form.minuti} onChange={e => setForm(p => ({...p, minuti: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder="0"
                           inputMode="numeric" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">{t('workoutLive.campi.resistenza')}</label>
                    <input type="number" value={form.resistenza} onChange={e => setForm(p => ({...p, resistenza: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder="0"
                           inputMode="decimal" step="0.5" min="0" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">{t('workoutLive.campi.peso')}</label>
                    <input type="number" value={form.peso} onChange={e => setForm(p => ({...p, peso: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder={proposta ? String(proposta.peso) : riferimento && !riferimentoCardio ? String(riferimento.pesoEffettivo) : '0'}
                           inputMode="decimal" step="0.5" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--testo-terziario)] mb-1 text-center">{t('workoutLive.campi.ripetizioni')}</label>
                    <input type="number" value={form.rep} onChange={e => setForm(p => ({...p, rep: e.target.value}))}
                           className="campo-input text-center text-3xl font-bold py-5" placeholder={riferimento && !riferimentoCardio ? String(riferimento.repEffettive) : '0'}
                           inputMode="numeric" min="0" />
                  </div>
                </>
              )}
            </div>

            {!isCardio && dischi && (
              <p className="text-xs text-center text-[var(--testo-secondario)] -mt-1">
                <Testo t="workoutLive.dischi.perLato" valori={{ dischi: descriviDischi(dischi.perLato) }}
                       componenti={{ b: <strong className="text-[var(--testo-primario)]" /> }} />
                <span className="text-[var(--testo-terziario)]"> · {t(bilanciere.nome)} {bilanciere.peso} kg</span>
                {dischi.mancano > 0 && <span className="text-[var(--avviso)]"> · {t('workoutLive.dischi.mancano', { kg: formattaNumero(dischi.mancano) })}</span>}
              </p>
            )}

            {/* Drop sets: right after the set, with a lower weight, they are recorded together with it */}
            {!isCardio && (
              <div className="flex flex-col gap-2">
                {drop.map((d, i) => (
                  <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_2rem] gap-2 items-center">
                    <span className="text-xs font-semibold text-[var(--testo-secondario)]">{t('workoutLive.drop.etichetta')}</span>
                    <input type="number" value={d.peso} onChange={e => cambiaDrop(i, 'peso', e.target.value)}
                           className="campo-input text-center text-lg font-bold py-2" placeholder="kg"
                           inputMode="decimal" step="0.5" min="0" aria-label={t('workoutLive.drop.ariaPeso', { numero: i + 1 })} />
                    <input type="number" value={d.rep} onChange={e => cambiaDrop(i, 'rep', e.target.value)}
                           className="campo-input text-center text-lg font-bold py-2" placeholder={t('workoutLive.drop.ripetizioniBreve')}
                           inputMode="numeric" min="0" aria-label={t('workoutLive.drop.ariaRipetizioni', { numero: i + 1 })} />
                    <button type="button" onClick={() => togliDrop(i)} aria-label={t('workoutLive.drop.ariaTogli', { numero: i + 1 })}
                            className="h-9 flex items-center justify-center rounded-[var(--raggio-sm)] text-[var(--testo-terziario)] hover:text-[var(--pericolo)]">
                      ✕
                    </button>
                  </div>
                ))}
                {dropIncompleto && (
                  <p className="text-[11px] text-[var(--avviso)]">{t('workoutLive.drop.incompleto')}</p>
                )}
                <button type="button" onClick={aggiungiDrop}
                        className="self-start text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
                  {t('workoutLive.drop.aggiungi')}
                </button>
              </div>
            )}

            {/* RPE slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[var(--testo-terziario)]">{t('workoutLive.campi.rpe')}</label>
                <span className="text-xs font-medium text-[var(--accent)]">{form.rpe} — {t(RPE_LABELS[form.rpe])}</span>
              </div>
              <input type="range" min="1" max="10" value={form.rpe}
                     onChange={e => setForm(p => ({...p, rpe: parseInt(e.target.value)}))}
                     className="w-full accent-[var(--accent)]" />
            </div>

            {/* Action buttons — HUGE */}
            <div className="flex flex-col gap-2 mt-2">
              <button onClick={completaSerie} disabled={inviando || serieIncompleta}
                      className={`btn-enorme ${
                        serieIncompleta
                          ? 'opacity-80 bg-[var(--pericolo-dim)] text-[var(--pericolo)] border border-[var(--pericolo)]/50 cursor-not-allowed'
                          : 'successo'
                      }`}>
                {drop.length > 0 ? t('workoutLive.azioni.serieCompletataConDrop', { count: drop.length }) : t('workoutLive.azioni.serieCompletata')}
              </button>

              {/* Before the first working set: the one just done was a warm-up */}
              {!isCardio && !lavoroIniziato && (
                <button onClick={riscaldamentoDalForm} disabled={inviando || !form.peso || !form.rep}
                        className="text-sm font-medium text-[var(--testo-secondario)] py-1.5 hover:text-[var(--testo-primario)] transition-colors disabled:opacity-50">
                  {t('workoutLive.azioni.riscaldamento')}
                </button>
              )}

              <button onClick={saltaSerie} disabled={inviando}
                      className="btn-enorme disabled:opacity-60" style={{ background: 'var(--bg-terziario)', color: 'var(--testo-secondario)' }}>
                {t('workoutLive.azioni.saltaSerie')}
              </button>

              <button onClick={() => setMostraSelettoreEsercizi(true)}
                      className="btn-enorme mt-2" style={{ background: 'var(--bg-primario)', border: '1px solid var(--bordo)' }}>
                {t('workoutLive.azioni.cambiaEsercizio')}
              </button>
            </div>
          </div>
        )}

        {/* Next exercise / Complete */}
        {serieCorrente > esercizioAttuale.serieTarget && (
          <div className="flex flex-col gap-3 mt-4">
            {prossimoIdx !== -1 ? (
              <>
                <button onClick={prossimoEsercizio} className="btn-enorme">
                  {nomeEsercizio(esercizi[prossimoIdx].esercizio)} →
                </button>

                {/* Reminder of skipped exercises */}
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
                        {t('workoutLive.eserciziDaFare', { count: eserciziSaltati.length })}
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
                          <span style={{ color: 'var(--attenzione, #F59E0B)' }}>{t('workoutLive.azioni.vai')}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <button onClick={() => setChiediFine(true)} disabled={chiudendo} className="btn-enorme successo disabled:opacity-60">
                {chiudendo ? t('workoutLive.unAttimo') : t('workoutLive.azioni.completaAllenamento')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Exercise picker drawer */}
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
                <h3 className="font-bold text-lg">{t('workoutLive.selettore.titolo')}</h3>
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
                            ? (cardioItem ? t('workoutLive.selettore.completato') : t('workoutLive.selettore.serieComplete', { fatte: seriFatte, count: es.serieTarget ?? 0 }))
                            : seriFatte > 0
                              ? (cardioItem ? t('workoutLive.selettore.inCorso') : t('workoutLive.selettore.serieFatte', { fatte: seriFatte, count: es.serieTarget ?? 0 }))
                              : (cardioItem ? (es.durataMinuti ? `${es.durataMinuti} min` : t('workoutLive.selettore.cardio')) : `${es.serieTarget}x${es.repTarget}`)
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
                  {t('workoutLive.selettore.aggiungiExtra')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {cassettoRicerca}

      <AnimatePresence>
        {chiediFine && (
          <FineAllenamento
            inizio={sessione?.dataInizio ? new Date(sessione.dataInizio).getTime() : tempoInizio}
            serie={serieCompletate}
            inviando={chiudendo}
            onTermina={completaAllenamento}
            onAnnulla={() => setChiediFine(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
