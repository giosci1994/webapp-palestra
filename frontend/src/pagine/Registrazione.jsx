// ============================================
// GymMaster — Pagina Registrazione
// ============================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { motion } from 'framer-motion';
import FooterLegale from '../componenti/comuni/FooterLegale.jsx';

export default function Registrazione() {
  const [form, setForm] = useState({ nome: '', email: '', password: '', palestraId: '' });
  const [consenso, setConsenso] = useState(false);
  const [palestre, setPalestre] = useState([]);
  const [caricamento, setCaricamento] = useState(false);
  const [erroreLocale, setErroreLocale] = useState('');
  const [successo, setSuccesso] = useState(false);
  const [modoVerifica, setModoVerifica] = useState(false);
  const [reinviato, setReinviato] = useState(false);
  const { registrazione, login } = useAuth();
  const naviga = useNavigate();

  // Carica lista palestre per il select
  useEffect(() => {
    api.get('/palestre').then(r => setPalestre(r.dati || [])).catch(() => {});
  }, []);

  const aggiornaCampo = (campo) => (e) => {
    setForm(prev => ({ ...prev, [campo]: e.target.value }));
  };

  const gestisciSubmit = async (e) => {
    e.preventDefault();
    setErroreLocale('');
    setCaricamento(true);

    try {
      const risp = await registrazione({
        ...form,
        palestraId: form.palestraId ? parseInt(form.palestraId) : null
      });
      // Se serve la verifica email, mostra la schermata "controlla la posta"
      if (risp?.dati?.richiedeVerificaEmail) {
        setModoVerifica(true);
        setSuccesso(true);
        return;
      }
      // Altrimenti account già attivo: auto-login immediato per evitare attrito
      try {
        const u = await login(form.email, form.password);
        naviga(u?.profiloCompletato === false ? '/onboarding' : '/dashboard', { replace: true });
        return;
      } catch {
        // Se l'auto-login non riesce, mostra conferma e invita ad accedere
        setSuccesso(true);
      }
    } catch (err) {
      setErroreLocale(err.message || 'Errore durante la registrazione');
    } finally {
      setCaricamento(false);
    }
  };

  if (successo) {
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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card w-full max-w-md p-card-inner text-center"
        >
          {modoVerifica ? (
            <>
              <div className="text-5xl mb-4">📧</div>
              <h2 className="text-2xl font-bold mb-2">Controlla la tua email</h2>
              <p className="text-[var(--testo-secondario)] mb-6">
                Ti abbiamo inviato un link di verifica a <b className="text-[var(--testo-primario)]">{form.email}</b>. Cliccalo per attivare l'account, poi accedi.
              </p>
              <Link to="/login" className="btn-primario inline-flex w-full justify-center mb-3">
                Vai al Login
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setReinviato(true); api.post('/auth/reinvia-verifica', { email: form.email }).catch(() => {});
                }}
                disabled={reinviato}
                className="text-sm text-[var(--accent)] hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {reinviato ? '✓ Email reinviata (controlla anche lo spam)' : 'Non l\'hai ricevuta? Reinvia'}
              </button>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-bold mb-2">Registrazione completata!</h2>
              <p className="text-[var(--testo-secondario)] mb-6">
                Il tuo account è pronto. Accedi e inizia ad allenarti!
              </p>
              <Link to="/login" className="btn-primario inline-flex">
                Vai al Login
              </Link>
            </>
          )}
        </motion.div>
      </div>
    );
  }

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
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏋️</div>
          <h1 className="text-3xl font-extrabold testo-gradient">Registrati</h1>
          <p className="text-[var(--testo-secondario)] mt-1 text-sm">
            Crea il tuo account GymMaster
          </p>
        </div>

        <form onSubmit={gestisciSubmit} className="flex flex-col gap-4">
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

          <div>
            <label htmlFor="nome" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Nome</label>
            <input id="nome" type="text" value={form.nome} onChange={aggiornaCampo('nome')}
                   className="campo-input" placeholder="Il tuo nome" required autoFocus />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Email</label>
            <input id="reg-email" type="email" value={form.email} onChange={aggiornaCampo('email')}
                   className="campo-input" placeholder="la-tua@email.com" required autoComplete="email" />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Password</label>
            <input id="reg-password" type="password" value={form.password} onChange={aggiornaCampo('password')}
                   className="campo-input" placeholder="Min. 8 caratteri, 1 maiuscola, 1 numero" required
                   minLength={8} autoComplete="new-password" />
          </div>

          <div>
            <label htmlFor="palestra" className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">
              Palestra <span className="text-[var(--testo-terziario)]">(opzionale)</span>
            </label>
            <select id="palestra" value={form.palestraId} onChange={aggiornaCampo('palestraId')}
                    className="campo-input">
              <option value="">Seleziona la tua palestra</option>
              {palestre.map(p => (
                <option key={p.id} value={p.id}>{p.nomeCatena} — {p.indirizzo}, {p.citta}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consenso} onChange={e => setConsenso(e.target.checked)}
              className="accent-[var(--accent)] w-4 h-4 mt-0.5" required />
            <span className="text-xs text-[var(--testo-secondario)]">
              Ho letto e accetto i <Link to="/termini" target="_blank" className="text-[var(--accent)] hover:underline">Termini e Condizioni</Link> e l'<Link to="/privacy" target="_blank" className="text-[var(--accent)] hover:underline">Informativa sulla Privacy</Link> *
            </span>
          </label>

          <button type="submit" disabled={caricamento || !consenso}
                  className="btn-primario w-full justify-center mt-2 disabled:opacity-50"
                  style={{ padding: '14px 24px', fontSize: '1rem' }}>
            {caricamento ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full anima-ruota" />
                Registrazione...
              </>
            ) : 'Registrati'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-[var(--testo-secondario)]">
          Hai già un account?{' '}
          <Link to="/login" className="font-semibold">Accedi</Link>
        </p>

        <FooterLegale />
      </motion.div>
    </div>
  );
}
