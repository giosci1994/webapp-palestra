// ============================================
// GymMaster — Email Verification
// Landing page of the link sent by email: confirms the address with a token.
// ============================================

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';
import { useLingua } from '../hooks/useLingua.js';

export default function VerificaEmail() {
  const { t } = useLingua();
  const [params] = useSearchParams();
  const token = params.get('token');
  // Without a token in the link there is nothing to verify: error right away
  const [stato, setStato] = useState(token ? 'verifica' : 'errore'); // 'verifica' | 'ok' | 'errore'
  // Message from the server, if any; the fallback texts are chosen when rendering so they follow the language
  const [messaggio, setMessaggio] = useState('');

  useEffect(() => {
    if (!token) return;
    api.get(`/auth/verifica-email?token=${encodeURIComponent(token)}`)
      .then(r => { setStato('ok'); setMessaggio(r.messaggio || ''); })
      .catch(err => { setStato('errore'); setMessaggio(err.message || ''); });
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
            <p className="text-[var(--testo-secondario)]">{t('verificaEmail.inCorso')}</p>
          </>
        )}
        {stato === 'ok' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2">{t('verificaEmail.emailVerificata')}</h2>
            <p className="text-[var(--testo-secondario)] mb-6">{t('verificaEmail.accountAttivo')}</p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">{t('verificaEmail.vaiAlLogin')}</Link>
          </>
        )}
        {stato === 'errore' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2">{t('verificaEmail.titoloErrore')}</h2>
            <p className="text-[var(--testo-secondario)] mb-6">{messaggio || (token ? t('verificaEmail.verificaNonRiuscita') : t('verificaEmail.linkNonValido'))}</p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">{t('verificaEmail.tornaAlLogin')}</Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
