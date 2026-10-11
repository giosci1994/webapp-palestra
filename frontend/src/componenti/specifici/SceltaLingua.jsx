// ============================================
// GymMaster — Language picker (Profile)
// ============================================
//
// Automatic (the phone's language), or one of the app's languages. The
// choice applies at once, is kept on this phone and is saved on the account,
// so the app opens in it on every device after signing in.

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { useAuth } from '../../contesti/AuthContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';
import { api } from '../../config/api.js';
import { LINGUE, NOMI_LINGUE, linguaScelta, scegli } from '../../i18n/index.js';

export default function SceltaLingua() {
  const { t } = useLingua();
  const { utente, aggiornaUtente } = useAuth();
  // '' = automatic
  const [scelta, setScelta] = useState(() => (utente && 'lingua' in utente ? utente.lingua : linguaScelta()) ?? '');
  const [esito, setEsito] = useState(null);

  const cambia = async (valore) => {
    setScelta(valore);
    setEsito(null);
    scegli(valore || null);
    try {
      const risposta = await api.patch('/utenti/profilo', { lingua: valore || null });
      aggiornaUtente({ lingua: risposta.dati.lingua });
      setEsito({ ok: true, testo: t('lingua.salvata') });
    } catch (err) {
      setEsito({ ok: false, testo: err?.message || t('comune.errore') });
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-card-inner border-b border-[var(--bordo-light)]">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Languages size={20} className="text-[var(--accent)]" /> {t('lingua.titolo')}
        </h3>
      </div>
      <div className="p-card-inner">
        <p className="text-sm text-[var(--testo-secondario)] mb-3">{t('lingua.descrizione')}</p>
        <select value={scelta} onChange={e => cambia(e.target.value)} className="campo-input" aria-label={t('lingua.titolo')}>
          <option value="">{t('lingua.automatica')}</option>
          {LINGUE.map(l => <option key={l} value={l}>{NOMI_LINGUE[l]}</option>)}
        </select>
        {esito && (
          <p role="status" className={`text-sm mt-2 ${esito.ok ? 'text-[var(--testo-secondario)]' : 'text-[var(--pericolo)]'}`}>{esito.testo}</p>
        )}
      </div>
    </div>
  );
}
