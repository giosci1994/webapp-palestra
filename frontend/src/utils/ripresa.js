// ============================================
// GymMaster — Riprendere un allenamento dal server
// ============================================
//
// La schermata di allenamento tiene il punto in cui sei nel browser
// (localStorage). Se li' non c'e' niente (allenamento ripreso dallo storico,
// aperto da un altro dispositivo, dati del browser cancellati) il punto si
// ricostruisce dalle serie registrate sul server: senza, si ripartiva dalla
// prima serie e le serie gia' fatte venivano registrate una seconda volta.

/** Valori per un esercizio aggiunto durante l'allenamento (come in WorkoutLive) */
export const ESERCIZIO_EXTRA = { serieTarget: 3, repTarget: 10, recuperoSecondi: 90 };

/**
 * @param {object} sessione - da GET /sessioni/:id: scheda con gli esercizi, logSerie con l'esercizio
 * @returns {{ eserciziLive: object[], serieCompletate: object[], esercizioIdx: number, serieCorrente: number, tempoInizio: number }}
 */
export function statoDaSessione(sessione) {
  const eserciziScheda = sessione.scheda?.esercizi ?? [];
  const serie = [...(sessione.logSerie ?? [])].sort((a, b) => a.id - b.id);

  // Gli esercizi aggiunti durante l'allenamento: hanno serie ma non sono nella scheda
  const nellaScheda = new Set(eserciziScheda.map(e => e.esercizioId));
  const extra = [];
  for (const s of serie) {
    if (nellaScheda.has(s.esercizioId) || extra.some(e => e.esercizioId === s.esercizioId)) continue;
    extra.push({ esercizioId: s.esercizioId, esercizio: s.esercizio, ...ESERCIZIO_EXTRA });
  }
  const eserciziLive = [...eserciziScheda, ...extra];

  // Si riparte dal primo esercizio con serie ancora da fare: quelle saltate
  // contano come fatte, come durante l'allenamento
  const registrate = esercizioId => serie.filter(s => s.esercizioId === esercizioId).length;
  let esercizioIdx = eserciziLive.findIndex(e => registrate(e.esercizioId) < (e.serieTarget ?? 1));
  if (esercizioIdx === -1) esercizioIdx = Math.max(0, eserciziLive.length - 1);
  const attuale = eserciziLive[esercizioIdx];

  return {
    eserciziLive,
    serieCompletate: serie.filter(s => s.completato),
    esercizioIdx,
    serieCorrente: attuale ? registrate(attuale.esercizioId) + 1 : 1,
    tempoInizio: new Date(sessione.dataInizio).getTime()
  };
}
