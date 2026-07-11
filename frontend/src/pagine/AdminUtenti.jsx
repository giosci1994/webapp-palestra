// ============================================
// GymMaster — Admin Utenti
// Gestione utenti: approva, banna, cambia ruolo
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { RUOLI } from '../utils/costanti.js';
import { formattaData, formattaDataRelativa } from '../utils/formattatori.js';
import { motion } from 'framer-motion';

const STATI = {
  IN_ATTESA: { label: 'In attesa', colore: 'avviso', bg: 'var(--avviso-dim)' },
  ATTIVO: { label: 'Attivo', colore: 'successo', bg: 'var(--successo-dim)' },
  BANNATO: { label: 'Bannato', colore: 'pericolo', bg: 'var(--pericolo-dim)' }
};

export default function AdminUtenti() {
  const { utente: utenteCorrente } = useAuth();
  const [utenti, setUtenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [filtroStato, setFiltroStato] = useState('');
  const [filtroRuolo, setFiltroRuolo] = useState('');

  useEffect(() => { caricaUtenti(); }, [filtroStato, filtroRuolo]);

  const caricaUtenti = async () => {
    try {
      setCaricamento(true);
      let url = '/utenti?limite=100';
      if (filtroStato) url += `&stato=${filtroStato}`;
      if (filtroRuolo) url += `&ruolo=${filtroRuolo}`;
      const risposta = await api.get(url);
      setUtenti(risposta.dati?.utenti || risposta.dati || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCaricamento(false);
    }
  };

  const approvaUtente = async (id) => {
    try {
      await api.patch(`/utenti/${id}/approva`);
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const bannaUtente = async (id) => {
    if (!confirm('Sei sicuro di voler bannare questo utente?')) return;
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
    if (!confirm('Sei sicuro di voler ELIMINARE definitivamente questo utente? Questa operazione è irreversibile e cancellerà tutto il suo storico.')) return;
    try {
      await api.delete(`/utenti/${id}`);
      caricaUtenti();
    } catch (err) { alert(err.message); }
  };

  const resetPassword = async (id) => {
    if (!confirm('Resettare la password di questo utente? Verrà generata una password temporanea da comunicargli.')) return;
    try {
      const r = await api.put(`/admin/utenti/${id}/reset-password`);
      alert(`Password temporanea generata:\n\n${r.dati?.passwordTemporanea || '(errore)'}\n\nComunicala all'utente: potrà cambiarla dopo l'accesso.`);
    } catch (err) { alert(err.message); }
  };

  const inAttesa = utenti.filter(u => u.stato === 'IN_ATTESA');
  const richiestePT = utenti.filter(u => u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE');

  return (
    <div className="py-2">
      <h1 className="text-2xl font-bold mb-6">👥 Gestione Utenti</h1>

      {/* Alert utenti in attesa */}
      {inAttesa.length > 0 && !filtroStato && (
        <div className="p-card-inner rounded-[var(--raggio-lg)] mb-4 flex items-center gap-3"
             style={{ background: 'var(--avviso-dim)', border: '1px solid var(--avviso)' }}>
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--avviso)' }}>
              {inAttesa.length} utent{inAttesa.length === 1 ? 'e' : 'i'} in attesa di approvazione
            </p>
          </div>
          <button onClick={() => setFiltroStato('IN_ATTESA')} className="ml-auto text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)]"
                  style={{ background: 'var(--avviso)', color: '#000' }}>
            Mostra
          </button>
        </div>
      )}

      {/* Alert richieste PT */}
      {richiestePT.length > 0 && !filtroStato && (
        <div className="p-card-inner rounded-[var(--raggio-lg)] mb-4 flex items-center gap-3"
             style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgb(139, 92, 246)' }}>
          <span className="text-xl">🏋️</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'rgb(139, 92, 246)' }}>
              {richiestePT.length} utent{richiestePT.length === 1 ? 'e richiede' : 'i richiedono'} il ruolo di Personal Trainer
            </p>
            <p className="text-xs text-[var(--testo-terziario)] mt-0.5">
              {richiestePT.map(u => u.nome).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} className="campo-input w-auto text-sm">
          <option value="">Tutti gli stati</option>
          <option value="IN_ATTESA">In attesa</option>
          <option value="ATTIVO">Attivo</option>
          <option value="BANNATO">Bannato</option>
        </select>
        <select value={filtroRuolo} onChange={e => setFiltroRuolo(e.target.value)} className="campo-input w-auto text-sm">
          <option value="">Tutti i ruoli</option>
          <option value="UTENTE">Utente</option>
          <option value="PERSONAL_TRAINER">Personal Trainer</option>
          <option value="SUPERADMIN">SuperAdmin</option>
        </select>
        <span className="text-xs text-[var(--testo-terziario)] self-center ml-2">
          {utenti.length} utenti
        </span>
      </div>

      {/* Tabella utenti */}
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
                    {u.emailVerificata === false && <span title="Email non verificata" className="text-[var(--avviso)] text-xs shrink-0">✉️⚠️</span>}
                  </p>
                  <p className="text-xs text-[var(--testo-terziario)] truncate">{u.email}</p>
                  <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5 truncate">
                    {u.ultimoAccesso ? `Ultimo accesso ${formattaDataRelativa(u.ultimoAccesso)}` : 'Mai connesso'}
                    {(u._count?.schedeCreate > 0 || u._count?.sessioni > 0) && ` · 📋 ${u._count?.schedeCreate || 0} · 🏋️ ${u._count?.sessioni || 0}`}
                    {u._count?.clientiComePT > 0 && ` · 👥 ${u._count.clientiComePT}`}
                    {u.palestra && ` · 🏢 ${u.palestra.nomeCatena}`}
                  </p>
                </div>
              </div>

              {/* Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`badge ${STATI[u.stato]?.colore || 'accent'}`}>{STATI[u.stato]?.label}</span>
                <span className={`badge ${RUOLI[u.ruolo]?.colore || 'accent'}`}>{RUOLI[u.ruolo]?.label}</span>
                {u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'rgb(139, 92, 246)' }}>
                    🏋️ Vuole diventare PT
                  </span>
                )}
                <span className="text-[10px] text-[var(--testo-terziario)]" title="Data registrazione">📅 {formattaData(u.dataRegistrazione)}</span>
              </div>

              {/* Azioni */}
              <div className="flex gap-2 shrink-0">
                {u.stato === 'IN_ATTESA' && (
                  <button onClick={() => approvaUtente(u.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)] transition-all"
                          style={{ background: 'var(--successo)', color: '#fff' }}>
                    ✓ Approva
                  </button>
                )}
                {u.ruoloRichiesto === 'PERSONAL_TRAINER' && u.ruolo === 'UTENTE' && u.stato === 'ATTIVO' && (
                  <button onClick={() => cambiaRuolo(u.id, 'PERSONAL_TRAINER')}
                          className="text-xs font-medium px-3 py-1.5 rounded-[var(--raggio-md)] transition-all"
                          style={{ background: 'rgb(139, 92, 246)', color: '#fff' }}>
                    ✓ Approva PT
                  </button>
                )}
                {u.id === utenteCorrente?.id ? (
                  <span className="text-xs font-semibold text-[var(--testo-terziario)] px-2 py-1.5 flex items-center gap-1" title="Non puoi modificare o eliminare il tuo stesso account">
                    👤 Tu
                  </span>
                ) : (
                  <>
                    {u.stato === 'ATTIVO' && (
                      <select defaultValue={u.ruolo} onChange={e => cambiaRuolo(u.id, e.target.value)}
                              className="campo-input text-xs py-1 w-auto">
                        <option value="UTENTE">Utente</option>
                        <option value="PERSONAL_TRAINER">PT</option>
                        <option value="SUPERADMIN">Admin</option>
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
                        Riattiva
                      </button>
                    )}
                    <button onClick={() => resetPassword(u.id)}
                            title="Resetta password (genera una temporanea)"
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
