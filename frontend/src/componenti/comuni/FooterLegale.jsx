// ============================================
// GymMaster — Footer Legale
// Link a Privacy, Cookie e ToS per pagine pubbliche
// ============================================

import { Link } from 'react-router-dom';

export default function FooterLegale() {
  return (
    <footer className="text-center py-4 text-[10px] text-[var(--testo-terziario)] flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>© {new Date().getFullYear()} GymMaster — Giovanni</span>
      <span className="hidden sm:inline">·</span>
      <Link to="/privacy" className="hover:text-[var(--testo-secondario)] transition-colors">Privacy Policy</Link>
      <span>·</span>
      <Link to="/cookie-policy" className="hover:text-[var(--testo-secondario)] transition-colors">Cookie Policy</Link>
      <span>·</span>
      <Link to="/termini" className="hover:text-[var(--testo-secondario)] transition-colors">Termini e Condizioni</Link>
    </footer>
  );
}
