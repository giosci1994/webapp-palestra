// Script per aggiungere sedi PureGym e SATS a København
// Uso: node prisma/aggiungi-palestre-kbh.js

import prisma from '../src/config/database.js';

const NUOVE_PALESTRE = [
  // ═══ PureGym København ═══
  { nomeCatena: 'PureGym', citta: 'København K', indirizzo: 'Købmagergade 48', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København N', indirizzo: 'Esromgade 15', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København N', indirizzo: 'Farumgade 6', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København N', indirizzo: 'Jagtvej 113-115', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København NV', indirizzo: 'Emdrupvej 115A', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København NV', indirizzo: 'Rentemestervej 2', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København NV', indirizzo: 'Tomsgårdsvej 15', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Asger Jorns Allé 2 (Ørestad)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Kigkurren 1 (Bryggen)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Englandsvej 28-30', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Lergravsvej 57', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Lyongade 23-25 (Amager)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København S', indirizzo: 'Rued Langgaards Vej 2C', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København SV', indirizzo: 'Ellebjergvej 138', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København SV', indirizzo: 'Ellebjergvej 40 (Sjælør)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København V', indirizzo: 'Gasværksvej 16', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København V', indirizzo: 'Matthæusgade 48 (Vesterbrogade)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København Ø', indirizzo: 'Århusgade 102', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København Ø', indirizzo: 'Oslo Plads 2', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København Ø', indirizzo: 'Strandvejen 32F', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'København Ø', indirizzo: 'Æbeløgade 4', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Frederiksberg', indirizzo: 'C.F. Richs Vej 107', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Frederiksberg', indirizzo: 'Worsaaesvej 17 (Forum)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Frederiksberg', indirizzo: 'Helgesvej 29 (Svømmehal)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Frederiksberg', indirizzo: 'Mariendalsvej 57c', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Valby', indirizzo: 'Mosedalvej 11', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Vanløse', indirizzo: 'Skalbakken 10', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Vanløse', indirizzo: 'Apollovej 33 (Vanløsetorv)', nazione: 'Danimarca' },
  { nomeCatena: 'PureGym', citta: 'Brønshøj', indirizzo: 'Frederikssundsvej 264 (Husum)', nazione: 'Danimarca' },

  // ═══ SATS København ═══
  { nomeCatena: 'SATS', citta: 'København V', indirizzo: 'Bryghuspladsen 8 (BLOX)', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København K', indirizzo: 'Adelgade 5-7', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København Ø', indirizzo: 'Øster Allé 42 (Parken)', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København Ø', indirizzo: 'Nygårdsvej 45', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København S', indirizzo: "Arne Jacobsens Allé 12 (Field's)", nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København SV', indirizzo: 'Scandiagade 14 (Sydhavn)', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'Frederiksberg', indirizzo: 'Falkoner Allé 7', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København N', indirizzo: 'Nørrebrogade 43', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'København V', indirizzo: 'Vesterbrogade 2A (Tivoli)', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'Gentofte', indirizzo: 'Gentoftegade 29', nazione: 'Danimarca' },
  { nomeCatena: 'SATS', citta: 'Lyngby', indirizzo: 'Klampenborgvej 230', nazione: 'Danimarca' },
];

async function main() {
  let aggiunte = 0;
  let skipdate = 0;

  for (const p of NUOVE_PALESTRE) {
    // Controlla se esiste già
    const esiste = await prisma.palestra.findFirst({
      where: {
        nomeCatena: p.nomeCatena,
        citta: p.citta,
        indirizzo: p.indirizzo
      }
    });

    if (esiste) {
      skipdate++;
      continue;
    }

    await prisma.palestra.create({ data: p });
    aggiunte++;
    console.log(`  ✅ ${p.nomeCatena} — ${p.citta}, ${p.indirizzo}`);
  }

  console.log(`\n📊 Riepilogo: ${aggiunte} aggiunte, ${skipdate} già esistenti`);
  
  // Aggiorna anche le palestre esistenti che non hanno indirizzo
  const senzaIndirizzo = await prisma.palestra.findMany({
    where: { indirizzo: null }
  });
  
  if (senzaIndirizzo.length > 0) {
    console.log(`\n⚠️  ${senzaIndirizzo.length} palestre senza indirizzo:`);
    senzaIndirizzo.forEach(p => console.log(`  - [ID ${p.id}] ${p.nomeCatena} — ${p.citta}`));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
