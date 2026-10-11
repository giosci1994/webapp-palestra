// ============================================
// GymMaster — Workout Live ("Azione")
// Interfaccia mobile-first per allenamento
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../config/api.js';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { accoda, inviaOra, togliDallaCoda } from '../utils/codaSerie.js';
import { useCodaSerie, useVoceInCoda } from '../hooks/useCodaSerie.js';
import { entro } from '../utils/push.js';
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
import { RPE_LABELS, RIAPERTURA_MAX_MINUTI } from '../utils/costanti.js';
import { formattaPeso, formattaData, nomeEsercizio} from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';

/** La proposta di carico per esito: etichetta e colori della scheda */
const STILE_PROPOSTA = {
  sali: { etichetta: '📈 Proposta per oggi · si sale', colore: 'var(--successo)', bordo: 'var(--successo)', sfondo: 'var(--successo-dim)' },
  resta: { etichetta: '🎯 Proposta per oggi', colore: 'var(--accent)', bordo: 'var(--accent-glow)', sfondo: 'var(--accent-dim)' },
  scarico: { etichetta: '🔄 Proposta per oggi · scarico', colore: 'var(--avviso)', bordo: 'var(--avviso)', sfondo: 'var(--bg-terziario)' }
};
const kg = n => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** Quanto aspetta "Termina" che la coda parta, prima di mostrare il riepilogo senza rete */
const ATTESA_CHIUSURA_MS = 8000;
/** Una serie parte di solito in un attimo: l'avviso solo per quelle ferme da qualche secondo */
const CODA_FERMA_MS = 3000;
/** Cosa serve alla coda di un allenamento (anche per ricrearlo, se sul server sparisce) */
const perLaCoda = s => ({ id: s.id, schedaId: s.schedaId, dataInizio: s.dataInizio });

export default function WorkoutLive() {
  const { id } = useParams();
  const location = useLocation();
  const naviga = useNavigate();
  const wakeLock = useWakeLock();
  const timer = useTimer();
  // Con le push attive, la fine del recupero arriva anche a schermo bloccato
  const push = usePushNotifiche();
  const avvisoRecuperoRef = useRef(false);
  // Serie, salti e "Termina" passano dalla coda sul telefono (utils/codaSerie.js):
  // partono subito se c'e' rete, se no appena torna
  const { utente } = useAuth();
  const utenteId = utente?.id;
  const coda = useCodaSerie(utenteId);

  // --- Persistenza progressi in localStorage ---
  // Chiave unica per sessione: sopravvive a tab kill / cambio app
  const CHIAVE_PROGRESSO = `gymmaster_workout_${id}`;
  const salvaTimeoutRef = useRef(null);

  // Recupera stato salvato (se esiste): letto una volta sola, al primo render
  const [ss] = useState(() => {
    try {
      const raw = localStorage.getItem(CHIAVE_PROGRESSO);
      return raw ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  });

  const [sessione, setSessione] = useState(location.state?.sessione || null);
  const [esercizioIdx, setEsercizioIdx] = useState(ss ? ss.esercizioIdx : 0);
  const [serieCorrente, setSerieCorrente] = useState(ss ? ss.serieCorrente : 1);
  const [form, setForm] = useState(ss ? ss.form : { peso: '', rep: '', rpe: 7, minuti: '', resistenza: '', drop: [] });
  const [serieCompletate, setSerieCompletate] = useState(ss ? ss.serieCompletate : []);
  const [mostraRiepilogo, setMostraRiepilogo] = useState(false);
  const [riprendendo, setRiprendendo] = useState(false);
  const [chiudendo, setChiudendo] = useState(false);
  // "Termina" messo in coda: finche' e' li' l'allenamento e' chiuso solo sul
  // telefono; partito, la risposta del server porta record e fine
  const [idChiusura, setIdChiusura] = useState(null);
  const chiusura = useVoceInCoda(utenteId, idChiusura);
  const [mostraSelettoreEsercizi, setMostraSelettoreEsercizi] = useState(false);
  const [mostraRicercaEsercizi, setMostraRicercaEsercizi] = useState(false);
  const [catalogoEsercizi, setCatalogoEsercizi] = useState([]);
  const [ricercaTesto, setRicercaTesto] = useState('');
  // Gli esercizi ripristinati da localStorage, altrimenti quelli della scheda
  // (se la sessione arriva gia' dalla pagina precedente; se no, al caricamento)
  const [eserciziLive, setEserciziLive] = useState(() =>
    ss?.eserciziLive?.length ? ss.eserciziLive : [...(location.state?.sessione?.scheda?.esercizi ?? [])]);
  const [caricamento, setCaricamento] = useState(!location.state?.sessione);
  // Recupero avviato dall'ultima serie: e' attivo finche' il timer non arriva a
  // zero (timerAttivo, ricavato dal timer senza un effetto che lo spenga)
  const [recuperoAvviato, setRecuperoAvviato] = useState(false);
  // Durata del recupero in corso: la barra di avanzamento non puo' usare quella
  // dell'esercizio attuale, che dopo il passaggio automatico e' gia' il successivo
  const [durataRecupero, setDurataRecupero] = useState(0);
  // Recupero in cima alla schermata invece che al posto dei campi: dopo
  // l'ultima serie si mostra gia' l'esercizio successivo, cosi' durante il
  // recupero vedi cosa ti aspetta e puoi spostarti al macchinario.
  const [recuperoInCima, setRecuperoInCima] = useState(false);
  const timerAttivo = recuperoAvviato && !(timer.secondiRimasti === 0 && !timer.inCorso);
  const nuoviRecord = chiusura.risposta?.recordPersonali || [];
  // Chiuso ore dopo l'ultima serie: il server lo fa finire li' (e non si riprende)
  const finitoAllUltimaSerie = chiusura.risposta?.dimenticata ? new Date(chiusura.risposta.dati.dataFine) : null;
  const [mostraVideo, setMostraVideo] = useState(false);
  const [tempoInizio, setTempoInizio] = useState(() => ss ? ss.tempoInizio : Date.now());
  const [oraAttuale, setOraAttuale] = useState(new Date());
  // Ultima volta che hai fatto ciascun esercizio, in qualsiasi scheda
  const [ultimiCarichi, setUltimiCarichi] = useState({});
  // Un doppio tocco registrava la stessa serie due volte: dopo una serie i
  // pulsanti riposano un attimo
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

  /** Mette in coda una serie (fatta o saltata) e prova subito a mandarla */
  const registraSerie = (dati) => {
    const voce = accoda(utenteId, { tipo: 'serie', sessione: perLaCoda(sessione), dati });
    inviaOra(utenteId).catch(err => console.error('Invio della serie:', err));
    return voce;
  };

  const salvaProgressi = useCallback((stato) => {
    try {
      localStorage.setItem(CHIAVE_PROGRESSO, JSON.stringify(stato));
    } catch {
      // localStorage pieno o non disponibile — ignora silenziosamente
    }
  }, [CHIAVE_PROGRESSO]);
  const statoAttuale = () => ({ esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio });

  // --- Salva progressi in localStorage (debounce 500ms) ---
  // Il ritardo serve solo a non scrivere a ogni tasto nei campi. Le serie
  // registrate si salvano subito, in completaSerie/saltaSerie: se l'app viene
  // chiusa in quel mezzo secondo, riaprendola la serie risulterebbe da fare e
  // verrebbe registrata una seconda volta.
  useEffect(() => {
    if (!id || mostraRiepilogo) return; // Non salvare dopo completamento

    if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    salvaTimeoutRef.current = setTimeout(
      () => salvaProgressi({ esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio }), 500);

    return () => {
      if (salvaTimeoutRef.current) clearTimeout(salvaTimeoutRef.current);
    };
  }, [esercizioIdx, serieCorrente, form, serieCompletate, eserciziLive, tempoInizio, id, mostraRiepilogo, salvaProgressi]);

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
        .then(r => {
          setSessione(r.dati);
          if (ss) return;
          // Niente nel browser (ripreso dallo storico, un altro dispositivo):
          // il punto in cui eri si ricostruisce dalle serie sul server
          const stato = statoDaSessione(r.dati);
          setEserciziLive(stato.eserciziLive);
          setSerieCompletate(stato.serieCompletate);
          setEsercizioIdx(stato.esercizioIdx);
          setSerieCorrente(stato.serieCorrente);
          setTempoInizio(stato.tempoInizio);
        })
        .catch(() => naviga('/schede'))
        .finally(() => setCaricamento(false));
    }
  }, [id, sessione, ss, naviga]);

  // Attiva wake lock (attiva e disattiva non cambiano fra un render e l'altro)
  const { attiva: attivaWakeLock, disattiva: disattivaWakeLock } = wakeLock;
  useEffect(() => {
    attivaWakeLock();
    return () => disattivaWakeLock();
  }, [attivaWakeLock, disattivaWakeLock]);

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

  // Ricerca tollerante sul nome italiano e sull'originale inglese (utils/ricerca.js),
  // con i preferiti dell'utente per primi
  const { preferiti } = usePreferiti();
  const indiceRicerca = useMemo(() => indicizzaEsercizi(catalogoEsercizi), [catalogoEsercizi]);
  const eserciziFiltrati = useMemo(
    () => preferitiPrima(cerca(indiceRicerca, ricercaTesto), preferiti),
    [indiceRicerca, ricercaTesto, preferiti]
  );
  const { visibili: eserciziVisibili, restanti, mostraAltri } = useAPezzi(eserciziFiltrati);

  // --- Tracking esercizi completati ---
  // Un esercizio è "completato" quando ha >= serieTarget serie di lavoro
  // registrate: riscaldamento e drop non contano (utils/tipiSerie.js)
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

  // Calcolo Orari
  const oreMinuti = oraAttuale.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dataOdierna = oraAttuale.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  
  const millisecondiTrascorsi = Math.max(0, oraAttuale.getTime() - tempoInizio);
  const oreTrascorsi = Math.floor(millisecondiTrascorsi / 3600000);
  const minutiTrascorsi = Math.floor((millisecondiTrascorsi % 3600000) / 60000);
  const secondiTrascorsi = Math.floor((millisecondiTrascorsi % 60000) / 1000);
  const cronometro = `${oreTrascorsi > 0 ? oreTrascorsi + ':' : ''}${oreTrascorsi > 0 ? minutiTrascorsi.toString().padStart(2, '0') : minutiTrascorsi}:${secondiTrascorsi.toString().padStart(2, '0')}`;

  // Serie salvate sul telefono e non ancora arrivate: si dice solo quando
  // aspettano da qualche secondo (con la rete partono subito)
  const codaFerma = coda.quante > 0 && oraAttuale.getTime() - Date.parse(coda.dalle) > CODA_FERMA_MS;

  // Serie completate per l'esercizio attuale: riscaldamento, poi ogni serie con i suoi drop
  const serieEsercizio = ordinaSerie(serieCompletate.filter(
    s => s.esercizioId === esercizioAttuale?.esercizioId
  ));

  // Col bilanciere, i dischi da caricare per lato per il peso scritto
  const bilanciere = bilanciereDi(esercizioAttuale?.esercizio);
  const dischi = bilanciere ? dischiPerLato(form.peso, bilanciere.peso) : null;

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

  // Il peso di oggi dalla doppia progressione sulle ultime volte (utils/progressione.js)
  const incremento = incrementoPer(esercizioAttuale?.esercizio);
  const proposta = isCardio ? null : propostaCarico({
    storico: caricoPrecedente?.storico ?? [],
    serieTarget: esercizioAttuale?.serieTarget,
    repTarget: esercizioAttuale?.repTarget,
    incremento
  });
  const usaProposta = () => setForm(p => ({ ...p, peso: String(proposta.peso) }));

  // --- Riscaldamento e drop (utils/tipiSerie.js) ---
  // Prima della prima serie di lavoro, la rampa verso il peso di oggi: quello
  // scritto, se no la proposta o l'ultima volta. Restano i passi piu' pesanti
  // dei riscaldamenti gia' fatti.
  const lavoroIniziato = serieEsercizio.some(diLavoro);
  const riscaldamenti = serieEsercizio.filter(s => s.tipo === 'RISCALDAMENTO');
  const pesoDiLavoro = Number(form.peso) || proposta?.peso || (riferimento && !riferimentoCardio ? riferimento.pesoEffettivo : 0);
  const pesoScaldato = Math.max(0, ...riscaldamenti.map(s => s.pesoEffettivo));
  const rampa = isCardio || lavoroIniziato
    ? []
    : rampaRiscaldamento(pesoDiLavoro, { incremento, minimo: bilanciere?.peso ?? 0 }).filter(p => p.peso > pesoScaldato);
  // I drop della serie in corso: righe peso/ripetizioni sotto quella principale
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
   * Una serie di riscaldamento: si vede fra le serie fatte ma non conta fra
   * quelle della scheda e non fa partire il recupero. true se registrata.
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
    const nuoveCompletate = [...serieCompletate, { ...dati, idClient: voce.id }];
    salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate });
    setSerieCompletate(nuoveCompletate);
    return true;
  };
  const riscaldamentoDalForm = () => {
    if (registraRiscaldamento(parseFloat(form.peso), parseInt(form.rep))) setForm(p => ({ ...p, rep: '' }));
  };

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

    // I drop fatti con questa serie: stesso numero, subito dopo di lei
    const dropFatti = isCardio ? [] : drop.filter(d => d.peso !== '' && d.rep !== '').map(d => ({
      esercizioId: esercizioAttuale.esercizioId,
      serieNumero: serieCorrente,
      tipo: 'DROP',
      pesoEffettivo: parseFloat(d.peso),
      repEffettive: parseInt(d.rep),
      completato: true
    }));

    riposaUnAttimo();
    const registrate = [datiSerie, ...dropFatti].map(dati => ({ ...dati, idClient: registraSerie(dati).id }));
    const nuoveCompletate = [...serieCompletate, ...registrate];
    // Finito l'esercizio si passa subito al prossimo non completato.
    // prossimoIdx esclude gia' l'esercizio attuale, e questa serie non cambia
    // lo stato degli altri: il valore calcolato nel render e' quello giusto.
    const passaAvanti = serieCorrente >= esercizioAttuale.serieTarget && prossimoIdx !== -1;
    if (passaAvanti) {
      const nuovoForm = formPerNuovoEsercizio(form);
      salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate, esercizioIdx: prossimoIdx, serieCorrente: 1, form: nuovoForm });
      setSerieCompletate(nuoveCompletate);
      apriEsercizio(prossimoIdx);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Peso e ripetizioni restano per la serie dopo, i drop no
      const formDopo = { ...form, drop: [] };
      salvaProgressi({ ...statoAttuale(), serieCompletate: nuoveCompletate, serieCorrente: serieCorrente + 1, form: formDopo });
      setSerieCompletate(nuoveCompletate);
      setSerieCorrente(serieCorrente + 1);
      setForm(formDopo);
    }

    // Recupero: quello dell'esercizio appena finito, anche se si e' gia' passati avanti
    const prossimo = passaAvanti
      ? `${nomeEsercizio(esercizi[prossimoIdx].esercizio)} · serie 1`
      : `${nomeEsercizio(esercizioAttuale.esercizio)} · serie ${serieCorrente + 1}`;
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
    // Naviga al prossimo esercizio NON completato
    if (prossimoIdx !== -1) {
      cambiaEsercizio(prossimoIdx);
    }
  };

  /**
   * Campi per un nuovo esercizio: peso, ripetizioni e minuti si svuotano (il
   * peso di quello prima, coi suoi dischi, sarebbe solo fuorviante: il
   * segnaposto mostra la proposta o l'ultima volta), e i drop con loro. RPE e
   * resistenza restano.
   */
  const formPerNuovoEsercizio = (f) => ({ ...f, peso: '', rep: '', minuti: '', drop: [] });

  /** Mostra un altro esercizio senza toccare il recupero. */
  const apriEsercizio = (nuovoIndice) => {
    setEsercizioIdx(nuovoIndice);
    setSerieCorrente(1);
    setForm(formPerNuovoEsercizio);
    setMostraSelettoreEsercizi(false);
    setMostraVideo(false);
  };

  /**
   * @param {number} secondi
   * @param {boolean} inCima - recupero in cima, sopra l'esercizio successivo
   * @param {string} prossimo - cosa tocca dopo, per la notifica: "Panca piana · serie 2"
   */
  const avviaRecupero = (secondi, inCima, prossimo) => {
    timer.avvia(secondi);
    setDurataRecupero(secondi);
    setRecuperoAvviato(true);
    setRecuperoInCima(inCima);
    // Il timer dell'app a schermo bloccato si ferma: avvisa il server
    if (push.iscritto) {
      avvisoRecuperoRef.current = true;
      api.post('/notifiche/push/recupero', { secondi, prossimo }).catch(() => {});
    }
  };

  /** Recupero interrotto o allenamento finito: niente avviso */
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
  };

  const cambiaEsercizio = (nuovoIndice) => {
    apriEsercizio(nuovoIndice);
    // Il recupero riguarda il corpo, non l'esercizio: se sta scorrendo
    // continua, in cima, sopra l'esercizio appena scelto
    if (timerAttivo) setRecuperoInCima(true);
  };

  // "Termina" va in coda dopo le serie: parte con loro, o quando torna la rete.
  // Il riepilogo aspetta un poco l'invio (per i record), poi si mostra comunque
  const completaAllenamento = async () => {
    if (chiudendo) return;
    setChiudendo(true);
    const voce = accoda(utenteId, { tipo: 'completa', sessione: perLaCoda(sessione), dati: { noteFinali: '' } });
    try {
      await entro(inviaOra(utenteId), ATTESA_CHIUSURA_MS, 'Rete lenta');
    } catch {
      // Senza rete, o con una rete che non risponde: resta in coda e parte dopo
    }
    annullaAvvisoRecupero();
    setIdChiusura(voce.id);
    setMostraRiepilogo(true);
    setChiudendo(false);
    pulisciProgressi(); // Pulisci localStorage al completamento
    wakeLock.disattiva();
  };

  const tornaAllAllenamento = () => {
    setIdChiusura(null);
    setMostraRiepilogo(false);
    salvaProgressi(statoAttuale());
    wakeLock.attiva();
  };

  // "Ho chiuso per sbaglio": la sessione torna in corso e si riparte da dove
  // eri, con le serie gia' fatte (sono ancora tutte qui, in memoria)
  const riprendiAllenamento = async () => {
    // Chiuso senza rete: "Termina" e' ancora sul telefono, basta toglierlo
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
          {chiusura.inCoda && (
            <p className="text-xs text-[var(--testo-secondario)] px-3 py-2 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              📴 Sei senza rete: l'allenamento è salvato sul telefono e lo invio appena torna la connessione. I record li trovi poi nelle Statistiche.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">{serieCompletate.filter(diLavoro).length}</p>
              <p className="text-xs text-[var(--testo-terziario)]">Serie completate</p>
            </div>
            <div className="p-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)]">
              <p className="text-2xl font-bold testo-gradient">
                {formattaPeso(volumeDi(serieCompletate))} kg
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
          {finitoAllUltimaSerie ? (
            <p className="text-xs text-[var(--testo-terziario)] mt-3">
              Era rimasto aperto: l'ho fatto finire all'ultima serie, alle {finitoAllUltimaSerie.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          ) : (
            <>
              <button onClick={riprendiAllenamento} disabled={riprendendo} className="btn-secondario w-full mt-3">
                {riprendendo ? 'Un attimo...' : '↩️ Ho chiuso per sbaglio, riprendi'}
              </button>
              <p className="text-[11px] text-[var(--testo-terziario)] mt-2">Puoi riprendere l'allenamento entro {RIAPERTURA_MAX_MINUTI} minuti, anche dallo Storico.</p>
            </>
          )}
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
          <button onClick={completaAllenamento} disabled={chiudendo}
                  className="text-sm font-medium text-[var(--pericolo)] px-3 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--pericolo-dim)] disabled:opacity-60">
            {chiudendo ? 'Un attimo...' : 'Termina'}
          </button>
        </div>
      </div>

      {codaFerma && (
        <p className="px-4 py-2 text-xs text-center text-[var(--testo-secondario)] bg-[var(--bg-terziario)] border-b border-[var(--bordo)]">
          📴 Senza rete: {coda.quante === 1 ? '1 serie salvata' : `${coda.quante} serie salvate`} sul telefono, le invio appena torna la connessione
        </p>
      )}

      {/* Recupero dopo l'ultima serie: resta in vista mentre prepari il prossimo esercizio */}
      {timerAttivo && recuperoInCima && timer.secondiRimasti > 0 && (
        <div className="sticky z-30 px-4 pt-3" style={{ top: 'var(--safe-top)' }}>
          <div className="max-w-lg mx-auto rounded-[var(--raggio-md)] border border-[var(--accent)]/40 bg-[var(--bg-secondario)] shadow-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)]">Recupero</p>
                <p className="text-xs text-[var(--testo-secondario)] truncate">Prossimo: {nomeEsercizio(esercizioAttuale.esercizio)}</p>
              </div>
              <p className="text-3xl font-extrabold tabular-nums leading-none testo-gradient" role="timer" aria-label={`Recupero: ${formattaTempo(timer.secondiRimasti)}`}>
                {formattaTempo(timer.secondiRimasti)}
              </p>
              <button onClick={fermaRecupero}
                      className="text-xs font-medium text-[var(--accent)] px-3 py-1.5 rounded-full border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors shrink-0">
                Salta
              </button>
            </div>
            <div className="h-1 bg-[var(--bg-terziario)]">
              <div className="h-full bg-[var(--accent)] transition-[width] duration-1000 ease-linear"
                   style={{ width: `${(timer.secondiRimasti / (durataRecupero || 1)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

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

        {/* Serie completate: riscaldamento, poi ogni serie con i suoi drop */}
        {serieEsercizio.length > 0 && (
          <div className="flex flex-col gap-1">
            {serieEsercizio.map((s, i) => (
              <div key={s.idClient ?? s.id ?? i}
                   className={`flex items-center justify-between px-3 py-2 rounded-[var(--raggio-sm)] ${
                     s.tipo === 'RISCALDAMENTO' ? 'bg-[var(--bg-terziario)]' : 'bg-[var(--successo-dim)]'
                   } ${s.tipo === 'DROP' ? 'ml-6' : ''}`}>
                <span className={`text-sm font-medium ${s.tipo === 'RISCALDAMENTO' ? 'text-[var(--testo-secondario)]' : 'text-[var(--successo)]'}`}>
                  {s.tipo === 'RISCALDAMENTO' ? '🔥 Riscaldamento' : s.tipo === 'DROP' ? '↳ Drop' : `Serie ${s.serieNumero ?? i + 1} ✓`}
                </span>
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
          {timerAttivo && timer.secondiRimasti > 0 && !recuperoInCima && (
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
                  style={{ background: 'var(--accent)', width: `${(timer.secondiRimasti / (durataRecupero || 1)) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <button onClick={fermaRecupero}
                      className="mt-4 text-sm text-[var(--accent)] font-medium px-4 py-1.5 rounded-full border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors">
                Salta recupero →
              </button>
              {/* A schermo bloccato il timer si ferma: lo dice, e dove rimediare */}
              {push.caricato && push.supportate && push.serverAttivo && !push.iscritto && push.permesso !== 'denied' && (
                <p className="mt-3 text-[11px] text-[var(--testo-terziario)]">
                  A schermo bloccato non suona: <Link to="/profilo?tab=notifiche" className="text-[var(--accent)] underline">attiva le notifiche</Link> per l'avviso di fine recupero.
                </p>
              )}
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
        {(!timerAttivo || timer.secondiRimasti === 0 || recuperoInCima) && serieCorrente <= esercizioAttuale.serieTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-center text-[var(--testo-secondario)]">
              Serie {serieCorrente} / {esercizioAttuale.serieTarget}
            </p>

            {/* Proposta di oggi: sale, resta o scarica, e perche' */}
            {proposta && (
              <button
                type="button"
                onClick={usaProposta}
                className="flex items-center justify-between gap-3 w-full px-3 py-2.5 rounded-[var(--raggio-md)] border text-left hover:border-[var(--accent)] transition-colors"
                style={{ borderColor: STILE_PROPOSTA[proposta.esito].bordo, background: STILE_PROPOSTA[proposta.esito].sfondo }}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold" style={{ color: STILE_PROPOSTA[proposta.esito].colore }}>
                    {STILE_PROPOSTA[proposta.esito].etichetta}
                  </span>
                  <span className="block text-base font-bold tabular-nums">
                    {kg(proposta.peso)} kg × {proposta.ripetizioni.min === proposta.ripetizioni.max
                      ? proposta.ripetizioni.min
                      : `${proposta.ripetizioni.min}-${proposta.ripetizioni.max}`}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--testo-secondario)] mt-0.5">{proposta.motivo}</span>
                </span>
                <span className="text-xs font-bold text-[var(--accent)] shrink-0">Usa</span>
              </button>
            )}

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

            {/* Prima della prima serie: la rampa di riscaldamento, un tocco per passo fatto */}
            {rampa.length > 0 && (
              <div className="px-3 py-2.5 rounded-[var(--raggio-md)] border border-[var(--bordo)] bg-[var(--bg-terziario)]">
                <p className="text-[11px] text-[var(--testo-terziario)] mb-2">
                  🔥 Riscaldamento verso {kg(pesoDiLavoro)} kg · tocca un passo quando l'hai fatto
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
                           className="campo-input text-center text-3xl font-bold py-5" placeholder={proposta ? String(proposta.peso) : riferimento && !riferimentoCardio ? String(riferimento.pesoEffettivo) : '0'}
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

            {!isCardio && dischi && (
              <p className="text-xs text-center text-[var(--testo-secondario)] -mt-1">
                🏋️ Per lato: <strong className="text-[var(--testo-primario)]">{descriviDischi(dischi.perLato)}</strong>
                <span className="text-[var(--testo-terziario)]"> · {bilanciere.nome} {bilanciere.peso} kg</span>
                {dischi.mancano > 0 && <span className="text-[var(--avviso)]"> · mancano {String(dischi.mancano).replace('.', ',')} kg</span>}
              </p>
            )}

            {/* Drop: subito dopo la serie, a peso calato, si registrano insieme a lei */}
            {!isCardio && (
              <div className="flex flex-col gap-2">
                {drop.map((d, i) => (
                  <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_2rem] gap-2 items-center">
                    <span className="text-xs font-semibold text-[var(--testo-secondario)]">↳ Drop</span>
                    <input type="number" value={d.peso} onChange={e => cambiaDrop(i, 'peso', e.target.value)}
                           className="campo-input text-center text-lg font-bold py-2" placeholder="kg"
                           inputMode="decimal" step="0.5" min="0" aria-label={`Peso del drop ${i + 1}`} />
                    <input type="number" value={d.rep} onChange={e => cambiaDrop(i, 'rep', e.target.value)}
                           className="campo-input text-center text-lg font-bold py-2" placeholder="rip."
                           inputMode="numeric" min="0" aria-label={`Ripetizioni del drop ${i + 1}`} />
                    <button type="button" onClick={() => togliDrop(i)} aria-label={`Togli il drop ${i + 1}`}
                            className="h-9 flex items-center justify-center rounded-[var(--raggio-sm)] text-[var(--testo-terziario)] hover:text-[var(--pericolo)]">
                      ✕
                    </button>
                  </div>
                ))}
                {dropIncompleto && (
                  <p className="text-[11px] text-[var(--avviso)]">Scrivi peso e ripetizioni del drop, o toglilo</p>
                )}
                <button type="button" onClick={aggiungiDrop}
                        className="self-start text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
                  ↘ Aggiungi un drop set
                </button>
              </div>
            )}

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
              <button onClick={completaSerie} disabled={inviando || serieIncompleta}
                      className={`btn-enorme ${
                        serieIncompleta
                          ? 'opacity-80 bg-[var(--pericolo-dim)] text-[var(--pericolo)] border border-[var(--pericolo)]/50 cursor-not-allowed'
                          : 'successo'
                      }`}>
                ✓ Serie Completata{drop.length > 0 ? ` + ${drop.length === 1 ? 'drop' : `${drop.length} drop`}` : ''}
              </button>

              {/* Prima della prima serie di lavoro: quella appena fatta era un riscaldamento */}
              {!isCardio && !lavoroIniziato && (
                <button onClick={riscaldamentoDalForm} disabled={inviando || !form.peso || !form.rep}
                        className="text-sm font-medium text-[var(--testo-secondario)] py-1.5 hover:text-[var(--testo-primario)] transition-colors disabled:opacity-50">
                  🔥 Registra come riscaldamento (non conta fra le serie)
                </button>
              )}

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
              <button onClick={completaAllenamento} disabled={chiudendo} className="btn-enorme successo disabled:opacity-60">
                {chiudendo ? 'Un attimo...' : '🏆 Completa Allenamento'}
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
                {eserciziVisibili.map((es) => (
                  <button
                    key={es.id}
                    onClick={() => aggiungiEsercizioExtra(es)}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--bordo)] bg-[var(--bg-terziario)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors text-left"
                  >
                    <div>
                      <p className="font-semibold text-sm">{preferiti.has(es.id) && <span title="Preferito">⭐ </span>}{nomeEsercizio(es)}</p>
                      <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{es.gruppoMuscoloPrimario} · {es.attrezzatura?.nome || 'Varie'}</p>
                    </div>
                    <span className="text-[var(--accent)] font-bold">➕</span>
                  </button>
                ))}
{restanti > 0 && (
                  <button onClick={mostraAltri} className="text-sm text-[var(--accent)] py-3 hover:underline">
                    Mostra altri ({restanti.toLocaleString('it-IT')})
                  </button>
                )}
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
