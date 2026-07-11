// ============================================
// GymMaster — Cookie Banner (GDPR)
// ============================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';

export default function CookieBanner() {
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    const consenso = localStorage.getItem('cookieConsent');
    if (!consenso) {
      // Mostra dopo un breve ritardo per non sovrapporre al caricamento
      const timer = setTimeout(() => setVisibile(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accettaTutti = () => {
    localStorage.setItem('cookieConsent', JSON.stringify({ necessari: true, analytics: true, data: new Date().toISOString() }));
    setVisibile(false);
  };

  const soloNecessari = () => {
    localStorage.setItem('cookieConsent', JSON.stringify({ necessari: true, analytics: false, data: new Date().toISOString() }));
    setVisibile(false);
  };

  return (
    <AnimatePresence>
      {visibile && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[200] p-4 md:p-6"
        >
          <div className="max-w-2xl mx-auto glass-card rounded-2xl p-5 shadow-2xl border border-[var(--bordo)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center shrink-0">
                <Cookie size={20} className="text-[var(--accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm mb-1 flex items-center gap-2">Informativa Cookie <Cookie size={16} className="text-[var(--testo-secondario)]" /></h3>
                <p className="text-xs text-[var(--testo-secondario)] leading-relaxed">
                  Utilizziamo solo cookie tecnici essenziali per il funzionamento dell'app (autenticazione e preferenze).
                  Nessun cookie di profilazione o tracciamento.{' '}
                  <Link to="/cookie-policy" className="text-[var(--accent)] hover:underline">Leggi la Cookie Policy</Link>
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={accettaTutti}
                    className="btn-primario text-xs !py-2 !px-4">
                    Accetta tutti
                  </button>
                  <button onClick={soloNecessari}
                    className="text-xs py-2 px-4 rounded-xl border border-[var(--bordo)] text-[var(--testo-secondario)] hover:bg-[var(--bg-terziario)] transition-colors">
                    Solo necessari
                  </button>
                </div>
              </div>
              <button onClick={soloNecessari} className="text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
