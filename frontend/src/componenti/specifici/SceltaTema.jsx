// ============================================
// GymMaster — Theme picker (Profile)
// ============================================
//
// Automatic (the system setting), light or dark. The choice applies at once,
// is kept on this phone (utils/tema.js) and is saved on the account, so the
// app opens with it on every device after signing in (like the language).

import { useState, useSyncExternalStore } from 'react';
import { SunMoon } from 'lucide-react';
import { useAuth } from '../../contesti/AuthContesto.jsx';
import { useLingua } from '../../hooks/useLingua.js';
import { api } from '../../config/api.js';
import { TEMI, iscriviTema, temaScelto, scegliTema } from '../../utils/tema.js';

export default function SceltaTema() {
  const { t } = useLingua();
  const { aggiornaUtente } = useAuth();
  const scelta = useSyncExternalStore(iscriviTema, temaScelto);
  const [esito, setEsito] = useState(null);

  const cambia = async (valore) => {
    setEsito(null);
    scegliTema(valore);
    try {
      const risposta = await api.patch('/utenti/profilo', { tema: valore === 'auto' ? null : valore });
      aggiornaUtente({ tema: risposta.dati.tema });
      setEsito({ ok: true, testo: t('tema.salvato') });
    } catch (err) {
      setEsito({ ok: false, testo: err?.message || t('comune.errore') });
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-card-inner border-b border-[var(--bordo-light)]">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <SunMoon size={20} className="text-[var(--accent)]" aria-hidden="true" /> {t('tema.titolo')}
        </h3>
      </div>
      <div className="p-card-inner">
        <p className="text-sm text-[var(--testo-secondario)] mb-3">{t('tema.descrizione')}</p>
        <select value={scelta} onChange={e => cambia(e.target.value)} className="campo-input" aria-label={t('tema.titolo')}>
          {TEMI.map(v => <option key={v} value={v}>{t(`tema.${v}`)}</option>)}
        </select>
        {esito && (
          <p role="status" className={`text-sm mt-2 ${esito.ok ? 'text-[var(--testo-secondario)]' : 'text-[var(--pericolo)]'}`}>{esito.testo}</p>
        )}
      </div>
    </div>
  );
}
