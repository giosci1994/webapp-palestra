// ============================================
// GymMaster — Configurazione Database (Prisma)
// Singleton PrismaClient con logging
// ============================================

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Singleton: evita connessioni multiple durante hot-reload
let prisma;

if (process.env.AMBIENTE === 'produzione') {
  prisma = new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' }
    ]
  });
} else {
  // In sviluppo, riutilizza la connessione tra hot-reload
  if (!globalThis.__prismaClient) {
    globalThis.__prismaClient = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
      ]
    });
  }
  prisma = globalThis.__prismaClient;
}

// Logging degli errori del database
prisma.$on('error', (e) => {
  logger.error({ erroreDb: e.message }, 'Errore database Prisma');
});

prisma.$on('warn', (e) => {
  logger.warn({ avvisoDb: e.message }, 'Avviso database Prisma');
});

export default prisma;
