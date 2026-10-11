// ============================================
// GymMaster — Apply the stories of the installed version
// ============================================
//
// The release script (deploy/rilascio.sh) runs it in the backend container,
// after the restart:
//   docker compose exec -T backend node src/applica-novita.js
// The version is the one in version.json; the stories are those in
// prisma/novita.json.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from './config/database.js';
import { applicaNovita } from './services/novitaRilascio.service.js';

const cartella = path.dirname(fileURLToPath(import.meta.url));
const leggi = file => JSON.parse(readFileSync(path.resolve(cartella, file), 'utf8'));

try {
  const { versione } = leggi('../../version.json');
  const { aggiunte, presenti } = await applicaNovita(versione, leggi('../prisma/novita.json'));
  console.log(JSON.stringify({ versione, aggiunte, presenti }));
} catch (errore) {
  console.error(errore.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
