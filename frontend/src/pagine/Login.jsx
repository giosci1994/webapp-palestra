// ============================================
// GymMaster — Login page
// ============================================

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import FooterLegale from '../componenti/comuni/FooterLegale.jsx';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';

export default function Login() {
  const { t } = useLingua();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [erroreLocale, setErroreLocale] = useState('');
  const [mostraReinvio, setMostraReinvio] = useState(false);
  const [reinviato, setReinviato] = useState(false);
  // "Ricorda dispositivo" (remember device) — state persisted in localStorage
  const [ricordaDispositivo, setRicordaDispositivo] = useState(
    () => localStorage.getItem('gymmaster_ricorda_dispositivo') === 'true'
  );
  const { login, loginConPasskey } = useAuth();
  const [passkeySupportate] = useState(() => browserSupportsWebAuthn());
  const naviga = useNavigate();

  const gestisciRicorda = (e) => {
    const valore = e.target.checked;
    setRicordaDispositivo(valore);
    localStorage.setItem('gymmaster_ricorda_dispositivo', valore ? 'true' : 'false');
  };

  /** After signing in: onboarding if the profile still has to be completed, otherwise the dashboard */
  const vaiDopoAccesso = (utenteLoggato) => {
    naviga(utenteLoggato?.profiloCompletato === false ? '/onboarding' : '/dashboard', { replace: true });
  };

  const entraConPasskey = async () => {
    setErroreLocale('');
    setCaricamento(true);
    try {
      vaiDopoAccesso(await loginConPasskey(ricordaDispositivo));
    } catch (err) {
      // Cancelled on the device: no error to show
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        setErroreLocale(err.message || t('login.erroreAccessoPasskey'));
      }
    } finally {
      setCaricamento(false);
    }
  };

  const gestisciSubmit = async (e) => {
    e.preventDefault();
    setErroreLocale('');
    setCaricamento(true);

    try {
      vaiDopoAccesso(await login(email, password, ricordaDispositivo));
    } catch (err) {
      setErroreLocale(err.message || t('login.erroreLogin'));
      if ((err.message || '').includes('Verifica la tua email')) setMostraReinvio(true);
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ 
           background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
           paddingTop: 'calc(16px + var(--safe-top))',
           paddingBottom: 'calc(16px + var(--safe-bottom))',
           paddingLeft: 'calc(16px + var(--safe-left))',
           paddingRight: 'calc(16px + var(--safe-right))'
         }}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card w-full max-w-md p-card-inner"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏋️</div>
          <h1 className="text-3xl font-extrabold testo-gradient">GymMaster</h1>
          <p className="text-[var(--testo-secondario)] mt-1 text-sm">
            {t('login.sottotitolo')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={gestisciSubmit} className="flex flex-col gap-5">
          {erroreLocale && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-[var(--raggio-md)] text-sm"
              style={{ background: 'var(--pericolo-dim)', color: 'var(--pericolo)' }}
            >
              {erroreLocale}
            </motion.div>
          )}

          {mostraReinvio && (
            <button
              type="button"
              onClick={() => { setReinviato(true); api.post('/auth/reinvia-verifica', { email }).catch(() => {}); }}
              disabled={reinviato}
              className="text-sm text-[var(--accent)] hover:underline self-start -mt-2 disabled:opacity-60 disabled:no-underline"
            >
              {reinviato ? t('login.verificaReinviata') : t('login.reinviaVerifica')}
            </button>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo-input"
              placeholder={t('login.emailPlaceholder')}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo-input"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="-mt-2 text-right">
            <Link to="/password-dimenticata" className="text-xs text-[var(--accent)] hover:underline">{t('login.passwordDimenticata')}</Link>
          </div>

          {/* Checkbox — Ricorda questo dispositivo */}
          <label htmlFor="ricorda-dispositivo" className="flex items-center gap-3 cursor-pointer select-none group py-1">
            <div className="relative">
              <input
                id="ricorda-dispositivo"
                type="checkbox"
                checked={ricordaDispositivo}
                onChange={gestisciRicorda}
                className="sr-only peer"
              />
              <div className="w-10 h-[22px] rounded-full transition-colors duration-200
                              bg-[var(--bg-terziario)] peer-checked:bg-[var(--accent)]
                              border border-[var(--bordo)] peer-checked:border-[var(--accent)]" />
              <div className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full transition-transform duration-200
                              bg-[var(--testo-terziario)] peer-checked:bg-white
                              peer-checked:translate-x-[18px] shadow-sm" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--testo-primario)] group-hover:text-[var(--accent)] transition-colors">
                {t('login.ricordaDispositivo')}
              </span>
              <span className="text-[10px] text-[var(--testo-terziario)] leading-tight mt-0.5">
                {t('login.ricordaDispositivoDettaglio')}
              </span>
            </div>
          </label>

          <button
            type="submit"
            disabled={caricamento}
            className="btn-primario w-full justify-center mt-2"
            style={{ padding: '14px 24px', fontSize: '1rem' }}
          >
            {caricamento ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full anima-ruota" />
                {t('login.accessoInCorso')}
              </>
            ) : (
              t('login.accedi')
            )}
          </button>

          {passkeySupportate && (
            <button
              type="button"
              onClick={entraConPasskey}
              disabled={caricamento}
              className="btn-secondario w-full justify-center"
              style={{ padding: '14px 24px', fontSize: '1rem' }}
            >
              {t('login.accediPasskey')}
            </button>
          )}
        </form>

        {/* Sign-up link */}
        <p className="text-center mt-6 text-sm text-[var(--testo-secondario)]">
          <Testo t="login.nessunAccount" componenti={{ registrati: <Link to="/registrazione" className="font-semibold" /> }} />
        </p>

        <FooterLegale />
      </motion.div>
    </div>
  );
}
