// ============================================
// GymMaster — Test: database
// ============================================
//
// Il client Prisma dell'app, con una rete di sicurezza: i test d'integrazione
// svuotano il database, quindi qui si rifiuta qualunque database il cui nome
// non finisca in _test. Quello usa-e-getta lo avvia test/esegui.js.

import prisma from '../../src/config/database.js';

const nome = new URL(process.env.DATABASE_URL || 'postgresql://localhost/').pathname.slice(1);
if (!nome.endsWith('_test')) {
  throw new Error(`I test d'integrazione partono solo su un database *_test, non su "${nome}": avviali con npm test`);
}

export { prisma };

/** Svuota tutte le tabelle e fa ripartire gli id da 1 */
export async function svuotaDatabase() {
  const tabelle = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tabelle.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}
