// ============================================
// GymMaster — Pagine Placeholder
// Per le rotte non ancora implementate
// ============================================

import { motion } from 'framer-motion';

function PaginaPlaceholder({ titolo, icona, descrizione }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-2"
    >
      <h1 className="text-2xl font-bold mb-6">{titolo}</h1>
      <div className="glass-card p-8 text-center">
        <div className="text-5xl mb-4">{icona}</div>
        <h2 className="text-xl font-semibold mb-2">{titolo}</h2>
        <p className="text-[var(--testo-secondario)]">{descrizione}</p>
        <div className="badge accent mt-4">In arrivo</div>
      </div>
    </motion.div>
  );
}

export function AdminUtenti() {
  return <PaginaPlaceholder titolo="Gestione Utenti" icona="👥" descrizione="Approva, gestisci e modera gli utenti del sistema" />;
}

export function AdminPalestre() {
  return <PaginaPlaceholder titolo="Gestione Palestre" icona="🏢" descrizione="Gestisci le sedi e le attrezzature delle palestre" />;
}

export function AdminEsercizi() {
  return <PaginaPlaceholder titolo="Gestione Esercizi" icona="📚" descrizione="Aggiungi e modifica la libreria di esercizi" />;
}
