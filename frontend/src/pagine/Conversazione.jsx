// ============================================
// GymMaster — Pagina Conversazione
// Chat real-time con Socket.io
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { useSocket } from '../contesti/SocketContesto.jsx';
import { api } from '../config/api.js';
import { formattaDataRelativa } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ArrowLeft } from 'lucide-react';

export default function Conversazione() {
  const { id } = useParams();
  const { utente } = useAuth();
  const { emit, on, connesso } = useSocket();

  const [messaggi, setMessaggi] = useState([]);
  const [testo, setTesto] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [staScrivendo, setStaScrivendo] = useState(false);
  const [nomeAltro, setNomeAltro] = useState('');
  const [altroId, setAltroId] = useState(null);
  const [altroOnline, setAltroOnline] = useState(false);
  const [altroUltimoAccesso, setAltroUltimoAccesso] = useState(null);
  const [viewportHeight, setViewportHeight] = useState('100dvh');

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const timeoutScrittura = useRef(null);

  const conversazioneId = parseInt(id);

  // Carica messaggi
  useEffect(() => {
    const caricaMessaggi = async () => {
      try {
        const risposta = await api.get(`/chat/conversazioni/${id}/messaggi`);
        setMessaggi(risposta.dati?.messaggi || []);

        // Carica info conversazione per il nome
        const convRisposta = await api.get('/chat/conversazioni');
        const conv = (convRisposta.dati || []).find(c => c.id === conversazioneId);
        if (conv) {
          const altro = conv.partecipanti?.find(p => p.utente?.id !== utente.id)?.utente;
          setNomeAltro(altro?.nome || 'Utente');
          setAltroId(altro?.id || null);
        }
      } catch (err) {
        console.error('Errore caricamento messaggi:', err);
      } finally {
        setCaricamento(false);
      }
    };

    caricaMessaggi();
  }, [id]);

  // Presenza reale dell'altro utente: richiede lo stato e ascolta i cambi
  useEffect(() => {
    if (!altroId) return;
    emit('presenza:richiedi', { utenteId: altroId });
    const cleanup = on('presenza:cambio', ({ utenteId: uid, online, ultimoAccesso }) => {
      if (uid !== altroId) return;
      setAltroOnline(!!online);
      if (ultimoAccesso) setAltroUltimoAccesso(ultimoAccesso);
    });
    return cleanup;
  }, [altroId, connesso]);

  // Adatta altezza alla tastiera mobile (Visual Viewport API)
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        window.scrollTo(0, 0); // forza scroll in cima per iOS
      } else {
        setViewportHeight(`${window.innerHeight}px`);
      }
    };
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      handleResize();
    } else {
      window.addEventListener('resize', handleResize);
      handleResize();
    }
    
    return () => {
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Socket.io: entra nella room della conversazione e blocca scroll globale
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    if (connesso) {
      emit('chat:entra_conversazione', { conversazioneId });
    }

    return () => {
      document.body.style.overflow = '';
      if (connesso) emit('chat:esci_conversazione', { conversazioneId });
    };
  }, [connesso, conversazioneId, emit]);

  // Socket.io: ascolta nuovi messaggi
  useEffect(() => {
    if (!connesso) return;

    const cleanup1 = on('chat:nuovo_messaggio', ({ messaggio }) => {
      setMessaggi(prev => {
        // Evita duplicati
        if (prev.some(m => m.id === messaggio.id)) return prev;
        return [...prev, messaggio];
      });
    });

    const cleanup2 = on('chat:sta_scrivendo', ({ utenteId }) => {
      if (utenteId !== utente.id) {
        setStaScrivendo(true);
        clearTimeout(timeoutScrittura.current);
        timeoutScrittura.current = setTimeout(() => setStaScrivendo(false), 3000);
      }
    });

    const cleanup3 = on('chat:smesso_scrivere', ({ utenteId }) => {
      if (utenteId !== utente.id) setStaScrivendo(false);
    });

    return () => { cleanup1(); cleanup2(); cleanup3(); };
  }, [connesso, utente.id]);

  // Auto-scroll in fondo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messaggi, staScrivendo]);

  // Invia messaggio
  const inviaMessaggio = useCallback(() => {
    const contenuto = testo.trim();
    if (!contenuto || !connesso) return;

    emit('chat:invia_messaggio', { conversazioneId, contenuto }, (risposta) => {
      if (risposta?.errore) {
        alert(risposta.errore);
      }
    });

    emit('chat:smesso_scrivere', { conversazioneId });
    setTesto('');
    inputRef.current?.focus();
  }, [testo, connesso, conversazioneId]);

  // Gestisci "sta scrivendo..."
  const gestisciInput = (e) => {
    setTesto(e.target.value);
    emit('chat:sta_scrivendo', { conversazioneId });
    clearTimeout(timeoutScrittura.current);
    timeoutScrittura.current = setTimeout(() => {
      emit('chat:smesso_scrivere', { conversazioneId });
    }, 2000);
  };

  // Invio con Enter
  const gestisciTasto = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inviaMessaggio();
    }
  };

  // Raggruppa messaggi per data
  const raggruppaPerData = (msgs) => {
    const gruppi = [];
    let dataCorrente = null;

    msgs.forEach(msg => {
      const data = new Date(msg.inviatoIl).toLocaleDateString('it-IT');
      if (data !== dataCorrente) {
        gruppi.push({ tipo: 'data', valore: data });
        dataCorrente = data;
      }
      gruppi.push({ tipo: 'messaggio', valore: msg });
    });

    return gruppi;
  };

  if (caricamento) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  const elementiChat = raggruppaPerData(messaggi);

  return (
    <div className="relative z-[60] bg-[var(--bg-primario)] flex flex-col w-full mx-auto border-x-0 md:border-x border-[var(--bordo)] rounded-[var(--raggio-lg)] overflow-hidden"
         style={{ height: viewportHeight }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--bordo)] shrink-0"
           style={{ background: 'var(--bg-secondario)', paddingTop: 'calc(16px + var(--safe-top))' }}>
        <Link to="/chat" className="text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] text-lg">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
             style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
          {nomeAltro.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{nomeAltro}</p>
          <p className="text-[10px] text-[var(--testo-terziario)]">
            {staScrivendo
              ? 'sta scrivendo...'
              : altroOnline
                ? '🟢 online'
                : altroUltimoAccesso
                  ? `visto ${formattaDataRelativa(altroUltimoAccesso)}`
                  : '⚪ offline'}
          </p>
        </div>
      </div>

      {/* Messaggi */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-2 no-scrollbar">
        {elementiChat.map((el, i) => {
          if (el.tipo === 'data') {
            return (
              <div key={`data-${i}`} className="flex justify-center my-4">
                <span className="text-[10px] text-[var(--testo-terziario)] px-3 py-1 rounded-full bg-[var(--bg-terziario)]">
                  {el.valore}
                </span>
              </div>
            );
          }

          const msg = el.valore;
          const mio = msg.mittenteId === utente.id;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${mio ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  mio
                    ? 'bg-[var(--accent)] text-white rounded-br-md'
                    : 'bg-[var(--bg-terziario)] text-[var(--testo-primario)] rounded-bl-md'
                }`}
              >
                <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.contenuto}</p>
                <p className={`text-[10px] mt-1.5 ${mio ? 'text-white/60' : 'text-[var(--testo-terziario)]'}`}>
                  {new Date(msg.inviatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          );
        })}

        {/* Indicatore "sta scrivendo" */}
        <AnimatePresence>
          {staScrivendo && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex justify-start">
              <div className="px-5 py-3 rounded-2xl bg-[var(--bg-terziario)] rounded-bl-md shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--testo-terziario)] anima-pulsa" style={{ animationDelay: '0s' }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--testo-terziario)] anima-pulsa" style={{ animationDelay: '0.2s' }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--testo-terziario)] anima-pulsa" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input messaggio */}
      <div className="px-6 py-4 border-t border-[var(--bordo)] shrink-0"
           style={{ background: 'var(--bg-secondario)', paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
        <div className="flex items-end gap-2 relative">
          <textarea
            ref={inputRef}
            value={testo}
            onChange={gestisciInput}
            onKeyDown={gestisciTasto}
            onFocus={() => setTimeout(() => window.scrollTo(0, 0), 100)}
            placeholder="Scrivi un messaggio..."
            rows={1}
            className="campo-input flex-1 resize-none min-h-[48px] max-h-[120px] rounded-[24px] pr-12 text-[16px]"
            style={{ paddingTop: '12px', paddingBottom: '12px' }}
          />
          <button onClick={inviaMessaggio}
                  disabled={!testo.trim() || !connesso}
                  className="absolute right-1.5 bottom-1.5 w-9 h-9 flex items-center justify-center rounded-full text-white transition-all disabled:opacity-50 disabled:scale-95 shadow-md"
                  style={{ background: testo.trim() ? 'var(--accent)' : 'var(--testo-terziario)' }}>
            <Send size={16} className="ml-0.5" />
          </button>
        </div>
        {!connesso && (
          <p className="text-xs text-[var(--avviso)] mt-2 text-center font-medium">⚠️ Connessione in corso...</p>
        )}
      </div>
    </div>
  );
}
