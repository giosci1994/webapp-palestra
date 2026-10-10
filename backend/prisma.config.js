// ============================================
// GymMaster — Configurazione di Prisma
// ============================================
//
// Prima stava in package.json ("prisma": { "seed": ... }), che Prisma 7 non
// leggera' piu'. Con un file di configurazione Prisma non carica da solo il
// .env: lo fa dotenv, come in src/server.js. Le variabili gia' impostate (dal
// compose, dai test) restano quelle.

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js'
  }
});
