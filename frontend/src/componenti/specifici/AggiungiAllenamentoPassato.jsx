// ============================================
// GymMaster — Registra un allenamento già svolto
// Per le sedute fatte senza connessione o tracciate con l'orologio
// ============================================

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Dumbbell } from 'lucide-react';
import { api } from '../../config/api.js';

/** "YYYY-MM-DD" da una data locale, senza passare per UTC (che sposterebbe il giorno). */
function aStringaData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Primo numero di un target tipo "8-12", usato come segnaposto. */
function repIniziali(repTarget) {
  const m = String(repTarget || '').match(/\d+/);
  return m ? m[0] : '';
}

export default function AggiungiAllenamentoPassato({ schede, onChiudi, onSalvato }) {
  const oggi = new Date();
  const ieri = new Date(oggi.getTime() - 86400000);

  const [schedaId, setSchedaId] = useState('');
  const [data, setData] = useState(aStringaData(ieri));
  const [ora, setOra] = useState('18:00');
  const [durata, setDurata] = useState(60);
  const [riscaldamento, setRiscaldamento] = useState('');
  const [note, setNote] = useState('');

  const [dettaglioSerie, setDettaglioSerie] = useState(false);
  const [esercizi, setEsercizi] = useState([]);
  const [valori, setValori] = useState({});   // "esercizioId-serieNumero" → { peso, rep }
  const [caricandoScheda, setCaricandoScheda] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');

  // Alla scelta della scheda si caricano gli esercizi con i target, cosi' la
  // griglia dei carichi e' gia' pronta e resta solo da inserire i pesi.
  useEffect(() => {
    if (!schedaId) { setEsercizi([]); setValori({}); return; }
    let annullato = false;
    setCaricandoScheda(true);
    api.get(`/schede/${schedaId}`)
      .then(r => {
        if (annullato) return;
        const voci = (r.dati?.esercizi || []).filter(v => !v.riscaldamento);
        setEsercizi(voci);
        setValori({});
      })
      .catch(() => { if (!annullato) setEsercizi([]); })
      .finally(() => { if (!annullato) setCaricandoScheda(false); });
    return () => { annullato = true; };
  }, [schedaId]);

  const aggiornaValore = (chiave, campo, valore) =>
    setValori(prec => ({ ...prec, [chiave]: { ...prec[chiave], [campo]: valore } }));

  const costruisciSerie = () => {
    if (!dettaglioSerie) return [];
    const out = [];
    for (const voce of esercizi) {
      const totaleSerie = voce.serieTarget || 3;
      for (let n = 1; n <= totaleSerie; n++) {
        const v = valori[`${voce.esercizio.id}-${n}`];
        // Una serie senza peso ne' ripetizioni non e' stata svolta: si omette
        if (!v || (!v.peso && !v.rep)) continue;
        out.push({
          esercizioId: voce.esercizio.id,
          serieNumero: n,
          pesoEffettivo: parseFloat(v.peso) || 0,
          repEffettive: parseInt(v.rep) || 0
        });
      }
    }
    return out;
  };

  const salva = async () => {
    setErrore('');
    if (!schedaId) { setErrore('Scegli la scheda che hai seguito'); return; }

    // Data e ora locali vengono convertite in un istante assoluto: cosi' l'ora
    // salvata e' quella in cui ti sei allenato, indipendentemente dal server.
    const istante = new Date(`${data}T${ora}`);
    if (Number.isNaN(istante.getTime())) { setErrore('Data od ora non valide'); return; }
    if (istante.getTime() > Date.now()) { setErrore('Quella data è nel futuro'); return; }

    try {
      setSalvando(true);
      const risposta = await api.post('/sessioni/passata', {
        schedaId: Number(schedaId),
        dataInizio: istante.toISOString(),
        durataMinuti: Number(durata),
        minutiRiscaldamento: riscaldamento ? Number(riscaldamento) : null,
        noteFinali: note.trim() || null,
        serie: costruisciSerie()
      });
      onSalvato?.(risposta);
    } catch (err) {
      setErrore(err?.message || 'Salvataggio non riuscito');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onChiudi}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[var(--raggio-lg)] sm:rounded-[var(--raggio-lg)]"
      >
        <div className="p-card-inner border-b border-[var(--bordo-light)] flex items-start justify-between gap-3 sticky top-0 z-10" style={{ background: 'var(--bg-secondario, #14141c)' }}>
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Dumbbell size={20} className="text-[var(--accent)]" /> Allenamento già fatto
            </h3>
            <p className="text-xs text-[var(--testo-secondario)] mt-1">
              Per le sedute svolte senza connessione o registrate con l'orologio.
            </p>
          </div>
          <button onClick={onChiudi} aria-label="Chiudi" className="p-1.5 rounded text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-card-inner flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Scheda seguita</span>
            <select value={schedaId} onChange={e => setSchedaId(e.target.value)} className="campo-input">
              <option value="">Scegli una scheda…</option>
              {schede.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Giorno</span>
              <input type="date" value={data} max={aStringaData(oggi)} onChange={e => setData(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Ora d'inizio</span>
              <input type="time" value={ora} onChange={e => setOra(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Durata (min)</span>
              <input type="number" min="1" max="600" value={durata} onChange={e => setDurata(e.target.value)} className="campo-input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Riscaldamento (min)</span>
              <input type="number" min="0" max="120" value={riscaldamento} onChange={e => setRiscaldamento(e.target.value)} placeholder="facoltativo" className="campo-input" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--testo-terziario)] uppercase tracking-wide">Note</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="es. registrato con l'orologio" className="campo-input" />
          </label>

          {/* I carichi sono facoltativi: con il solo riepilogo dell'orologio si
              registrano data e durata, senza dover inventare numeri. */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={dettaglioSerie} onChange={e => setDettaglioSerie(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
            <span>Ho annotato i carichi, voglio inserirli</span>
          </label>

          {dettaglioSerie && (
            <div className="flex flex-col gap-3">
              {!schedaId && <p className="text-xs text-[var(--testo-terziario)]">Scegli prima la scheda.</p>}
              {caricandoScheda && <p className="text-xs text-[var(--testo-terziario)]">Carico gli esercizi…</p>}
              {esercizi.map(voce => (
                <div key={voce.id} className="rounded-[var(--raggio-md)] border border-[var(--bordo-light)] p-3">
                  <p className="font-semibold text-sm mb-2 truncate">{voce.esercizio?.nome}</p>
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: voce.serieTarget || 3 }, (_, i) => i + 1).map(n => {
                      const chiave = `${voce.esercizio.id}-${n}`;
                      return (
                        <div key={n} className="flex items-center gap-2">
                          <span className="text-xs text-[var(--testo-terziario)] w-10 shrink-0">{n}ª</span>
                          <input
                            type="number" min="0" step="0.5" inputMode="decimal"
                            value={valori[chiave]?.peso || ''}
                            onChange={e => aggiornaValore(chiave, 'peso', e.target.value)}
                            placeholder="kg"
                            className="campo-input flex-1 min-w-0 text-sm"
                          />
                          <input
                            type="number" min="0" inputMode="numeric"
                            value={valori[chiave]?.rep || ''}
                            onChange={e => aggiornaValore(chiave, 'rep', e.target.value)}
                            placeholder={repIniziali(voce.repTarget) || 'rip.'}
                            className="campo-input flex-1 min-w-0 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {schedaId && !caricandoScheda && esercizi.length === 0 && (
                <p className="text-xs text-[var(--testo-terziario)]">Questa scheda non ha esercizi.</p>
              )}
            </div>
          )}

          {errore && <p className="text-sm text-[var(--pericolo)]">{errore}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onChiudi} className="flex-1 py-2.5 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium">
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={salvando || !schedaId}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={16} /> {salvando ? 'Salvo…' : 'Registra'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
