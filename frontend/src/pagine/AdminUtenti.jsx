// ============================================
// GymMaster — Admin Users
// User management: approve, ban, change role
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api.js';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { useLingua } from '../hooks/useLingua.js';
import { RUOLI } from '../utils/costanti.js';
import { formattaData, formattaDataRelativa } from '../utils/formattatori.js';
import { motion } from 'framer-motion';

// label is a translation key: show it with t()
const STATI = {
  IN_ATTESA: { label: 'adminUtenti.stati.IN_ATTESA', colore: 'avviso', bg: 'var(--avviso-dim)' },
  ATTIVO: { label: 'adminUtenti.stati.ATTIVO', colore: 'successo', bg: 'var(--successo-dim)' },
  BANNATO: { label: 'adminUtenti.stati.BANNATO', colore: 'pericolo', bg: 'var(--pericolo-dim)' }
};

export default function AdminUtenti() {
  const { t } = useLingua();
  const { utente: utenteCorrente } = useAuth();
  const [utenti, setUtenti] = useState([]);
  const [filtroStato, setFiltroStato] = useState('');
  const [filtroRuolo, setFiltroRuolo] = useState('');
  // The filters of the list shown: changing them brings the spinner back, while
  // after an action on a user the list updates in place
  const filtri = `${filtroStato}|${filtroRuolo}`;
  const [caricatoPer, setCaricatoPer] = useState(null);
  const caricamento = caricatoPer !== filtri;

  const caricaUtenti = useCallback(() => {
    let url = '/utenti?limite=100';
    if (filtroStato) url += `&stato=${filtroStato}`;
    if (filtroRuolo) url += `&ruolo=${filtroRuolo}`;
    return api.get(url)
      .then(risposta => setUtenti(risposta.dati?.utenti || risposta.dati || []))
      .catch(err => console.error(err))
      .finally(() => setCaricatoPer(`${filtroStato}|${filtroRuolo}`));
  }, [filtroStato, filtroRuolo]);

  useEffect(() => { caricaUtenti(); }, [caricaUtenti]);

  const approvaUtente = async (id) => {
    try {
      await api.patch(`/utenti/${id}/approva`);
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const bannaUtente = async (id) => {
    if (!confirm(t('adminUtenti.confermaBanna'))) return;
    try {
      await api.patch(`/utenti/${id}/banna`);
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const cambiaRuolo = async (id, ruolo) => {
    try {
      await api.patch(`/utenti/${id}/ruolo`, { ruolo });
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const eliminaUtente = async (id) => {
    if (!confirm(t('adminUtenti.confermaElimina'))) return;
    try {
      await api.delete(`/utenti/${id}`);
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const resetPassword = async (id) => {
    if (!confirm(t('adminUtenti.confermaResetPassword'))) return;
    try {
      const r = await api.put(`/admin/utenti/${id}/reset-password`);
      alert(t('adminUtenti.passwordTemporanea', { password: r.dati?.passwordTemporanea || t('adminUtenti.passwordErrore') }));
    } catch (err) { alert(err.message); }
  };

  const inAttesa = utenti.filter(u => u.stato === 'IN_ATTESA');
  const richiestePT = utenti.filter(u => u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE');

  return (
    <div className="py-2">
      <h1 className="text-2xl font-bold mb-6">{t('adminUtenti.titolo')}</h1>

      {/* Alert for users waiting for approval */}
      {inAttesa.length > 0 && !filtroStato && (
        <div className="p-card-inner rounded-[var(--raggio-lg)] mb-4 flex items-center gap-3"
             style={{ background: 'var(--avviso-dim)', border: '1px solid var(--avviso)' }}>
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--avviso)' }}>
              {t('adminUtenti.inAttesaApprovazione', { count: inAttesa.length })}
            </p>
          </div>
          <button onClick={() => setFiltroStato('IN_ATTESA')} className="ml-auto text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)]"
                  style={{ background: 'var(--avviso)', color: '#000' }}>
            {t('adminUtenti.mostra')}
          </button>
        </div>
      )}

      {/* Alert for personal trainer requests */}
      {richiestePT.length > 0 && !filtroStato && (
        <div className="p-card-inner rounded-[var(--raggio-lg)] mb-4 flex items-center gap-3"
             style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgb(139, 92, 246)' }}>
          <span className="text-xl">🏋️</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'rgb(139, 92, 246)' }}>
              {t('adminUtenti.richiedonoPT', { count: richiestePT.length })}
            </p>
            <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
              {richiestePT.map(u => u.nome).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} className="campo-input w-auto text-sm">
          <option value="">{t('adminUtenti.tuttiGliStati')}</option>
          <option value="IN_ATTESA">{t(STATI.IN_ATTESA.label)}</option>
          <option value="ATTIVO">{t(STATI.ATTIVO.label)}</option>
          <option value="BANNATO">{t(STATI.BANNATO.label)}</option>
        </select>
        <select value={filtroRuolo} onChange={e => setFiltroRuolo(e.target.value)} className="campo-input w-auto text-sm">
          <option value="">{t('adminUtenti.tuttiIRuoli')}</option>
          <option value="UTENTE">{t('adminUtenti.filtroRuolo.UTENTE')}</option>
          <option value="PERSONAL_TRAINER">{t('adminUtenti.filtroRuolo.PERSONAL_TRAINER')}</option>
          <option value="SUPERADMIN">{t('adminUtenti.filtroRuolo.SUPERADMIN')}</option>
        </select>
        <span className="text-xs text-[var(--testo-terziario)] self-center ml-2">
          {t('adminUtenti.utenti', { count: utenti.length })}
        </span>
      </div>

      {/* Users table */}
      {caricamento ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {utenti.map((u, i) => (
            <motion.div key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="glass-card px-card-inner py-4 flex flex-col md:flex-row md:items-center gap-3">
              {/* Avatar + info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                     style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {u.immagineProfilo ? <img src={u.immagineProfilo} alt="" className="w-full h-full object-cover" /> : u.nome?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {u.nome}
                    {u.emailVerificata === false && <span title={t('adminUtenti.emailNonVerificata')} className="text-[var(--avviso)] text-xs shrink-0">✉️⚠️</span>}
                  </p>
                  <p className="text-xs text-[var(--testo-terziario)] truncate">{u.email}</p>
                  <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5 truncate">
                    {u.ultimoAccesso ? t('adminUtenti.ultimoAccesso', { quando: formattaDataRelativa(u.ultimoAccesso) }) : t('adminUtenti.maiConnesso')}
                    {(u._count?.schedeCreate > 0 || u._count?.sessioni > 0) && ` · 📋 ${u._count?.schedeCreate || 0} · 🏋️ ${u._count?.sessioni || 0}`}
                    {u._count?.clientiComePT > 0 && ` · 👥 ${u._count.clientiComePT}`}
                    {u.palestra && ` · 🏢 ${u.palestra.nomeCatena}`}
                  </p>
                </div>
              </div>

              {/* Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`badge ${STATI[u.stato]?.colore || 'accent'}`}>{STATI[u.stato] && t(STATI[u.stato].label)}</span>
                <span className={`badge ${RUOLI[u.ruolo]?.colore || 'accent'}`}>{RUOLI[u.ruolo] && t(RUOLI[u.ruolo].label)}</span>
                {u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'rgb(139, 92, 246)' }}>
                    {t('adminUtenti.vuoleDiventarePT')}
                  </span>
                )}
                <span className="text-[10px] text-[var(--testo-terziario)]" title={t('adminUtenti.dataRegistrazione')}>📅 {formattaData(u.dataRegistrazione)}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0">
                {u.stato === 'IN_ATTESA' && (
                  <button onClick={() => approvaUtente(u.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)] transition-all"
                          style={{ background: 'var(--successo)', color: '#fff' }}>
                    {t('adminUtenti.approva')}
                  </button>
                )}
                {u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE' && u.stato === 'ATTIVO' && (
                  <button onClick={() => cambiaRuolo(u.id, 'PERSONAL_TRAINER')}
                          className="text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)] transition-all"
                          style={{ background: 'rgb(139, 92, 246)', color: '#fff' }}>
                    {t('adminUtenti.approvaPT')}
                  </button>
                )}
                {u.id === utenteCorrente?.id ? (
                  <span className="text-xs font-semibold text-[var(--testo-terziario)] px-2 py-1.5 flex items-center gap-1" title={t('adminUtenti.tuoAccount')}>
                    {t('adminUtenti.tu')}
                  </span>
                ) : (
                  <>
                    {u.stato === 'ATTIVO' && (
                      <select defaultValue={u.ruolo} onChange={e => cambiaRuolo(u.id, e.target.value)}
                              className="campo-input text-xs py-1 w-auto">
                        <option value="UTENTE">{t('adminUtenti.ruoloBreve.UTENTE')}</option>
                        <option value="PERSONAL_TRAINER">{t('adminUtenti.ruoloBreve.PERSONAL_TRAINER')}</option>
                        <option value="SUPERADMIN">{t('adminUtenti.ruoloBreve.SUPERADMIN')}</option>
                      </select>
                    )}
                    {u.stato !== 'BANNATO' && (
                      <button onClick={() => bannaUtente(u.id)}
                              className="text-xs text-[var(--pericolo)] px-2 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--pericolo-dim)] transition-all">
                        🚫
                      </button>
                    )}
                    {u.stato === 'BANNATO' && (
                      <button onClick={() => approvaUtente(u.id)}
                              className="text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)] bg-[var(--successo-dim)] text-[var(--successo)]">
                        {t('adminUtenti.riattiva')}
                      </button>
                    )}
                    <button onClick={() => resetPassword(u.id)}
                            title={t('adminUtenti.resetPassword')}
                            className="text-xs text-[var(--avviso)] px-2 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--avviso-dim)] transition-all">
                      🔑
                    </button>
                    <button onClick={() => eliminaUtente(u.id)}
                            className="text-xs text-[var(--pericolo)] px-2 py-1.5 rounded-[var(--raggio-md)] hover:bg-[var(--pericolo-dim)] transition-all ml-1">
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
