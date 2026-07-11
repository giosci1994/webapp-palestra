// ============================================
// GymMaster — Pagina Assistente AI (GymBot)
// Chat con l'assistente fitness virtuale
// ============================================

import { useState, useEffect, useRef } from 'react';
import { api } from '../config/api.js';
import { formattaDataRelativa, formattaData } from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';

// Suggerimenti rapidi per l'utente
const SUGGERIMENTI = [
  { icona: '💪', testo: 'Suggerisci un allenamento push per intermedi' },
  { icona: '🔄', testo: 'Ho la panca occupata, cosa posso fare al suo posto?' },
  { icona: '📊', testo: 'Analizza i miei progressi recenti' },
  { icona: '🍽️', testo: 'Consigli per la nutrizione post-workout' },
  { icona: '🦵', testo: 'Esercizi per rinforzare le gambe senza squat' },
  { icona: '⚖️', testo: 'Come dovrei aumentare i carichi progressivamente?' }
];

export default function Assistente() {
  const [conversazioni, setConversazioni] = useState([]);
  const [conversazioneAttiva, setConversazioneAttiva] = useState(null);
  const [messaggi, setMessaggi] = useState([]);
  const [testo, setTesto] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [inAttesa, setInAttesa] = useState(false);
  const [mostraStorico, setMostraStorico] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Carica storico conversazioni
  useEffect(() => {
    api.get('/assistente/conversazioni')
      .then(r => setConversazioni(r.dati || []))
      .catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messaggi, inAttesa]);

  const inviaMessaggio = async (testoOverride) => {
    const contenuto = (testoOverride || testo).trim();
    if (!contenuto || inAttesa) return;

    // Aggiungi messaggio utente in locale subito
    const msgUtente = { ruolo: 'utente', contenuto, inviatoIl: new Date().toISOString() };
    setMessaggi(prev => [...prev, msgUtente]);
    setTesto('');
    setInAttesa(true);

    try {
      const risposta = await api.post('/assistente/chiedi', {
        messaggio: contenuto,
        conversazioneAiId: conversazioneAttiva
      });

      // Aggiungi risposta assistente
      const msgAssistente = {
        ruolo: 'assistente',
        contenuto: risposta.dati.risposta,
        inviatoIl: new Date().toISOString()
      };
      setMessaggi(prev => [...prev, msgAssistente]);

      // Salva ID conversazione per i messaggi successivi
      if (!conversazioneAttiva) {
        setConversazioneAttiva(risposta.dati.conversazioneAiId);
      }
    } catch (err) {
      const msgErrore = {
        ruolo: 'assistente',
        contenuto: `⚠️ ${err.message || 'Errore nella comunicazione con GymBot. Riprova.'}`,
        inviatoIl: new Date().toISOString(),
        errore: true
      };
      setMessaggi(prev => [...prev, msgErrore]);
    } finally {
      setInAttesa(false);
      inputRef.current?.focus();
    }
  };

  const nuovaConversazione = () => {
    setConversazioneAttiva(null);
    setMessaggi([]);
    setMostraStorico(false);
  };

  const caricaConversazione = async (convId) => {
    try {
      // Carica i messaggi dal server (conversazioneAI ha i messaggi completi)
      // Per ora facciamo una nuova richiesta per ottenere lo storico completo
      setConversazioneAttiva(convId);
      setMessaggi([]); // Verrà riempito dal contesto della conv
      setMostraStorico(false);

      // Recupera dettagli
      const risposta = await api.get('/assistente/conversazioni');
      const conv = (risposta.dati || []).find(c => c.id === convId);
      if (conv?.messaggi?.length > 0) {
        // Il backend ritorna solo l'ultimo messaggio, avvisiamo l'utente
        setMessaggi([{
          ruolo: 'assistente',
          contenuto: '📂 Conversazione ripresa. Scrivi un messaggio per continuare!',
          inviatoIl: new Date().toISOString()
        }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const gestisciTasto = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inviaMessaggio();
    }
  };

  // Formatta il markdown semplice della risposta AI
  const formattaRisposta = (testo) => {
    return testo
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-32px)] max-w-3xl -mx-4 md:mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-card-inner py-4 border-b border-[var(--bordo)] shrink-0"
           style={{ background: 'var(--bg-secondario)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            🤖
          </div>
          <div>
            <h1 className="font-bold text-sm">GymBot</h1>
            <p className="text-[10px] text-[var(--testo-terziario)]">
              Assistente fitness AI · Powered by Gemini
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMostraStorico(!mostraStorico)}
                  className="text-xs px-3 py-1.5 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-all">
            📂 Storico
          </button>
          <button onClick={nuovaConversazione}
                  className="text-xs px-3 py-1.5 rounded-[var(--raggio-md)] bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all">
            ＋ Nuova
          </button>
        </div>
      </div>

      {/* Storico panel */}
      <AnimatePresence>
        {mostraStorico && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden border-b border-[var(--bordo)]"
                      style={{ background: 'var(--bg-secondario)' }}>
            <div className="p-4 max-h-48 overflow-y-auto">
              <h3 className="text-xs font-semibold text-[var(--testo-terziario)] mb-2 uppercase">Conversazioni precedenti</h3>
              {conversazioni.length === 0 ? (
                <p className="text-xs text-[var(--testo-terziario)]">Nessuna conversazione passata</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {conversazioni.map(c => (
                    <button key={c.id} onClick={() => caricaConversazione(c.id)}
                            className={`flex items-center gap-2 p-2 rounded-[var(--raggio-sm)] text-left text-xs transition-all ${
                              conversazioneAttiva === c.id ? 'bg-[var(--accent-dim)]' : 'hover:bg-[var(--bg-terziario)]'
                            }`}>
                      <span className="text-sm">💬</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[var(--testo-primario)]">
                          {c.messaggi?.[0]?.contenuto || 'Conversazione'}
                        </p>
                        <p className="text-[var(--testo-terziario)]">{formattaDataRelativa(c.creatoIl)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Area messaggi */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 no-scrollbar">
        {/* Benvenuto se nessun messaggio */}
        {messaggi.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center flex-1 py-8">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-xl font-bold mb-1">Ciao! Sono GymBot</h2>
            <p className="text-sm text-[var(--testo-secondario)] text-center max-w-md mb-6">
              Il tuo assistente fitness personale. Chiedimi consigli su allenamento,
              nutrizione, progressione carichi e molto altro!
            </p>

            {/* Suggerimenti rapidi */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGERIMENTI.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  onClick={() => inviaMessaggio(s.testo)}
                  className="flex items-center gap-2 px-card-inner py-3 rounded-[var(--raggio-md)] bg-[var(--bg-terziario)] text-left text-sm hover:bg-[var(--accent-dim)] hover:border-[var(--accent)] border border-transparent transition-all"
                >
                  <span className="text-lg shrink-0">{s.icona}</span>
                  <span className="text-[var(--testo-secondario)]">{s.testo}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Messaggi */}
        {messaggi.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.ruolo === 'utente' ? 'justify-end' : 'justify-start'}`}
          >
            <div className="flex items-start gap-2 max-w-[85%]">
              {msg.ruolo === 'assistente' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mt-1"
                     style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
                  🤖
                </div>
              )}
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.ruolo === 'utente'
                  ? 'bg-[var(--accent)] text-white rounded-br-md'
                  : msg.errore
                    ? 'bg-[var(--pericolo-dim)] text-[var(--pericolo)] rounded-bl-md'
                    : 'bg-[var(--bg-terziario)] text-[var(--testo-primario)] rounded-bl-md'
              }`}>
                {msg.ruolo === 'assistente' ? (
                  <div dangerouslySetInnerHTML={{ __html: formattaRisposta(msg.contenuto) }} />
                ) : (
                  <p>{msg.contenuto}</p>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Indicatore "sta pensando..." */}
        <AnimatePresence>
          {inAttesa && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                   style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
                🤖
              </div>
              <div className="px-4 py-3 rounded-2xl bg-[var(--bg-terziario)] rounded-bl-md">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] anima-pulsa" style={{ animationDelay: '0s' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] anima-pulsa" style={{ animationDelay: '0.2s' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] anima-pulsa" style={{ animationDelay: '0.4s' }} />
                  </div>
                  <span className="text-xs text-[var(--testo-terziario)]">GymBot sta pensando...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input messaggio */}
      <div className="px-card-inner pt-3 pb-[calc(12px+var(--safe-bottom))] border-t border-[var(--bordo)] shrink-0" style={{ background: 'var(--bg-secondario)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={gestisciTasto}
            placeholder="Chiedi a GymBot..."
            rows={1}
            className="campo-input flex-1 resize-none min-h-[44px] max-h-[120px]"
            style={{ paddingTop: '10px', paddingBottom: '10px' }}
            disabled={inAttesa}
          />
          <button onClick={() => inviaMessaggio()}
                  disabled={!testo.trim() || inAttesa}
                  className="btn-primario shrink-0 w-11 h-11 p-0 rounded-full">
            {inAttesa ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full anima-ruota" />
            ) : '➤'}
          </button>
        </div>
        <p className="text-[10px] text-[var(--testo-terziario)] mt-1 text-center">
          GymBot può commettere errori. Consulta un professionista per consigli medici.
        </p>
      </div>
    </div>
  );
}
