// ============================================
// GymMaster — Script di Importazione Esercizi
// Importa esercizi dal database Functional Fitness v2.9
// Utilizzabile sia per primo import che per aggiornamenti
// ============================================

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

function caricaJSON(nomeFile) {
  const percorso = join(__dirname, 'dati', nomeFile);
  return JSON.parse(readFileSync(percorso, 'utf-8'));
}

async function main() {
  console.log('===========================================');
  console.log(' GymMaster — Importazione Esercizi');
  console.log(' Database: Functional Fitness v2.9');
  console.log('===========================================\n');

  const startTime = Date.now();

  // === 1. IMPORTA ATTREZZATURE MANCANTI ===
  console.log('[1/3] Verifica attrezzature...');
  const attrezzatureJSON = caricaJSON('attrezzature.json');
  let attrCreate = 0;

  for (const attr of attrezzatureJSON) {
    const esistente = await prisma.attrezzatura.findFirst({
      where: { nome: attr.nome }
    });

    if (!esistente) {
      await prisma.attrezzatura.create({
        data: {
          nome: attr.nome,
          categoria: attr.categoria,
          muscoliBersaglio: attr.muscoliBersaglio
        }
      });
      attrCreate++;
      console.log(`  + Attrezzatura: ${attr.nome}`);
    }
  }
  console.log(`  Attrezzature: ${attrCreate} nuove, ${attrezzatureJSON.length - attrCreate} esistenti\n`);

  // === 2. CARICA MAPPA ATTREZZATURE ===
  const tutteAttrezzature = await prisma.attrezzatura.findMany();
  const mappaAttrezzature = new Map(tutteAttrezzature.map(a => [a.nome, a.id]));

  // === 3. IMPORTA ESERCIZI ===
  console.log('[2/3] Importazione esercizi...');
  const eserciziJSON = caricaJSON('esercizi.json');

  let creati = 0;
  let aggiornati = 0;
  let invariati = 0;
  let errori = 0;
  const erroriDettaglio = [];

  // Carica tutti i nomi esistenti per check rapido
  const eserciziEsistenti = await prisma.esercizio.findMany({ select: { id: true, nome: true } });
  const mappaEsistenti = new Map(eserciziEsistenti.map(e => [e.nome, e.id]));

  for (let i = 0; i < eserciziJSON.length; i++) {
    const es = eserciziJSON[i];

    try {
      const attrezzaturaId = es.attrezzatura
        ? mappaAttrezzature.get(es.attrezzatura) || null
        : null;

      const dati = {
        nome: es.nome,
        gruppoMuscoloPrimario: es.gruppoMuscoloPrimario,
        gruppoMuscoloSecondario: es.gruppoMuscoloSecondario || null,
        attrezzaturaRichiestaId: attrezzaturaId,
        descrizione: es.descrizione || null,
        linkVideo: es.linkVideo || null,
        difficulty: es.difficulty || null,
        bodyRegion: es.bodyRegion || null,
        mechanics: es.mechanics || null,
        posture: es.posture || null,
        movementPattern: es.movementPattern || null,
        laterality: es.laterality || null,
        forceType: es.forceType || null,
        classification: es.classification || null,
      };

      const idEsistente = mappaEsistenti.get(es.nome);

      if (idEsistente) {
        // Aggiorna i campi aggiuntivi se l'esercizio esiste già
        await prisma.esercizio.update({
          where: { id: idEsistente },
          data: {
            difficulty: dati.difficulty,
            bodyRegion: dati.bodyRegion,
            mechanics: dati.mechanics,
            posture: dati.posture,
            movementPattern: dati.movementPattern,
            laterality: dati.laterality,
            forceType: dati.forceType,
            classification: dati.classification,
            linkVideo: dati.linkVideo || undefined, // Solo se ha un link
          }
        });
        aggiornati++;
      } else {
        await prisma.esercizio.create({ data: dati });
        creati++;
      }
    } catch (err) {
      errori++;
      erroriDettaglio.push({ nome: es.nome, errore: err.message });
    }

    // Progresso ogni 500 esercizi
    if ((i + 1) % 500 === 0 || i === eserciziJSON.length - 1) {
      const pct = Math.round(((i + 1) / eserciziJSON.length) * 100);
      process.stdout.write(`\r  Progresso: ${pct}% (${i + 1}/${eserciziJSON.length})`);
    }
  }
  console.log(''); // Nuova riga dopo progresso

  // === 4. COLLEGAMENTO PALESTRE-ATTREZZATURE ===
  console.log('\n[3/3] Aggiornamento collegamenti palestra-attrezzatura...');
  const tuttePalestre = await prisma.palestra.findMany();
  const tutteAttrezzatureAggiornate = await prisma.attrezzatura.findMany();
  let collegamentiCreati = 0;

  for (const palestra of tuttePalestre) {
    for (const attr of tutteAttrezzatureAggiornate) {
      const esistente = await prisma.palestraAttrezzatura.findUnique({
        where: {
          palestraId_attrezzaturaId: {
            palestraId: palestra.id,
            attrezzaturaId: attr.id
          }
        }
      });

      if (!esistente) {
        await prisma.palestraAttrezzatura.create({
          data: {
            palestraId: palestra.id,
            attrezzaturaId: attr.id
          }
        });
        collegamentiCreati++;
      }
    }
  }
  console.log(`  Collegamenti creati: ${collegamentiCreati}`);

  // === REPORT FINALE ===
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totaleFinale = await prisma.esercizio.count();
  const totaleAttr = await prisma.attrezzatura.count();

  console.log('\n===========================================');
  console.log(' REPORT IMPORTAZIONE');
  console.log('===========================================');
  console.log(`  Esercizi creati:     ${creati}`);
  console.log(`  Esercizi aggiornati: ${aggiornati}`);
  console.log(`  Errori:              ${errori}`);
  console.log(`  Attrezzature nuove:  ${attrCreate}`);
  console.log(`  Collegamenti nuovi:  ${collegamentiCreati}`);
  console.log('-------------------------------------------');
  console.log(`  Totale esercizi DB:  ${totaleFinale}`);
  console.log(`  Totale attrezzature: ${totaleAttr}`);
  console.log(`  Tempo impiegato:     ${elapsed}s`);
  console.log('===========================================\n');

  if (erroriDettaglio.length > 0) {
    console.log('ERRORI DETTAGLIO:');
    erroriDettaglio.forEach(e => console.log(`  - ${e.nome}: ${e.errore}`));
  }

  console.log('Importazione completata!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (errore) => {
    console.error('ERRORE FATALE:', errore);
    await prisma.$disconnect();
    process.exit(1);
  });
