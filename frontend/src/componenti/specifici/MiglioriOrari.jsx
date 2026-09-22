// ============================================
// GymMaster — Migliori orari per allenarsi
// Ricava dalle rilevazioni di affluenza quando la palestra è più libera
// ============================================

import { useState, useEffect } from 'react';
import { Clock, TrendingDown } from 'lucide-react';
import { api } from '../../config/api.js';
import SezioneCollassabile from '../comuni/SezioneCollassabile.jsx';

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/** Indice giorno con lunedì = 0, coerente col resto dell'app. */
function oggiIndice() {
  return (new Date().getDay() + 6) % 7;
}

function colorePerLivello(livello) {
  if (livello <= 30) return 'var(--successo, #22c55e)';
  if (livello <= 60) return '#eab308';
  return 'var(--pericolo, #ef4444)';
}

export default function MiglioriOrari({ palestraId }) {
  const [dati, setDati] = useState(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    if (!palestraId) { setCaricamento(false); return; }
    let annullato = false;
    api.get(`/palestre/${palestraId}/affluenza/migliori-orari`)
      .then(r => { if (!annullato) setDati(r.dati); })
      .catch(() => { if (!annullato) setDati(null); })
      .finally(() => { if (!annullato) setCaricamento(false); });
    return () => { annullato = true; };
  }, [palestraId]);

  // Senza dati la card non viene mostrata affatto: meglio niente che un
  // riquadro vuoto che suggerisce un guasto.
  if (caricamento || !dati?.disponibile) return null;

  const oggi = oggiIndice();
  const diOggi = dati.perGiorno.find(g => g.giornoSettimana === oggi);
  const piuTranquillo = dati.giornoPiuTranquillo;

  return (
    <SezioneCollassabile chiave="quando-andare" titolo="Quando andare" Icona={Clock}>
      <div className="p-card-inner pt-4">
        {diOggi ? (
          <>
            <p className="text-xs text-[var(--testo-terziario)] uppercase tracking-wide font-bold mb-2">
              Oggi, le ore più libere
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {diOggi.migliori.map(m => (
                <span
                  key={m.ora}
                  className="px-3 py-1.5 rounded-[var(--raggio-sm)] text-sm font-bold border"
                  style={{ borderColor: colorePerLivello(m.livello), color: colorePerLivello(m.livello) }}
                  title={`Circa ${m.livello}% di riempimento`}
                >
                  {String(m.ora).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--testo-secondario)] mt-2">
              Contro una media di {diOggi.media}% nella giornata.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--testo-terziario)]">Nessuna rilevazione per oggi.</p>
        )}

        {piuTranquillo != null && piuTranquillo !== oggi && (
          <div className="mt-4 pt-3 border-t border-[var(--bordo-light)] flex items-start gap-2">
            <TrendingDown size={16} className="text-[var(--testo-secondario)] mt-0.5 shrink-0" />
            <p className="text-xs text-[var(--testo-secondario)]">
              Il giorno più tranquillo della settimana è <span className="font-bold text-[var(--testo-primario)]">{GIORNI[piuTranquillo]}</span>.
            </p>
          </div>
        )}

        <p className="text-[10px] text-[var(--testo-terziario)] mt-3">
          Su {dati.rilevazioni} rilevazioni, fascia {dati.fascia.da}:00–{dati.fascia.a}:00.
        </p>
      </div>
    </SezioneCollassabile>
  );
}
