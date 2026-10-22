// ============================================
// GymMaster — Workouts to check (admin)
// Workouts that skew the statistics: left open, overlapping another one,
// closed by the server, too long or without sets. The admin corrects, closes,
// merges or deletes them, or marks them as checked; the owner is told.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { useLingua } from '../hooks/useLingua.js';
import { formattaData, formattaDurata, titoloAllenamento } from '../utils/formattatori.js';
import ModificaAllenamento from '../componenti/specifici/ModificaAllenamento.jsx';

// Translation keys of the reasons a workout is in the list
const MOTIVI = {
  APERTO: 'adminAllenamenti.motivi.aperto',
  SOVRAPPOSTO: 'adminAllenamenti.motivi.sovrapposto',
  CHIUSO_IN_AUTOMATICO: 'adminAllenamenti.motivi.chiusoInAutomatico',
  DURATA_SOSPETTA: 'adminAllenamenti.motivi.durataSospetta',
  SENZA_SERIE: 'adminAllenamenti.motivi.senzaSerie'
};

export default function AdminAllenamenti() {
  const { t } = useLingua();
  const [voci, setVoci] = useState(null);
  const [selezionate, setSelezionate] = useState([]);
  const [inModifica, setInModifica] = useState(null);
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(() => {
    api.get('/admin/allenamenti')
      .then(r => {
        setVoci(r.dati);
        // The selection keeps only what is still in the list
        setSelezionate(prima => prima.filter(id => r.dati.some(v => v.id === id)));
      })
      .catch(err => alert(err.message));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  /** Runs an action on the server, then reloads the list */
  const esegui = async (azione) => {
    try {
      setOccupato(true);
      await azione();
      carica();
    } catch (err) {
      alert(err.message);
    } finally {
      setOccupato(false);
    }
  };

  const scelte = (voci ?? []).filter(v => selezionate.includes(v.id));
  const stessoUtente = new Set(scelte.map(v => v.utente.id)).size === 1;
  const seleziona = (id) => setSelezionate(prima => (prima.includes(id) ? prima.filter(x => x !== id) : [...prima, id]));

  const unisci = () => {
    if (!window.confirm(t('adminAllenamenti.confermaUnisci', { count: scelte.length }))) return;
    esegui(async () => {
      await api.post('/admin/allenamenti/unisci', { ids: selezionate });
      setSelezionate([]);
    });
  };
  const elimina = (voce) => {
    if (!window.confirm(t('adminAllenamenti.confermaElimina'))) return;
    esegui(() => api.delete(`/sessioni/${voce.id}`));
  };

  return (
    <div className="py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('adminAllenamenti.titolo')}</h1>
        <p className="text-sm text-[var(--testo-secondario)] mt-1">{t('adminAllenamenti.sottotitolo')}</p>
      </div>

      {selezionate.length > 0 && (
        <div className="glass-card sticky top-2 z-10 mb-4 px-4 py-3 flex items-center gap-3 flex-wrap border border-[var(--accent)]">
          <p className="text-sm flex-1 min-w-0">
            {stessoUtente ? t('adminAllenamenti.selezionati', { count: selezionate.length }) : t('adminAllenamenti.utentiDiversi')}
          </p>
          <button type="button" onClick={() => setSelezionate([])} className="btn-secondario !py-2 text-sm">{t('comune.annulla')}</button>
          <button type="button" onClick={unisci} disabled={occupato || selezionate.length < 2 || !stessoUtente} className="btn-primario !py-2 text-sm disabled:opacity-50">
            {t('adminAllenamenti.unisci')}
          </button>
        </div>
      )}

      {voci === null ? (
        <p className="text-[var(--testo-secondario)]">{t('adminAllenamenti.caricamento')}</p>
      ) : voci.length === 0 ? (
        <div className="glass-card p-8 text-center text-[var(--testo-secondario)]">{t('adminAllenamenti.nessuno')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {voci.map(voce => (
            <div key={voce.id} className={`glass-card p-4 ${selezionate.includes(voce.id) ? 'border border-[var(--accent)]' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selezionate.includes(voce.id)}
                  onChange={() => seleziona(voce.id)}
                  aria-label={t('adminAllenamenti.seleziona')}
                  className="mt-1.5 w-4 h-4 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--testo-secondario)]">{voce.utente.nome} · {formattaData(voce.dataInizio, true)}</p>
                  <p className="font-semibold truncate">{titoloAllenamento(voce)}</p>
                  <p className="text-xs text-[var(--testo-secondario)]">
                    {voce.dataFine ? formattaDurata(voce.durataMinuti) : t('adminAllenamenti.inCorso')}
                    {' · '}
                    {t('comune.serie', { count: voce.serieCompletate })}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {voce.motivi.map(m => (
                      <span key={m} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">{t(MOTIVI[m])}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {voce.dataFine ? (
                  <>
                    <button type="button" onClick={() => setInModifica(voce)} className="btn-secondario !py-1.5 !px-3 text-sm">{t('adminAllenamenti.correggi')}</button>
                    <button type="button" disabled={occupato} onClick={() => esegui(() => api.patch(`/admin/allenamenti/${voce.id}/controllato`))} className="btn-secondario !py-1.5 !px-3 text-sm disabled:opacity-50">
                      {t('adminAllenamenti.controllato')}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={occupato} onClick={() => esegui(() => api.patch(`/sessioni/${voce.id}/completa`, {}))} className="btn-secondario !py-1.5 !px-3 text-sm disabled:opacity-50">
                    {t('adminAllenamenti.chiudi')}
                  </button>
                )}
                <button type="button" disabled={occupato} onClick={() => elimina(voce)} className="btn-secondario !py-1.5 !px-3 text-sm text-[var(--pericolo)] disabled:opacity-50">
                  {t('adminAllenamenti.elimina')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inModifica && (
        <ModificaAllenamento
          sessione={inModifica}
          onChiudi={() => setInModifica(null)}
          onSalvato={() => { setInModifica(null); carica(); }}
        />
      )}
    </div>
  );
}
