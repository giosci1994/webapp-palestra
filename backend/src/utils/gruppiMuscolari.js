// ============================================
// GymMaster — Gruppi muscolari per le statistiche
// ============================================
//
// Il catalogo descrive gli esercizi con due vocabolari diversi:
//  - il gruppo primario usa nomi di gruppo ("Schiena", "Addome", "Gambe"…);
//  - il campo dei secondari usa nomi anatomici separati da virgola
//    ("Grande Gluteo, Bicipite Femorale"), in parte in inglese ("Anconeus"),
//    mescolati nel catalogo curato a nomi di gruppo ("Spalle anteriori").
// Qui entrambi vengono ricondotti agli stessi gruppi, quelli della mappa del
// corpo, cosi' mappa e grafico delle serie contano allo stesso modo.
//
// Regole di conteggio, per serie completata:
//  - gruppo primario: 1 serie;
//  - ogni gruppo secondario: 0,5 serie, una volta sola anche se piu' muscoli
//    dell'elenco cadono nello stesso gruppo, e nessuna se coincide col primario;
//  - "Gambe" e' generico (leg press, affondi): meta' quadricipiti, meta' femorali.

/** Gruppi con una zona sulla sagoma: nel grafico delle serie compaiono anche a zero. */
export const GRUPPI_PRINCIPALI = [
  'Petto', 'Schiena', 'Spalle', 'Bicipiti', 'Tricipiti', 'Quadricipiti',
  'Femorali', 'Glutei', 'Polpacci', 'Addominali', 'Trapezio', 'Avambracci',
  'Adduttori', 'Abduttori',
];

/** Gruppi che non sono muscoli: niente secondari, niente grafico delle serie. */
export const GRUPPI_NON_MUSCOLARI = new Set(['Cardio', 'Tutto il corpo', 'Funzionale']);

// Nome del catalogo (primario o secondario) → [gruppo, peso]
const MAPPA = {
  // nomi di gruppo
  'Petto': [['Petto', 1]], 'Schiena': [['Schiena', 1]], 'Dorsali': [['Schiena', 1]],
  'Schiena bassa': [['Schiena', 1]], 'Trapezio': [['Trapezio', 1]], 'Spalle': [['Spalle', 1]],
  'Spalle anteriori': [['Spalle', 1]], 'Bicipiti': [['Bicipiti', 1]], 'Tricipiti': [['Tricipiti', 1]],
  'Avambracci': [['Avambracci', 1]], 'Addominali': [['Addominali', 1]], 'Addome': [['Addominali', 1]],
  'Core': [['Addominali', 1]], 'Quadricipiti': [['Quadricipiti', 1]], 'Femorali': [['Femorali', 1]],
  'Glutei': [['Glutei', 1]], 'Adduttori': [['Adduttori', 1]], 'Abduttori': [['Abduttori', 1]],
  'Polpacci': [['Polpacci', 1]], 'Tibiali': [['Tibiali', 1]],
  "Flessori dell'Anca": [["Flessori dell'Anca", 1]], "Flessori dell'anca": [["Flessori dell'Anca", 1]],
  'Gambe': [['Quadricipiti', 0.5], ['Femorali', 0.5]],
  'Cardio': [['Cardio', 1]], 'Tutto il corpo': [['Tutto il corpo', 1]],
  // nomi anatomici
  'Gran Pettorale': [['Petto', 1]],
  'Gran Dorsale': [['Schiena', 1]], 'Romboidi': [['Schiena', 1]], 'Erettore Spinale': [['Schiena', 1]],
  'Grande Rotondo': [['Schiena', 1]],
  'Trapezius': [['Trapezio', 1]], 'Upper Trapezius': [['Trapezio', 1]], 'Levator Scapulae': [['Trapezio', 1]],
  'Deltoide Anteriore': [['Spalle', 1]], 'Deltoide Posteriore': [['Spalle', 1]], 'Medial Deltoids': [['Spalle', 1]],
  'Infraspinato': [['Spalle', 1]], 'Piccolo Rotondo': [['Spalle', 1]], 'Sovraspinato': [['Spalle', 1]],
  'Sottoscapolare': [['Spalle', 1]],
  'Bicipite Brachiale': [['Bicipiti', 1]], 'Brachiale': [['Bicipiti', 1]],
  'Tricipite Brachiale': [['Tricipiti', 1]], 'Anconeus': [['Tricipiti', 1]],
  'Brachioradiale': [['Avambracci', 1]], 'Flexor Carpi Radialis': [['Avambracci', 1]],
  'Retto Addominale': [['Addominali', 1]], 'Obliqui': [['Addominali', 1]], 'Transverse Abdominis': [['Addominali', 1]],
  'Quadriceps Femoris': [['Quadricipiti', 1]], 'Retto Femorale': [['Quadricipiti', 1]],
  'Bicipite Femorale': [['Femorali', 1]],
  'Grande Gluteo': [['Glutei', 1]], 'Medio Gluteo': [['Glutei', 1]], 'Piccolo Gluteo': [['Glutei', 1]],
  'Grande Adduttore': [['Adduttori', 1]], 'Tensore Fascia Lata': [['Abduttori', 1]],
  'Soleo': [['Polpacci', 1]], 'Gastrocnemio': [['Polpacci', 1]], 'Tibialis Posterior': [['Polpacci', 1]],
  'Tibiale Anteriore': [['Tibiali', 1]], 'Extensor Hallucis Longus': [['Tibiali', 1]],
  'Extensor Digitorum Longus': [['Tibiali', 1]],
  'Ileopsoas': [["Flessori dell'Anca", 1]],
  // Dentato anteriore e "Funzionale" non hanno un gruppo chiaro: meglio non
  // contarli che attribuirli al gruppo sbagliato.
};

/**
 * Gruppi allenati da un esercizio, con il peso di ciascuno per ogni serie.
 * @returns {{ gruppo: string, peso: number, secondario: boolean }[]}
 */
export function gruppiDiEsercizio(primario, secondari) {
  const risultato = new Map();
  for (const [gruppo, peso] of MAPPA[primario] || (primario ? [[primario, 1]] : [])) {
    risultato.set(gruppo, { gruppo, peso, secondario: false });
  }
  // Il cardio non conta come serie per i muscoli che muove
  if (GRUPPI_NON_MUSCOLARI.has(primario)) return [...risultato.values()];

  const visti = new Set();
  for (const nome of String(secondari || '').split(',').map(s => s.trim()).filter(Boolean)) {
    for (const [gruppo, peso] of MAPPA[nome] || []) {
      if (risultato.has(gruppo) || visti.has(gruppo) || GRUPPI_NON_MUSCOLARI.has(gruppo)) continue;
      visti.add(gruppo);
      risultato.set(gruppo, { gruppo, peso: 0.5 * peso, secondario: true });
    }
  }
  return [...risultato.values()];
}
