// ============================================
// GymMaster — Legal footer
// Links to Privacy, Cookies and ToS for public pages
// ============================================

import { Link } from 'react-router-dom';
import { useLingua } from '../../hooks/useLingua.js';

export default function FooterLegale() {
  const { t } = useLingua();

  return (
    <footer className="text-center py-4 text-[10px] text-[var(--testo-terziario)] flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>© {new Date().getFullYear()} GymMaster — Giovanni</span>
      <span className="hidden sm:inline">·</span>
      <Link to="/privacy" className="hover:text-[var(--testo-secondario)] transition-colors">{t('footerLegale.privacy')}</Link>
      <span>·</span>
      <Link to="/cookie-policy" className="hover:text-[var(--testo-secondario)] transition-colors">{t('footerLegale.cookie')}</Link>
      <span>·</span>
      <Link to="/termini" className="hover:text-[var(--testo-secondario)] transition-colors">{t('footerLegale.termini')}</Link>
    </footer>
  );
}
