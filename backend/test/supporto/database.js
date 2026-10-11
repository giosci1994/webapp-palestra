// ============================================
// GymMaster — Test: database
// ============================================
//
// The app's Prisma client, with a safety net: the integration tests empty the
// database, so any database whose name does not end in _test is refused here.
// test/esegui.js starts the throwaway one.

import prisma from '../../src/config/database.js';

const nome = new URL(process.env.DATABASE_URL || 'postgresql://localhost/').pathname.slice(1);
if (!nome.endsWith('_test')) {
  throw new Error(`I test d'integrazione partono solo su un database *_test, non su "${nome}": avviali con npm test`);
}

export { prisma };

/** Empties every table and restarts the ids from 1 */
export async function svuotaDatabase() {
  const tabelle = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tabelle.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}
