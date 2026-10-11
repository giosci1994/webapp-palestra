// ============================================
// GymMaster — Prisma configuration
// ============================================
//
// This used to live in package.json ("prisma": { "seed": ... }), which Prisma 7
// will no longer read. With a configuration file Prisma does not load the .env
// by itself: dotenv does it, as in src/server.js. Variables that are already
// set (by compose, by the tests) keep their values.

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js'
  }
});
