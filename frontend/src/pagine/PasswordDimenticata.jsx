// ============================================
// GymMaster — Password dimenticata (richiesta reset)
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';

const SFONDO = {
  background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
  paddingTop: 'calc(16px + var(--safe-top))',
  paddingBottom: 'calc(16px + var(--safe-bottom))',
  paddingLeft: 'calc(16px + var(--safe-left))',
  paddingRight: 'calc(16px + var(--safe-right))'
};

export default function PasswordDimenticata() {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setCaricamento(true);
    try { await api.post('/auth/richiedi-reset', { email }); } catch { /* risposta generica */ }
    setInviato(true);
    setCaricamento(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={SFONDO}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }} className="glass-card w-full max-w-md p-card-inner">
        {inviato ? (
          <div className="text-center">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="text-2xl font-bold mb-2">Controlla la tua email</h2>
            <p className="text-[var(--testo-secondario)] mb-6">
              Se <b className="text-[var(--testo-primario)]">{email}</b> è registrata, ti abbiamo inviato un link per reimpostare la password (valido 1 ora). Controlla anche lo spam.
            </p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">Torna al Login</Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">🔑</div>
              <h1 className="text-3xl font-extrabold testo-gradient">Password dimenticata</h1>
              <p className="text-[var(--testo-secondario)] mt-1 text-sm">Inserisci la tua email: ti invieremo un link per reimpostarla.</p>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     className="campo-input" placeholder="la-tua@email.com" required autoFocus autoComplete="email" />
              <button type="submit" disabled={caricamento}
                      className="btn-primario w-full justify-center disabled:opacity-50" style={{ padding: '14px 24px', fontSize: '1rem' }}>
                {caricamento ? 'Invio…' : 'Invia link di reset'}
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
