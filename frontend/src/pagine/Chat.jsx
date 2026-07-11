// ============================================
// GymMaster — Pagina Chat
// Lista conversazioni + richieste contatto
// ============================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { formattaDataRelativa } from '../utils/formattatori.js';
import { RUOLI } from '../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';

export default function Chat() {
  const { utente } = useAuth();
  const [conversazioni, setConversazioni] = useState([]);
  const [richieste, setRichieste] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraCerca, setMostraCerca] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [tab, setTab] = useState('chat'); // chat, richieste

  useEffect(() => { caricaDati(); }, []);

  const caricaDati = async () => {
    try {
      setCaricamento(true);
      const [conv, rich] = await Promise.all([
        api.get('/chat/conversazioni'),
        api.get('/chat/contatti/ricevute')
      ]);
      setConversazioni(conv.dati || []);
      setRichieste(rich.dati || []);
    } catch (err) {
      console.error('Errore caricamento chat:', err);
    } finally {
      setCaricamento(false);
    }
  };

  const cercaUtenti = async (q) => {
    setRicerca(q);
    if (q.length < 2) { setRisultatiRicerca([]); return; }
    try {
      const risposta = await api.get(`/utenti/cerca?q=${encodeURIComponent(q)}`);
      setRisultatiRicerca(risposta.dati || []);
    } catch { setRisultatiRicerca([]); }
  };

  const inviaRichiesta = async (destinatarioId) => {
    try {
      await api.post('/chat/contatti/richiesta', { destinatarioId });
      setMostraCerca(false);
      setRicerca('');
      alert('Richiesta di contatto inviata! ✉️');
    } catch (err) {
      alert(err.message);
    }
  };

  const rispondiRichiesta = async (id, stato) => {
    try {
      await api.patch(`/chat/contatti/${id}/rispondi`, { stato });
      setRichieste(prev => prev.filter(r => r.id !== id));
      if (stato === 'ACCETTATA') caricaDati(); // Ricarica conversazioni
    } catch (err) {
      alert(err.message);
    }
  };

  // Trova l'altro partecipante nella conversazione
  const altroPartecipante = (conv) => {
    return conv.partecipanti?.find(p => p.utente?.id !== utente.id)?.utente;
  };

  return (
    <div className="flex flex-col max-w-2xl w-full mx-auto px-4 md:px-6">
      {/* Header Fissato in Alto */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primario)] pt-4 pb-4 border-b border-[var(--bordo)] mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Chat</h1>
            <p className="text-sm text-[var(--testo-secondario)] mt-1">
              {conversazioni.length} conversazioni
              {richieste.length > 0 && ` · ${richieste.length} richieste`}
            </p>
          </div>
          <button onClick={() => setMostraCerca(!mostraCerca)} className="btn-primario shadow-lg">
            ＋ Nuovo contatto
          </button>
        </div>
        
        {/* Tabs: Chat / Richieste */}
        <div className="flex gap-2 mt-4">
          <button onClick={() => setTab('chat')}
                  className={`px-4 py-2 rounded-[var(--raggio-pieno)] text-sm font-medium transition-all ${
                    tab === 'chat' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'
                  }`}>
            💬 Chat
          </button>
          <button onClick={() => setTab('richieste')}
                  className={`px-4 py-2 rounded-[var(--raggio-pieno)] text-sm font-medium transition-all relative ${
                    tab === 'richieste' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)]'
                  }`}>
            ✉️ Richieste
            {richieste.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--pericolo)] text-white text-xs flex items-center justify-center font-bold">
                {richieste.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Ricerca utenti */}
      <AnimatePresence>
        {mostraCerca && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="mb-4 overflow-hidden shrink-0">
            <div className="glass-card p-card-inner">
              <input type="text" value={ricerca} onChange={e => cercaUtenti(e.target.value)}
                     className="campo-input mb-3" placeholder="🔍 Cerca per nome o email..." autoFocus />
              {risultatiRicerca.length > 0 && (
                <div className="flex flex-col gap-1">
                  {risultatiRicerca.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-[var(--raggio-md)] hover:bg-[var(--bg-terziario)] transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                             style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          {u.nome?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.nome}</p>
                          <span className={`badge ${RUOLI[u.ruolo]?.colore || 'accent'} text-[10px]`}>
                            {RUOLI[u.ruolo]?.label}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => inviaRichiesta(u.id)} className="btn-primario text-xs py-1.5 px-3">
                        Contatta
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {ricerca.length >= 2 && risultatiRicerca.length === 0 && (
                <p className="text-center text-sm text-[var(--testo-terziario)] py-2">Nessun utente trovato</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenuto */}
      <div className="flex-1 pb-6">
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : tab === 'chat' ? (
        /* Lista conversazioni */
        conversazioni.length === 0 ? (
          <div className="glass-card p-card-inner text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-[var(--testo-secondario)]">Nessuna conversazione</p>
            <p className="text-xs text-[var(--testo-terziario)] mt-1">
              Cerca un utente per iniziare a chattare
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversazioni.map((conv, i) => {
              const altro = altroPartecipante(conv);
              const ultimoMsg = conv.messaggi?.[0];
              const nonLetto = ultimoMsg && !ultimoMsg.letto && ultimoMsg.mittenteId !== utente.id;
              return (
                <motion.div key={conv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}>
                  <Link to={`/chat/${conv.id}`}
                        className={`flex items-center gap-3 px-card-inner py-4 rounded-[var(--raggio-lg)] transition-all hover:bg-[var(--bg-terziario)] ${
                          nonLetto ? 'bg-[var(--accent-dim)]' : ''
                        }`}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                         style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {altro?.nome?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold text-sm truncate ${nonLetto ? 'text-white' : ''}`}>
                          {altro?.nome || 'Utente'}
                        </p>
                        {altro?.ruolo === 'PERSONAL_TRAINER' && (
                          <span className="badge avviso text-[9px]">PT</span>
                        )}
                      </div>
                      {ultimoMsg && (
                        <p className={`text-xs truncate mt-0.5 ${nonLetto ? 'text-[var(--testo-primario)] font-medium' : 'text-[var(--testo-terziario)]'}`}>
                          {ultimoMsg.mittenteId === utente.id ? 'Tu: ' : ''}{ultimoMsg.contenuto}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-[var(--testo-terziario)]">
                        {ultimoMsg ? formattaDataRelativa(ultimoMsg.inviatoIl) : ''}
                      </span>
                      {nonLetto && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )
      ) : (
        /* Lista richieste */
        richieste.length === 0 ? (
          <div className="glass-card p-card-inner text-center">
            <div className="text-4xl mb-3">✉️</div>
            <p className="text-[var(--testo-secondario)]">Nessuna richiesta in attesa</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {richieste.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          className="glass-card px-card-inner py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                     style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {r.mittente?.nome?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{r.mittente?.nome}</p>
                  <p className="text-xs text-[var(--testo-terziario)]">
                    Vuole contattarti · {formattaDataRelativa(r.dataRichiesta)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rispondiRichiesta(r.id, 'ACCETTATA')}
                          className="btn-primario text-xs py-1.5 px-3" style={{ background: 'var(--successo)' }}>
                    Accetta
                  </button>
                  <button onClick={() => rispondiRichiesta(r.id, 'RIFIUTATA')}
                          className="btn-secondario text-xs py-1.5 px-3">
                    Rifiuta
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}
      </div>
    </div>
  );
}
