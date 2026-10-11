// ============================================
// GymMaster — Forgot password (reset request)
// ============================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';

const SFONDO = {
  background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
  paddingTop: 'calc(16px + var(--safe-top))',
  paddingBottom: 'calc(16px + var(--safe-bottom))',
  paddingLeft: 'calc(16px + var(--safe-left))',
  paddingRight: 'calc(16px + var(--safe-right))'
};

export default function PasswordDimenticata() {
  const { t } = useLingua();
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setCaricamento(true);
    try { await api.post('/auth/richiedi-reset', { email }); } catch { /* generic response */ }
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
            <h2 className="text-2xl font-bold mb-2">{t('passwordDimenticata.controllaEmail')}</h2>
            <p className="text-[var(--testo-secondario)] mb-6">
              <Testo t="passwordDimenticata.linkInviato" valori={{ email }}
                     componenti={{ b: <b className="text-[var(--testo-primario)]" /> }} />
            </p>
            <Link to="/login" className="btn-primario inline-flex w-full justify-center">{t('passwordDimenticata.tornaAlLogin')}</Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">🔑</div>
              <h1 className="text-3xl font-extrabold testo-gradient">{t('passwordDimenticata.titolo')}</h1>
              <p className="text-[var(--testo-secondario)] mt-1 text-sm">{t('passwordDimenticata.sottotitolo')}</p>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     className="campo-input" placeholder={t('passwordDimenticata.emailPlaceholder')} required autoFocus autoComplete="email" />
              <button type="submit" disabled={caricamento}
                      className="btn-primario w-full justify-center disabled:opacity-50" style={{ padding: '14px 24px', fontSize: '1rem' }}>
                {caricamento ? t('passwordDimenticata.invioInCorso') : t('passwordDimenticata.inviaLink')}
              </button>
            </form>
            <p className="text-center mt-6 text-sm text-[var(--testo-secondario)]">
              <Link to="/login" className="font-semibold">{t('passwordDimenticata.tornaAlLoginFreccia')}</Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
