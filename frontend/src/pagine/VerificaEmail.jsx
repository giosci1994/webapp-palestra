// ============================================
// GymMaster — Email Verification
// Landing page of the link sent by email: confirms the address with a token.
// ============================================

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';

export default function VerificaEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  // Without a token in the link there is nothing to verify: error right away
  const [stato, setStato] = useState(token ? 'verifica' : 'errore'); // 'verifica' | 'ok' | 'errore'
  const [messaggio, setMessaggio] = useState(token ? '' : 'Link di verifica non valido.');

  useEffect(() => {
    if (!token) return;
    api.get(`/auth/verifica-email?token=${encodeURIComponent(token)}`)
      .then(r => { setStato('ok'); setMessaggio(r.messaggio || 'Email verificata!'); })
      .catch(err => { setStato('errore'); setMessaggio(err.message || 'Verifica non riuscita.'); });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{
           background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
           paddingTop: 'calc(16px + var(--safe-top))',
           paddingBottom: 'calc(16px + var(--safe-bottom))',
           paddingLeft: 'calc(16px + var(--safe-left))',
           paddingRight: 'calc(16px + var(--safe-right))'
         }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="glass-card w-full max-w-md p-card-inner text-center">
        {stato === 'verifica' && (
          <>
            <div className="w-12 h-12 border-4 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota mx-auto mb-4" />
            <p className="text-[var(--testo-secondario)]">Verifica in corso…</p>
          </>
        )}
        {stato === 'ok' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2">Email verificata!</h2>
            <p className="text-[var(--testo-secondario)] mb-6">Il tuo account è attivo. Ora puoi accedere e iniziare ad allenarti.</p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">Vai al Login</Link>
          </>
        )}
        {stato === 'errore' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2">Verifica non riuscita</h2>
            <p className="text-[var(--testo-secondario)] mb-6">{messaggio}</p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">Torna al Login</Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
