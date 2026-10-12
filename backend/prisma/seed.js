// ============================================
// GymMaster — Initial seeding script
// Fills the database with the base data
// ============================================

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { datiEsercizioCatalogo } from '../src/utils/catalogoEsercizi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// --- Load JSON files ---
function caricaJSON(nomeFile) {
  const percorso = join(__dirname, 'dati', nomeFile);
  return JSON.parse(readFileSync(percorso, 'utf-8'));
}

// Basic cardio exercises, linked to the CARDIO equipment.
// Guaranteed at every startup (even when the guard skips the full seed),
// so the Telegram bot can add them to plans.
async function garantisciEserciziCardio() {
  const cardio = ['Tapis Roulant', 'Cyclette', 'Ellittica', 'Vogatore (Rower)', 'Stepper', 'Air Bike'];
  let creati = 0;
  for (const nome of cardio) {
    const esiste = await prisma.esercizio.findFirst({ where: { nome } });
    if (esiste) continue;
    const attr = await prisma.attrezzatura.findFirst({ where: { nome } });
    await prisma.esercizio.create({
      data: {
        nome,
        gruppoMuscoloPrimario: 'Cardio',
        attrezzaturaRichiestaId: attr?.id || null,
        descrizione: `Macchina cardio: ${nome}`
      }
    });
    creati++;
  }
  if (creati > 0) console.log(`✅ Esercizi cardio garantiti: ${creati} creati`);
}

// Creates the first in-app "what's new" story (Telegram bot) only if the table
// is empty, so the admin can later edit/delete it without it being recreated.
async function garantisciNovitaIniziale() {
  const count = await prisma.novita.count();
  if (count > 0) return;
  await prisma.novita.create({
    data: {
      titolo: 'Il bot Telegram è arrivato',
      sottotitolo: 'Crea e consulta le tue schede direttamente da Telegram',
      icona: '🤖',
      punti: JSON.stringify([
        { icona: '💬', testo: 'Crea schede parlando col bot mentre ti alleni' },
        { icona: '📋', testo: 'Leggi e scarica le tue schede ovunque' },
        { icona: '🔥', testo: 'Aggiungi cardio e riscaldamento a voce' }
      ]),
      ctaTesto: 'Collega Telegram',
      ctaRotta: '/profilo',
      // The English version: the app shows it to English users
      traduzioni: JSON.stringify({
        en: {
          titolo: 'The Telegram bot is here',
          sottotitolo: 'Create and check your plans right from Telegram',
          punti: [
            { icona: '💬', testo: 'Create plans by chatting with the bot while you train' },
            { icona: '📋', testo: 'Read and download your plans anywhere' },
            { icona: '🔥', testo: 'Add cardio and warm-up by typing' }
          ],
          ctaTesto: 'Link Telegram'
        }
      }),
      coloreInizio: '#8b5cf6',
      coloreFine: '#06b6d4',
      attiva: true,
      ordine: 0
    }
  });
  console.log('✅ Novità iniziale (bot Telegram) creata');
}

async function main() {
  console.log('🌱 Inizio seeding del database GymMaster...\n');

  // Load the datasets only once (reused by the guard and by the sections)
  const attrezzatureJSON = caricaJSON('attrezzature.json');
  const palestreJSON = caricaJSON('palestre.json');
  const eserciziJSON = caricaJSON('esercizi.json');

  // Always guarantee the cardio exercises and the first story (even if the guard skips the rest)
  await garantisciEserciziCardio();
  await garantisciNovitaIniziale();

  // --- Idempotency guard ---
  // The seed runs at every container start: if the DB is already populated,
  // exit right away to avoid thousands of existence-check queries at every
  // restart. If a dataset grows, the counts do not match and the seed (which is
  // idempotent anyway) runs again, importing only the missing entries.
  const [numAttrezzature, numPalestre, numEsercizi, numAdmin] = await Promise.all([
    prisma.attrezzatura.count(),
    prisma.palestra.count(),
    prisma.esercizio.count(),
    prisma.utente.count({ where: { ruolo: 'SUPERADMIN' } })
  ]);

  if (
    numAdmin > 0 &&
    numAttrezzature >= attrezzatureJSON.length &&
    numPalestre >= palestreJSON.length &&
    numEsercizi >= eserciziJSON.length
  ) {
    console.log('✅ Database già popolato — seeding saltato (nessuna modifica).');
    return;
  }

  // === 1. SUPERADMIN ===
  const emailAdmin = process.env.SUPERADMIN_EMAIL || 'admin@gymmaster.local';
  const passwordAdmin = process.env.SUPERADMIN_PASSWORD || 'AdminGymMaster2024!';
  const nomeAdmin = process.env.SUPERADMIN_NOME || 'Amministratore';

  const adminEsistente = await prisma.utente.findUnique({
    where: { email: emailAdmin }
  });

  if (!adminEsistente) {
    const hashPassword = await argon2.hash(passwordAdmin, {
      type: argon2.argon2id,
      memoryCost: 65536,  // 64 MB
      timeCost: 3,
      parallelism: 4
    });

    await prisma.utente.create({
      data: {
        email: emailAdmin,
        passwordHash: hashPassword,
        nome: nomeAdmin,
        ruolo: 'SUPERADMIN',
        stato: 'ATTIVO',
        puntiEsperienza: 0
      }
    });
    console.log(`✅ SuperAdmin creato: ${emailAdmin}`);
  } else {
    console.log(`⏭️  SuperAdmin già esistente: ${emailAdmin}`);
  }

  // === 2. EQUIPMENT ===
  let attrezzatureCreate = 0;

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
      attrezzatureCreate++;
    }
  }
  console.log(`✅ Attrezzature: ${attrezzatureCreate} create (${attrezzatureJSON.length - attrezzatureCreate} già esistenti)`);

  // === 3. GYMS ===
  let palestreCreate = 0;

  for (const pal of palestreJSON) {
    const esistente = await prisma.palestra.findFirst({
      where: {
        nomeCatena: pal.nomeCatena,
        citta: pal.citta,
        indirizzo: pal.indirizzo
      }
    });

    if (!esistente) {
      await prisma.palestra.create({
        data: {
          nomeCatena: pal.nomeCatena,
          citta: pal.citta,
          indirizzo: pal.indirizzo,
          nazione: pal.nazione || 'Italia'
        }
      });
      palestreCreate++;
    }
  }
  console.log(`✅ Palestre: ${palestreCreate} create (${palestreJSON.length - palestreCreate} già esistenti)`);

  // === 4. EXERCISES (3,242 from the Functional Fitness v2.9 database) ===
  let eserciziCreati = 0;
  let eserciziSkipped = 0;

  // Load the equipment map for the FK link
  const tutteAttrezzature = await prisma.attrezzatura.findMany();
  const mappaAttrezzature = new Map(tutteAttrezzature.map(a => [a.nome, a.id]));

  // Import in batches of 50 for performance
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < eserciziJSON.length; i += BATCH_SIZE) {
    batches.push(eserciziJSON.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 Importazione ${eserciziJSON.length} esercizi in ${batches.length} batch...`);

  for (const [batchIdx, batch] of batches.entries()) {
    for (const es of batch) {
      const esistente = await prisma.esercizio.findFirst({
        where: { nome: es.nome }
      });

      if (!esistente) {
        const attrezzaturaId = es.attrezzatura
          ? mappaAttrezzature.get(es.attrezzatura) || null
          : null;

        // With the Italian name too (src/utils/catalogoEsercizi.js)
        await prisma.esercizio.create({ data: datiEsercizioCatalogo(es, attrezzaturaId) });
        eserciziCreati++;
      } else {
        eserciziSkipped++;
      }
    }

    // Progress every 10 batches
    if ((batchIdx + 1) % 10 === 0 || batchIdx === batches.length - 1) {
      const progresso = Math.round(((batchIdx + 1) / batches.length) * 100);
      console.log(`  📊 Progresso: ${progresso}% (${eserciziCreati} creati, ${eserciziSkipped} esistenti)`);
    }
  }

  console.log(`✅ Esercizi: ${eserciziCreati} creati (${eserciziSkipped} già esistenti)`);

  // === 5. GYM-EQUIPMENT LINKS ===
  // Every gym has all the equipment by default
  const tuttePalestre = await prisma.palestra.findMany();
  const tutteAttrezzatureIds = tutteAttrezzature.map(a => a.id);
  let collegamentiCreati = 0;

  for (const palestra of tuttePalestre) {
    for (const attrezzaturaId of tutteAttrezzatureIds) {
      const esistente = await prisma.palestraAttrezzatura.findUnique({
        where: {
          palestraId_attrezzaturaId: {
            palestraId: palestra.id,
            attrezzaturaId: attrezzaturaId
          }
        }
      });

      if (!esistente) {
        await prisma.palestraAttrezzatura.create({
          data: {
            palestraId: palestra.id,
            attrezzaturaId: attrezzaturaId
          }
        });
        collegamentiCreati++;
      }
    }
  }
  console.log(`✅ Collegamenti palestra-attrezzatura: ${collegamentiCreati} creati`);

  // === 6. GLOBAL WORKOUT PLANS ===
  const admin = await prisma.utente.findFirst({ where: { ruolo: 'SUPERADMIN' } });
  if (admin) {
    const tuttiEsercizi = await prisma.esercizio.findMany();
    const trovaEs = (nome, gruppo) => {
      return tuttiEsercizi.find(e => e.nome.toLowerCase().includes(nome.toLowerCase())) 
          || tuttiEsercizi.find(e => e.gruppoMuscoloPrimario === gruppo)
          || tuttiEsercizi[0];
    };

    const schedeDaCreare = [
      {
        titolo: "Full Body Principiante",
        descrizione: "L'allenamento perfetto per chi inizia. Coinvolge tutto il corpo per costruire una base solida.",
        livello: "BASE",
        visibilita: "GLOBALE",
        creatoreId: admin.id,
        esercizi: [
          { es: trovaEs('squat', 'Quadricipiti'), serie: 3, rep: '10-12', rec: 90 },
          { es: trovaEs('bench press', 'Petto'), serie: 3, rep: '10-12', rec: 90 },
          { es: trovaEs('lat pulldown', 'Schiena'), serie: 3, rep: '10-12', rec: 90 },
          { es: trovaEs('overhead press', 'Spalle'), serie: 3, rep: '10-12', rec: 90 },
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
          { es: trovaEs('bench press', 'Petto'), serie: 4, rep: '8-10', rec: 120 },
          { es: trovaEs('row', 'Schiena'), serie: 4, rep: '8-10', rec: 120 },
          { es: trovaEs('fly', 'Petto'), serie: 3, rep: '12', rec: 90 },
          { es: trovaEs('pulldown', 'Schiena'), serie: 3, rep: '12', rec: 90 },
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
          { es: trovaEs('squat', 'Quadricipiti'), serie: 4, rep: '8-10', rec: 120 },
          { es: trovaEs('leg press', 'Quadricipiti'), serie: 3, rep: '10-12', rec: 90 },
          { es: trovaEs('leg curl', 'Femorali'), serie: 3, rep: '12-15', rec: 60 },
          { es: trovaEs('calf', 'Polpacci'), serie: 4, rep: '15-20', rec: 60 },
          { es: trovaEs('crunch', 'Addominali'), serie: 3, rep: '15-20', rec: 60 }
        ]
      }
    ];

    let schedeCreate = 0;
    for (const s of schedeDaCreare) {
      if (!s.esercizi[0].es) continue; // Skip if no exercises are found
      const esiste = await prisma.schedaAllenamento.findFirst({ where: { titolo: s.titolo } });
      if (!esiste) {
        await prisma.schedaAllenamento.create({
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
        schedeCreate++;
      }
    }
    console.log(`✅ Schede globali: ${schedeCreate} create`);
  }

  console.log('\n🎉 Seeding completato con successo!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (errore) => {
    console.error('❌ Errore durante il seeding:', errore);
    await prisma.$disconnect();
    process.exit(1);
  });
