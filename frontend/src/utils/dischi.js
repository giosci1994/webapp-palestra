// ============================================
// GymMaster — Dischi da caricare sul bilanciere
// ============================================
//
// Scritto il peso totale di una serie col bilanciere, quali dischi mettere su
// ciascun lato: niente conti a mente fra una serie e l'altra.

/** Le barre del catalogo, riconosciute dal nome dell'attrezzatura, e il loro peso a vuoto */
export const BILANCIERI = [
  { schema: /olimpic/i, nome: 'bilanciere olimpico', peso: 20 },
  { schema: /\bez\b/i, nome: 'bilanciere EZ', peso: 10 },
  { schema: /trap bar|hex bar/i, nome: 'trap bar', peso: 25 }
];

/** I dischi di una palestra, dal piu' pesante */
export const DISCHI = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Il bilanciere che usa l'esercizio, o null */
export function bilanciereDi(esercizio) {
  const nome = esercizio?.attrezzatura?.nome || '';
  return BILANCIERI.find(b => b.schema.test(nome)) || null;
}

const arrotonda = n => Math.round(n * 1000) / 1000;

/**
 * I dischi per ciascun lato, dal piu' pesante, per arrivare a `pesoTotale`.
 * Se non si arriva esattamente coi dischi a disposizione, `mancano` dice
 * quanti kg restano scoperti in totale. null se il peso non supera la barra.
 */
export function dischiPerLato(pesoTotale, pesoBilanciere = 20, dischi = DISCHI) {
  const totale = Number(pesoTotale);
  if (!Number.isFinite(totale) || totale <= pesoBilanciere) return null;
  let restante = arrotonda((totale - pesoBilanciere) / 2);
  const perLato = [];
  for (const disco of dischi) {
    while (restante >= disco) {
      perLato.push(disco);
      restante = arrotonda(restante - disco);
    }
  }
  return { perLato, mancano: arrotonda(restante * 2) };
}

/** "2 × 20 + 2,5": dischi uguali raggruppati */
export function descriviDischi(perLato) {
  const gruppi = [];
  for (const disco of perLato) {
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.disco === disco) ultimo.quanti++;
    else gruppi.push({ disco, quanti: 1 });
  }
  return gruppi
    .map(({ disco, quanti }) => `${quanti > 1 ? `${quanti} × ` : ''}${String(disco).replace('.', ',')}`)
    .join(' + ');
}
