// ============================================
// GymMaster — Pagina Gamification (v2)
// Badge, Classifica XP, Classifica Record, Profilo Pubblico
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { RUOLI, GRUPPI_MUSCOLARI } from '../utils/costanti.js';
import { formattaData, formattaPeso, formattaDurata, formattaNumero, nomeEsercizio} from '../utils/formattatori.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building, Trophy, Dumbbell } from 'lucide-react';

export default function Gamification() {
  const { utente } = useAuth();
  const [profilo, setProfilo] = useState(null);
  const [classifica, setClassifica] = useState([]);
  const [posizione, setPosizione] = useState(0);
  const [classificaRecord, setClassificaRecord] = useState([]);
  const [tab, setTab] = useState('badge');
  const [caricamento, setCaricamento] = useState(true);

  // Profilo pubblico modale
  const [profiloPubblico, setProfiloPubblico] = useState(null);
  const [caricandoProfilo, setCaricandoProfilo] = useState(false);

  // Reset
  const [mostraReset, setMostraReset] = useState(false);
  const [confermaReset, setConfermaReset] = useState('');
  const [avviandoReset, setAvviandoReset] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/gamification/profilo').then(r => setProfilo(r.dati)),
      api.get('/gamification/leaderboard').then(r => { setClassifica(r.dati.classifica); setPosizione(r.dati.posizioneUtente); }),
      api.get('/gamification/classifica-record').then(r => setClassificaRecord(r.dati || [])).catch(() => {})
    ]).finally(() => setCaricamento(false));
  }, []);

  const eseguiReset = async () => {
    if (confermaReset !== 'AZZERA') return;
    try {
      setAvviandoReset(true);
      await api.post('/utenti/reset-gamification');
      alert('Progressi azzerati con successo!');
      window.location.reload();
    } catch (err) { alert(err.message); }
    finally { setAvviandoReset(false); setMostraReset(false); setConfermaReset(''); }
  };

  const apriProfilo = async (userId) => {
    if (userId === utente?.id) return;
    try {
      setCaricandoProfilo(true);
      const r = await api.get(`/gamification/profilo-pubblico/${userId}`);
      setProfiloPubblico(r.dati);
    } catch { setProfiloPubblico({ errore: true }); }
    finally { setCaricandoProfilo(false); }
  };

  if (caricamento) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
    </div>
  );

  const progresso = profilo?.livello?.prossimo
    ? Math.round((profilo.xp / profilo.livello.prossimo) * 100)
    : 100;

  const TABS = [
    { id: 'badge', label: '🏅 Badge', cnt: `${profilo?.badgeSbloccati}/${profilo?.badgeTotali}` },
    { id: 'classifica', label: '🏆 Classifica', cnt: `#${posizione}` },
    { id: 'record', label: '🥇 Record', cnt: `${classificaRecord.length}` }
  ];

  return (
    <div className="py-2 max-w-3xl">
      {/* Hero Card - Livello */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  className="glass-card p-card-inner mb-6 text-center relative overflow-hidden">
        
        {/* Pulsante Reset in alto a destra */}
        <button 
          onClick={() => setMostraReset(true)}
          className="absolute top-4 right-4 text-[10px] uppercase font-bold px-2 py-1 rounded bg-[var(--pericolo-dim)] text-[var(--pericolo)] hover:bg-[var(--pericolo)] hover:text-white transition-colors z-10"
        >
          Azzera XP
        </button>

        <div className="absolute inset-0 opacity-10" style={{ background: 'linear-gradient(135deg, var(--accent), transparent)' }} />
        <div className="relative">
          <div className="text-5xl mb-2">⭐</div>
          <p className="text-xs text-[var(--testo-terziario)] uppercase tracking-widest mb-1">Livello {profilo?.livello?.livello}</p>
          <h1 className="text-2xl font-bold testo-gradient mb-1">{profilo?.livello?.nome}</h1>
          <p className="text-lg font-bold">{profilo?.xp} XP</p>

          {/* Barra progresso */}
          {profilo?.livello?.prossimo && (
            <div className="mt-4 max-w-xs mx-auto">
              <div className="flex justify-between text-[10px] text-[var(--testo-terziario)] mb-1">
                <span>Lvl {profilo.livello.livello}</span>
                <span>{profilo.xp} / {profilo.livello.prossimo} XP</span>
                <span>Lvl {profilo.livello.livello + 1}</span>
              </div>
              <div className="h-3 rounded-full bg-[var(--bg-terziario)] overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progresso}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))' }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mt-5">
            <div><p className="text-lg font-bold">{profilo?.badgeSbloccati}</p><p className="text-[10px] text-[var(--testo-terziario)]">Badge</p></div>
            <div><p className="text-lg font-bold">#{posizione || '—'}</p><p className="text-[10px] text-[var(--testo-terziario)]">Classifica</p></div>
            <div><p className="text-lg font-bold">{profilo?.stats?.streak || 0}🔥</p><p className="text-[10px] text-[var(--testo-terziario)]">Streak</p></div>
          </div>
        </div>
      </motion.div>

      {/* Tabs — più visibili */}
      <div className="flex gap-3 mb-8 mt-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-5 py-3 rounded-xl text-base font-semibold transition-all flex-1 text-center ${
                    tab === t.id
                      ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25'
                      : 'bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:bg-[var(--bordo)]'
                  }`}>
            {t.label} <span className="text-xs opacity-70 ml-1">{t.cnt}</span>
          </button>
        ))}
      </div>

      {/* Badge grid */}
      {tab === 'badge' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {profilo?.badge?.map((b, i) => (
            <motion.div key={b.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className={`glass-card p-4 text-center transition-all ${
                          b.sbloccato ? 'border-[var(--accent)] shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'opacity-40 grayscale'
                        }`}>
              <div className="text-3xl mb-2">{b.icona}</div>
              <p className="text-sm font-bold">{b.nome}</p>
              <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{b.desc}</p>
              <p className="text-xs font-semibold mt-2" style={{ color: b.sbloccato ? 'var(--successo)' : 'var(--testo-terziario)' }}>
                {b.sbloccato ? `✓ +${b.xp} XP` : `${b.xp} XP`}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Leaderboard XP */}
      {tab === 'classifica' && (
        <div className="flex flex-col gap-1">
          {classifica.map((u, i) => {
            const mio = u.id === utente?.id;
            const medaglia = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            return (
              <motion.div key={u.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => apriProfilo(u.id)}
                          className={`flex items-center gap-3 px-card-inner py-3 rounded-[var(--raggio-md)] transition-all ${
                            !mio ? 'cursor-pointer' : ''
                          } ${
                            mio ? 'bg-[var(--accent-dim)] border border-[var(--accent)]' : 'hover:bg-[var(--bg-terziario)]'
                          }`}>
                <span className="text-lg w-8 text-center font-bold shrink-0">{medaglia}</span>
                {u.immagineProfilo ? (
                  <img src={u.immagineProfilo} alt={u.nome}
                       className="w-9 h-9 rounded-full object-cover border-2 shrink-0"
                       style={{ borderColor: mio ? 'var(--accent)' : 'var(--bordo)' }} />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                       style={{ background: mio ? 'var(--accent)' : 'var(--accent-dim)', color: mio ? '#fff' : 'var(--accent)' }}>
                    {u.nome?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${mio ? 'text-[var(--accent)]' : ''}`}>
                    {u.nome} {mio ? '(tu)' : ''}
                  </p>
                  <p className="text-[10px] text-[var(--testo-terziario)]">
                    Lvl {u.livello.livello} · {u.livello.nome}
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0 testo-gradient">{u.puntiEsperienza} XP</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Classifica Record */}
      {tab === 'record' && (
        <div className="flex flex-col gap-4">
          {classificaRecord.length === 0 ? (
            <div className="glass-card p-card-inner text-center">
              <div className="text-4xl mb-3">🏋️</div>
              <p className="text-sm text-[var(--testo-terziario)]">Nessun record ancora registrato. Completa allenamenti per scalare la classifica!</p>
            </div>
          ) : classificaRecord.map((item, idx) => {
            const gruppo = GRUPPI_MUSCOLARI[item.esercizio?.gruppoMuscoloPrimario];
            return (
              <motion.div key={item.esercizio?.id || idx}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="glass-card overflow-hidden">
                {/* Header esercizio */}
                <div className="flex items-center gap-3 px-card-inner py-4 border-b border-[var(--bordo-light)]">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                       style={{ background: (gruppo?.colore || '#6366F1') + '22', color: gruppo?.colore || '#6366F1' }}>
                    {gruppo?.emoji || '💪'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{nomeEsercizio(item.esercizio)}</p>
                    <p className="text-[10px] text-[var(--testo-terziario)]">{item.esercizio?.gruppoMuscoloPrimario}</p>
                  </div>
                </div>
                {/* Top 3 */}
                <div className="px-card-inner py-3 flex flex-col gap-1">
                  {item.top.map((t, pos) => {
                    const isMio = t.utente.id === utente?.id;
                    const medal = pos === 0 ? '🥇' : pos === 1 ? '🥈' : '🥉';
                    return (
                      <div key={t.utente.id}
                           onClick={() => apriProfilo(t.utente.id)}
                           className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                             !isMio ? 'cursor-pointer hover:bg-[var(--bg-terziario)]' : ''
                           } ${isMio ? 'bg-[var(--accent-dim)]' : ''}`}>
                        <span className="text-base w-6 text-center">{medal}</span>
                        {t.utente.immagineProfilo ? (
                          <img src={t.utente.immagineProfilo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                               style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                            {t.utente.nome?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <span className={`text-sm flex-1 truncate ${isMio ? 'font-bold text-[var(--accent)]' : ''}`}>
                          {t.utente.nome} {isMio ? '(tu)' : ''}
                        </span>
                        <span className="text-sm font-bold text-[var(--successo)]">{formattaPeso(t.pesoMax)} kg</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modale Profilo Pubblico */}
      <AnimatePresence>
        {(profiloPubblico || caricandoProfilo) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
               onClick={() => { setProfiloPubblico(null); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        className="glass-card p-0 max-w-md w-full max-h-[85vh] overflow-y-auto no-scrollbar">
              
              {caricandoProfilo ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
                </div>
              ) : profiloPubblico?.errore ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-[var(--testo-terziario)]">Profilo non disponibile.</p>
                  <button onClick={() => setProfiloPubblico(null)} className="btn-secondario mt-4 text-sm">Chiudi</button>
                </div>
              ) : (
                <>
                  {/* Header profilo */}
                  <div className="relative px-card-inner py-6 text-center border-b border-[var(--bordo-light)]">
                    <button onClick={() => setProfiloPubblico(null)}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--bg-terziario)] flex items-center justify-center hover:bg-[var(--bordo)] transition-colors">
                      <X size={16} />
                    </button>
                    {profiloPubblico.immagineProfilo ? (
                      <img src={profiloPubblico.immagineProfilo} alt=""
                           className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3 border-2 border-[var(--accent)]" />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-3"
                           style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {profiloPubblico.nome?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <h2 className="text-xl font-bold">{profiloPubblico.nome}</h2>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className={`badge ${RUOLI[profiloPubblico.ruolo]?.colore || 'accent'}`}>
                        {RUOLI[profiloPubblico.ruolo]?.label || profiloPubblico.ruolo}
                      </span>
                      <span className="text-xs text-[var(--testo-terziario)]">
                        Lvl {profiloPubblico.livello?.livello} · {profiloPubblico.livello?.nome}
                      </span>
                    </div>
                    <p className="text-lg font-bold testo-gradient mt-2">{profiloPubblico.puntiEsperienza} XP</p>
                    {profiloPubblico.bio && (
                      <p className="text-xs text-[var(--testo-secondario)] mt-2 italic">"{profiloPubblico.bio}"</p>
                    )}
                  </div>

                  {/* Info condivise */}
                  <div className="px-card-inner py-5 flex flex-col gap-3">
                    {/* Dati personali */}
                    {(profiloPubblico.palestra || profiloPubblico.obiettivoFitness || profiloPubblico.pesoKg || profiloPubblico.altezzaCm || profiloPubblico.dataNascita) && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)] font-bold mb-2">Informazioni</p>
                        <div className="flex flex-col gap-1.5">
                          {profiloPubblico.palestra && (
                            <div className="flex items-center gap-2 text-sm">
                              <Building size={14} className="text-[var(--testo-terziario)]" />
                              <span>{profiloPubblico.palestra.nomeCatena} — {profiloPubblico.palestra.citta}</span>
                            </div>
                          )}
                          {profiloPubblico.obiettivoFitness && (
                            <div className="flex items-center gap-2 text-sm"><span>🎯</span> {profiloPubblico.obiettivoFitness}</div>
                          )}
                          {profiloPubblico.pesoKg && (
                            <div className="flex items-center gap-2 text-sm"><span>⚖️</span> {profiloPubblico.pesoKg} kg</div>
                          )}
                          {profiloPubblico.altezzaCm && (
                            <div className="flex items-center gap-2 text-sm"><span>📏</span> {profiloPubblico.altezzaCm} cm</div>
                          )}
                          {profiloPubblico.dataNascita && (
                            <div className="flex items-center gap-2 text-sm"><span>🎂</span> {formattaData(profiloPubblico.dataNascita)}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Statistiche */}
                    {profiloPubblico.statistiche && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)] font-bold mb-2">Statistiche</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-[var(--bg-terziario)] rounded-lg p-3 text-center">
                            <p className="text-lg font-bold">{profiloPubblico.statistiche.sessioni}</p>
                            <p className="text-[10px] text-[var(--testo-terziario)]">Sessioni</p>
                          </div>
                          <div className="bg-[var(--bg-terziario)] rounded-lg p-3 text-center">
                            <p className="text-lg font-bold">{formattaNumero(profiloPubblico.statistiche.volume)}</p>
                            <p className="text-[10px] text-[var(--testo-terziario)]">Volume kg</p>
                          </div>
                          <div className="bg-[var(--bg-terziario)] rounded-lg p-3 text-center">
                            <p className="text-lg font-bold">{formattaDurata(profiloPubblico.statistiche.durata)}</p>
                            <p className="text-[10px] text-[var(--testo-terziario)]">Tempo</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Schede globali */}
                    {profiloPubblico.schedeGlobali?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)] font-bold mb-2">
                          Schede pubbliche ({profiloPubblico.schedeGlobali.length})
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {profiloPubblico.schedeGlobali.map(s => (
                            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-terziario)]">
                              <span>📋</span>
                              <span className="text-sm font-medium flex-1 truncate">{s.titolo}</span>
                              <span className="text-[10px] text-[var(--testo-terziario)]">{s._count?.esercizi || 0} es.</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Record */}
                    {profiloPubblico.record?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--testo-terziario)] font-bold mb-2">
                          Record personali ({profiloPubblico.record.length})
                        </p>
                        <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto no-scrollbar">
                          {profiloPubblico.record.map(r => (
                            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-terziario)]">
                              <span>{GRUPPI_MUSCOLARI[r.esercizio?.gruppoMuscoloPrimario]?.emoji || '💪'}</span>
                              <span className="text-sm flex-1 truncate">{nomeEsercizio(r.esercizio)}</span>
                              <span className="text-sm font-bold text-[var(--successo)]">{formattaPeso(r.pesoMaxRaggiunto)} kg</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Nessuna info condivisa */}
                    {!profiloPubblico.palestra && !profiloPubblico.obiettivoFitness && !profiloPubblico.statistiche &&
                     !profiloPubblico.schedeGlobali?.length && !profiloPubblico.record?.length &&
                     !profiloPubblico.pesoKg && !profiloPubblico.altezzaCm && !profiloPubblico.dataNascita && (
                      <p className="text-sm text-[var(--testo-terziario)] text-center py-4">
                        Questo utente ha reso privato il suo profilo.
                      </p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modale Reset */}
      {mostraReset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card p-6 max-w-sm w-full border border-[var(--pericolo)] text-center">
            <h2 className="text-2xl font-bold text-[var(--pericolo)] mb-2">Azzerare i progressi?</h2>
            <p className="text-sm text-[var(--testo-secondario)] mb-4">
              Perderai tutti i tuoi badge e il tuo livello, ricominciando da zero. Digita <strong>AZZERA</strong> per confermare.
            </p>
            <input 
              type="text" 
              value={confermaReset} 
              onChange={e => setConfermaReset(e.target.value)}
              placeholder="AZZERA"
              className="w-full bg-[var(--bg-terziario)] border border-[var(--bordo)] rounded-lg p-2 mb-4 text-center text-[var(--pericolo)] font-bold focus:border-[var(--pericolo)] outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setMostraReset(false); setConfermaReset(''); }} className="flex-1 py-2 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] hover:bg-[var(--bordo)]">
                Annulla
              </button>
              <button 
                onClick={eseguiReset} 
                disabled={confermaReset !== 'AZZERA' || avviandoReset}
                className="flex-1 py-2 rounded-lg bg-[var(--pericolo)] text-white disabled:opacity-50"
              >
                {avviandoReset ? 'Reset...' : 'Conferma'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
