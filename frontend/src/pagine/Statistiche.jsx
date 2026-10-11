// ============================================
// GymMaster — Pagina Statistiche
// Grafici e dati sui progressi dell'utente
// ============================================

import { useState, useEffect } from 'react';
import { api } from '../config/api.js';
import SezioneCorpo from '../componenti/specifici/SezioneCorpo.jsx';
import SeriePerMuscolo from '../componenti/specifici/SeriePerMuscolo.jsx';
import FrequenzaSettimanale from '../componenti/specifici/FrequenzaSettimanale.jsx';
import AttivitaAnnuale from '../componenti/specifici/AttivitaAnnuale.jsx';
import IndicatoriPeriodo from '../componenti/specifici/IndicatoriPeriodo.jsx';

// Periodi selezionabili
const PERIODI = [
  { id: 7, label: '7g' },
  { id: 30, label: '30g' },
  { id: 90, label: '3m' },
  { id: 365, label: '1a' }
];

export default function Statistiche() {
  const [riepilogo, setRiepilogo] = useState(null);
  // Due periodi di dati giornalieri: l'attuale e il precedente, per il confronto
  const [giorniDoppi, setGiorniDoppi] = useState([]);
  // Gruppi muscolari nel periodo: un'unica fonte per la sagoma e per le barre
  const [muscoli, setMuscoli] = useState(null);
  const [frequenza, setFrequenza] = useState([]);
  const [attivita, setAttivita] = useState([]);
  // Istante del caricamento: riferimento unico per dividere i due periodi
  const [caricatoIl, setCaricatoIl] = useState(0);
  const [periodo, setPeriodo] = useState(30);
  // Il periodo dei dati mostrati: finche' non e' quello scelto, si sta caricando
  const [caricatoPer, setCaricatoPer] = useState(null);
  const caricamento = caricatoPer !== periodo;

  useEffect(() => {
    let annullato = false;
    Promise.all([
      api.get('/statistiche/riepilogo'),
      api.get(`/statistiche/sessioni?giorni=${periodo * 2}`),
      api.get(`/statistiche/muscoli?giorni=${periodo}`),
      api.get('/statistiche/frequenza'),
      api.get('/statistiche/attivita-annuale')
    ])
      .then(([rie, ses, grp, freq, att]) => {
        if (annullato) return;
        setRiepilogo(rie.dati);
        setGiorniDoppi(ses.dati || []);
        setCaricatoIl(Date.now());
        setMuscoli(grp.dati || null);
        setFrequenza(freq.dati || []);
        setAttivita(att.dati || []);
      })
      .catch(err => console.error('Errore caricamento statistiche:', err))
      .finally(() => { if (!annullato) setCaricatoPer(periodo); });
    return () => { annullato = true; };
  }, [periodo]);

  if (caricamento) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-[var(--bg-terziario)] border-t-[var(--accent)] rounded-full anima-ruota" />
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Statistiche</h1>
        <div className="flex items-center bg-[var(--bg-terziario)] p-1 rounded-xl border border-[var(--bordo-light)]">
          {PERIODI.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all ${
                      periodo === p.id 
                        ? 'bg-[var(--accent)] text-white shadow-md' 
                        : 'text-[var(--testo-secondario)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                    }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicatori del periodo scelto, confrontati col precedente */}
      <div className="mb-7">
        <IndicatoriPeriodo giorni={giorniDoppi} periodo={periodo} adesso={caricatoIl} riepilogo={riepilogo} />
      </div>

      {/* Corpo: gruppi muscolari, esercizi, carichi e massimali */}
      <div className="mb-7">
        <SezioneCorpo dati={muscoli} periodo={periodo} adesso={caricatoIl} />
      </div>

      {/* Grafici */}
      <div className="grid gap-7 md:grid-cols-2">
        {/* Allenamenti fatti e programmati, settimana per settimana */}
        <FrequenzaSettimanale settimane={frequenza} />

        {/* Serie a settimana per muscolo, con la fascia consigliata */}
        <SeriePerMuscolo dati={muscoli} />
      </div>

      {/* Un quadretto per giorno nell'ultimo anno */}
      <div className="mt-7">
        <AttivitaAnnuale giorni={attivita} />
      </div>
    </div>
  );
}
