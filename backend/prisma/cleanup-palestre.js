// Script per rimuovere palestre duplicate
// Uso: node prisma/cleanup-palestre.js

import prisma from '../src/config/database.js';

async function main() {
  const palestre = await prisma.palestra.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { utenti: true } } }
  });

  const visti = new Map();
  const daEliminare = [];

  for (const p of palestre) {
    const chiave = `${p.nomeCatena}|${p.citta}|${p.indirizzo}`;
    if (visti.has(chiave)) {
      daEliminare.push(p);
    } else {
      visti.set(chiave, p);
    }
  }

  console.log(`Trovate ${daEliminare.length} palestre duplicate da rimuovere:`);
  for (const p of daEliminare) {
    console.log(`  - [ID ${p.id}] ${p.nomeCatena} — ${p.citta} (${p._count.utenti} utenti)`);
  }

  if (daEliminare.length === 0) {
    console.log('Nessun duplicato trovato!');
    process.exit(0);
  }

  // Sposta utenti al primo ID (quello tenuto)
  for (const dup of daEliminare) {
    const chiave = `${dup.nomeCatena}|${dup.citta}|${dup.indirizzo}`;
    const originale = visti.get(chiave);
    
    // Aggiorna utenti che puntano al duplicato
    const aggiornati = await prisma.utente.updateMany({
      where: { palestraId: dup.id },
      data: { palestraId: originale.id }
    });
    if (aggiornati.count > 0) {
      console.log(`  Spostati ${aggiornati.count} utenti da ID ${dup.id} → ID ${originale.id}`);
    }

    // Elimina il duplicato
    await prisma.palestra.delete({ where: { id: dup.id } });
    console.log(`  ✅ Eliminata palestra duplicata ID ${dup.id}`);
  }

  console.log(`\nPulizia completata! Rimosse ${daEliminare.length} palestre duplicate.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
