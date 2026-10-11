// ============================================
// GymMaster — Body composition page (user)
// ============================================

import { useAuth } from '../contesti/AuthContesto.jsx';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLingua } from '../hooks/useLingua.js';
import ComposizioneCorporea from '../componenti/specifici/ComposizioneCorporea.jsx';

export default function Composizione() {
  const { t } = useLingua();
  const { utente } = useAuth();
  const naviga = useNavigate();

  return (
    <div className="py-2 pb-12 max-w-2xl mx-auto">
      <button onClick={() => naviga(-1)} className="flex items-center gap-2 text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors mb-4">
        <ArrowLeft size={18} /> {t('comune.indietro')}
      </button>
      <h1 className="text-2xl font-extrabold mb-1">{t('composizione.titolo')}</h1>
      <p className="text-sm text-[var(--testo-secondario)] mb-5">{t('composizione.descrizione')}</p>
      <ComposizioneCorporea altezzaCm={utente?.altezzaCm} />
    </div>
  );
}
