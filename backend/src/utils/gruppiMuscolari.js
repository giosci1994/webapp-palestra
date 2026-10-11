// ============================================
// GymMaster — Muscle groups for the statistics
// ============================================
//
// The catalogue describes exercises with two different vocabularies:
//  - the primary group uses group names ("Schiena", "Addome", "Gambe"…);
//  - the secondary field uses anatomical names separated by commas
//    ("Grande Gluteo, Bicipite Femorale"), partly in English ("Anconeus"),
//    mixed in the curated catalogue with group names ("Spalle anteriori").
// Here both are brought back to the same groups, those of the body map,
// so the map and the sets chart count the same way.
//
// Counting rules, per completed set:
//  - primary group: 1 set;
//  - each secondary group: 0.5 sets, only once even if several muscles in
//    the list fall into the same group, and none if it matches the primary;
//  - "Gambe" is generic (leg press, lunges): half quads, half hamstrings.

/** Groups with an area on the body outline: the sets chart shows them even at zero. */
export const GRUPPI_PRINCIPALI = [
  'Petto', 'Schiena', 'Spalle', 'Bicipiti', 'Tricipiti', 'Quadricipiti',
  'Femorali', 'Glutei', 'Polpacci', 'Addominali', 'Trapezio', 'Avambracci',
  'Adduttori', 'Abduttori',
];

/** Groups that are not muscles: no secondaries, no sets chart. */
export const GRUPPI_NON_MUSCOLARI = new Set(['Cardio', 'Tutto il corpo', 'Funzionale']);

// Catalogue name (primary or secondary) → [group, weight]
const MAPPA = {
  // group names
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
  // anatomical names
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
  // Dentato anteriore (serratus anterior) and "Funzionale" have no clear
  // group: better not to count them than to give them to the wrong group.
};

/**
 * Groups trained by an exercise, with the weight of each one for every set.
 * @returns {{ gruppo: string, peso: number, secondario: boolean }[]}
 */
export function gruppiDiEsercizio(primario, secondari) {
  const risultato = new Map();
  for (const [gruppo, peso] of MAPPA[primario] || (primario ? [[primario, 1]] : [])) {
    risultato.set(gruppo, { gruppo, peso, secondario: false });
  }
  // Cardio does not count as sets for the muscles it moves
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
