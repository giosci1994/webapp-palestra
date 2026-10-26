// ============================================
// GymMaster — Cardio machines
// ============================================
//
// The cardio exercises every installation has: the seed creates the missing
// ones at every start, so the Telegram bot can always add them to a plan.
// Like the rest of the catalogue, `nome` is English and `nomeIt` Italian.
// `attrezzatura` is the name of the matching equipment
// (prisma/dati/attrezzature.json), `chiavi` the words the bot recognises the
// machine by, in Italian and English.

export const MACCHINE_CARDIO = [
  { nome: 'Treadmill', nomeIt: 'Tapis Roulant', attrezzatura: 'Tapis Roulant', chiavi: ['tapis', 'roulant', 'tappeto', 'treadmill', 'corsa', 'camminata', 'corro', 'cammino', 'corri', 'running'] },
  { nome: 'Exercise Bike', nomeIt: 'Cyclette', attrezzatura: 'Cyclette', chiavi: ['cyclette', 'ciclette', 'cyclet', 'bici', 'bike', 'spinning', 'pedala', 'pedalo'] },
  { nome: 'Elliptical', nomeIt: 'Ellittica', attrezzatura: 'Ellittica', chiavi: ['ellittica', 'elittica', 'elliptical', 'crosstrainer', 'cross trainer'] },
  { nome: 'Rowing Machine', nomeIt: 'Vogatore', attrezzatura: 'Vogatore (Rower)', chiavi: ['vogatore', 'rower', 'remo', 'rowing', 'voga'] },
  { nome: 'Stepper', nomeIt: 'Stepper', attrezzatura: 'Stepper', chiavi: ['stepper', 'step', 'scale', 'climber', 'stairs'] },
  { nome: 'Air Bike', nomeIt: 'Air Bike', attrezzatura: 'Air Bike', chiavi: ['air bike', 'airbike', 'assault', 'air-bike'] }
];

/**
 * The cardio machine a text names ("10 minuti di tapis", "treadmill"), or
 * null. The longest word found wins: "air bike" is the Air Bike, not the
 * exercise bike that "bike" alone would give.
 */
export function macchinaCardio(testo) {
  const cercato = String(testo || '').toLowerCase().trim();
  if (!cercato) return null;
  let migliore = null;
  let lunghezza = 0;
  for (const macchina of MACCHINE_CARDIO) {
    for (const parola of [...macchina.chiavi, macchina.nome.toLowerCase(), macchina.nomeIt.toLowerCase()]) {
      if (parola.length > lunghezza && cercato.includes(parola)) {
        migliore = macchina;
        lunghezza = parola.length;
      }
    }
  }
  return migliore;
}

/**
 * The exercise of a machine in the database: by its name, its Italian name,
 * or the name the seed used to give it (the equipment's, "Tapis Roulant"),
 * for a row the 20261026 migration left as it was.
 */
export const dovEsercizioCardio = macchina => ({
  OR: [{ nome: macchina.nome }, { nomeIt: macchina.nomeIt }, { nome: macchina.attrezzatura }]
});

/**
 * Creates the cardio exercises that are missing, linked to their equipment
 * when it exists. `prisma` is the caller's client (the seed has its own).
 * @returns {Promise<number>} how many it created
 */
export async function garantisciEserciziCardio(prisma) {
  let creati = 0;
  for (const macchina of MACCHINE_CARDIO) {
    const esiste = await prisma.esercizio.findFirst({ where: dovEsercizioCardio(macchina) });
    if (esiste) continue;
    const attrezzatura = await prisma.attrezzatura.findFirst({ where: { nome: macchina.attrezzatura } });
    await prisma.esercizio.create({
      data: {
        nome: macchina.nome,
        nomeIt: macchina.nomeIt,
        gruppoMuscoloPrimario: 'Cardio',
        attrezzaturaRichiestaId: attrezzatura?.id || null,
        descrizione: `Cardio machine: ${macchina.nome}`
      }
    });
    creati++;
  }
  return creati;
}
