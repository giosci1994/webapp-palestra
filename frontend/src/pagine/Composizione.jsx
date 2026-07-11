// ============================================
// GymMaster — Pagina Composizione corporea (utente)
// ============================================

import { useAuth } from '../contesti/AuthContesto.jsx';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ComposizioneCorporea from '../componenti/specifici/ComposizioneCorporea.jsx';

export default function Composizione() {
  const { utente } = useAuth();
  const naviga = useNavigate();

  return (
    <div className="py-2 pb-12 max-w-2xl mx-auto">
      <button onClick={() => naviga(-1)} className="flex items-center gap-2 text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors mb-4">
        <ArrowLeft size={18} /> Indietro
      </button>
      <h1 className="text-2xl font-extrabold mb-1">Composizione corporea</h1>
      <p className="text-sm text-[var(--testo-secondario)] mb-5">Traccia peso, massa grassa/muscolare e i dati della bilancia nel tempo. Anche il tuo Personal Trainer può aggiungere le misurazioni.</p>
      <ComposizioneCorporea altezzaCm={utente?.altezzaCm} />
    </div>
  );
}
