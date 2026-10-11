// ============================================
// GymMaster — Database configuration (Prisma)
// PrismaClient singleton with logging
// ============================================

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Singleton: avoids multiple connections during hot reload
let prisma;

if (process.env.AMBIENTE === 'produzione') {
  prisma = new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' }
    ]
  });
} else {
  // In development, reuse the connection across hot reloads
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

// Database error logging
prisma.$on('error', (e) => {
  logger.error({ erroreDb: e.message }, 'Errore database Prisma');
});

prisma.$on('warn', (e) => {
  logger.warn({ avvisoDb: e.message }, 'Avviso database Prisma');
});

export default prisma;
