// ============================================
// GymMaster — Reimposta password (landing del link email)
// ============================================

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';

const SFONDO = {
  background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
  paddingTop: 'calc(16px + var(--safe-top))',
  paddingBottom: 'calc(16px + var(--safe-bottom))',
  paddingLeft: 'calc(16px + var(--safe-left))',
  paddingRight: 'calc(16px + var(--safe-right))'
};

export default function ReimpostaPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrore('');
    if (password !== conferma) { setErrore('Le password non coincidono'); return; }
    setCaricamento(true);
    try {
      await api.post('/auth/reimposta-password', { token, password });
      setFatto(true);
    } catch (err) {
      setErrore(err.message || 'Impossibile reimpostare la password');
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={SFONDO}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }} className="glass-card w-full max-w-md p-card-inner">
        {!token ? (
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2">Link non valido</h2>
            <p className="text-[var(--testo-secondario)] mb-6">Manca il token di reset. Richiedi un nuovo link.</p>
            <Link to="/password-dimenticata" className="btn-primario inline-flex w-full justify-center">Richiedi nuovo link</Link>
          </div>
        ) : fatto ? (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2">Password aggiornata!</h2>
            <p className="text-[var(--testo-secondario)] mb-6">Ora puoi accedere con la nuova password.</p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">Vai al Login</Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">🔑</div>
              <h1 className="text-3xl font-extrabold testo-gradient">Nuova password</h1>
              <p className="text-[var(--testo-secondario)] mt-1 text-sm">Scegli una nuova password per il tuo account.</p>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              {errore && (
                <div className="p-3 rounded-[var(--raggio-md)] text-sm" style={{ background: 'var(--pericolo-dim)', color: 'var(--pericolo)' }}>{errore}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Nuova password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                       className="campo-input" placeholder="Min. 8 caratteri, 1 maiuscola, 1 numero" required minLength={8} autoComplete="new-password" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Conferma password</label>
                <input type="password" value={conferma} onChange={e => setConferma(e.target.value)}
                       className="campo-input" placeholder="Ripeti la password" required autoComplete="new-password" />
              </div>
              <button type="submit" disabled={caricamento}
                      className="btn-primario w-full justify-center disabled:opacity-50" style={{ padding: '14px 24px', fontSize: '1rem' }}>
                {caricamento ? 'Salvataggio…' : 'Reimposta password'}
              </button>
            </form>
            <p className="text-center mt-6 text-sm text-[var(--testo-secondario)]">
              <Link to="/login" className="font-semibold">← Torna al Login</Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
