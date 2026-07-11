import prisma from './src/config/database.js';

async function run() {
  console.log("Inizio generazione schede globali...");

  // 1. Trova l'utente admin
  const admin = await prisma.utente.findFirst({
    where: { ruolo: 'SUPERADMIN' }
  });

  if (!admin) {
    console.error("Errore: nessun utente SUPERADMIN trovato.");
    return;
  }

  console.log(`Usando admin ID ${admin.id} come creatore.`);

  // 2. Fetch esercizi dal database
  const esercizi = await prisma.esercizio.findMany();
  if (esercizi.length === 0) {
    console.error("Nessun esercizio nel database!");
    return;
  }

  // Helper per trovare esercizio per nome o gruppo
  const trovaEs = (nome, gruppo) => {
    return esercizi.find(e => e.nome.toLowerCase().includes(nome.toLowerCase())) 
        || esercizi.find(e => e.gruppoMuscoloPrimario === gruppo)
        || esercizi[0];
  };

  // 3. Definisci le schede
  const schedeDaCreare = [
    {
      titolo: "Full Body Principiante",
      descrizione: "L'allenamento perfetto per chi inizia. Coinvolge tutto il corpo per costruire una base solida.",
      livello: "BASE",
      visibilita: "GLOBALE",
      creatoreId: admin.id,
      esercizi: [
        { es: trovaEs('squat', 'Gambe'), serie: 3, rep: '10-12', rec: 90 },
        { es: trovaEs('panca', 'Petto'), serie: 3, rep: '10-12', rec: 90 },
        { es: trovaEs('lat', 'Dorso'), serie: 3, rep: '10-12', rec: 90 },
        { es: trovaEs('lento', 'Spalle'), serie: 3, rep: '10-12', rec: 90 },
        { es: trovaEs('curl', 'Bicipiti'), serie: 2, rep: '12-15', rec: 60 }
      ]
    },
    {
      titolo: "Split: Upper Body",
      descrizione: "Allenamento mirato per la parte superiore del corpo. Petto, Dorso e Braccia.",
      livello: "INTERMEDIO",
      visibilita: "GLOBALE",
      creatoreId: admin.id,
      esercizi: [
        { es: trovaEs('panca', 'Petto'), serie: 4, rep: '8-10', rec: 120 },
        { es: trovaEs('rematore', 'Dorso'), serie: 4, rep: '8-10', rec: 120 },
        { es: trovaEs('croci', 'Petto'), serie: 3, rep: '12', rec: 90 },
        { es: trovaEs('pulldown', 'Dorso'), serie: 3, rep: '12', rec: 90 },
        { es: trovaEs('curl', 'Bicipiti'), serie: 3, rep: '12-15', rec: 60 },
        { es: trovaEs('pushdown', 'Tricipiti'), serie: 3, rep: '12-15', rec: 60 }
      ]
    },
    {
      titolo: "Split: Lower Body & Core",
      descrizione: "Gambe e Addome. Costruisci potenza e stabilità.",
      livello: "INTERMEDIO",
      visibilita: "GLOBALE",
      creatoreId: admin.id,
      esercizi: [
        { es: trovaEs('squat', 'Gambe'), serie: 4, rep: '8-10', rec: 120 },
        { es: trovaEs('leg press', 'Gambe'), serie: 3, rep: '10-12', rec: 90 },
        { es: trovaEs('leg curl', 'Gambe'), serie: 3, rep: '12-15', rec: 60 },
        { es: trovaEs('calf', 'Gambe'), serie: 4, rep: '15-20', rec: 60 },
        { es: trovaEs('crunch', 'Addome'), serie: 3, rep: '15-20', rec: 60 }
      ]
    }
  ];

  // 4. Inserimento
  for (const s of schedeDaCreare) {
    // Controlla se esiste già
    const esiste = await prisma.schedaAllenamento.findFirst({ where: { titolo: s.titolo } });
    if (esiste) {
      console.log(`Scheda "${s.titolo}" già esistente, salto.`);
      continue;
    }

    const creata = await prisma.schedaAllenamento.create({
      data: {
        titolo: s.titolo,
        descrizione: s.descrizione,
        livello: s.livello,
        visibilita: s.visibilita,
        creatoreId: s.creatoreId,
        esercizi: {
          create: s.esercizi.map((e, i) => ({
            esercizioId: e.es.id,
            serieTarget: e.serie,
            repTarget: e.rep,
            recuperoSecondi: e.rec,
            ordineEsecuzione: i + 1
          }))
        }
      }
    });
    console.log(`✅ Creata scheda globale: ${creata.titolo}`);
  }

  console.log("Fatto!");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
