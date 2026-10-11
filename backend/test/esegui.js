// ============================================
// GymMaster — Backend test runner
// ============================================
//
//   npm test                unit and integration tests (needs Docker)
//   npm run test:unitari    unit tests only: no Docker, a few seconds
//
// The integration tests talk to a real but throwaway Postgres and Redis:
// Docker Compose (test/docker-compose.yml) starts them and stops them at the
// end. With TEST_DATABASE_URL (and TEST_REDIS_URL) services that are already
// running are used instead. Either way the database must be named *_test: the
// tests empty it.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'test/docker-compose.yml'];

// Ctrl+C reaches the tests too, and they exit on their own: here it is
// ignored, so we still get to stop the services
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});

const ambiente = {
  ...process.env,
  AMBIENTE: 'test',
  LIVELLO_LOG: process.env.LIVELLO_LOG || 'silent',
  // The test passkeys are created for a test domain
  APP_URL: 'https://palestra.test',
  // New secrets on every run
  JWT_SEGRETO_ACCESS: crypto.randomBytes(32).toString('hex'),
  JWT_SEGRETO_REFRESH: crypto.randomBytes(32).toString('hex')
};
// Default token lifetimes, and no calls to external services (email, Gemini,
// Telegram). avviaServizi() picks the database.
for (const chiave of [
  'JWT_SCADENZA_ACCESS', 'JWT_SCADENZA_REFRESH', 'RESEND_API_KEY', 'GEMINI_API_KEY',
  'TELEGRAM_BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'
]) {
  delete ambiente[chiave];
}

function esegui(comando, argomenti, { mostra = true } = {}) {
  const esito = spawnSync(comando, argomenti, {
    cwd: BACKEND, env: ambiente, encoding: 'utf8', stdio: mostra ? 'inherit' : 'pipe'
  });
  if (esito.error) throw esito.error;
  return esito;
}

function docker(...argomenti) {
  let esito;
  try {
    esito = esegui('docker', [...COMPOSE, ...argomenti], { mostra: false });
  } catch (errore) {
    if (errore.code === 'ENOENT') {
      throw new Error('Docker non trovato: i test d\'integrazione ne hanno bisogno. Senza Docker: npm run test:unitari');
    }
    throw errore;
  }
  if (esito.status !== 0) throw new Error(`docker compose ${argomenti.join(' ')} non riuscito:\n${esito.stderr}`);
  return esito.stdout.trim();
}

function controllaNomeDatabase(url) {
  const nome = new URL(url).pathname.slice(1);
  if (!nome.endsWith('_test')) {
    throw new Error(`I test svuotano il database: ne serve uno che finisca in _test, non "${nome}"`);
  }
}

/** Sets up Postgres and Redis; returns the function that stops them */
function avviaServizi() {
  if (process.env.TEST_DATABASE_URL) {
    controllaNomeDatabase(process.env.TEST_DATABASE_URL);
    ambiente.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ambiente.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379';
    return () => {};
  }

  // A run that was cut short may have left them running
  docker('down', '--remove-orphans');
  console.log('Avvio di Postgres e Redis per i test...');
  docker('up', '--detach', '--wait');
  ambiente.DATABASE_URL = `postgresql://gymmaster:gymmaster@${docker('port', 'db', '5432')}/gymmaster_test`;
  ambiente.REDIS_URL = `redis://${docker('port', 'redis', '6379')}`;
  return () => docker('down', '--remove-orphans');
}

// The Prisma CLI run through node: node_modules/.bin/prisma is not always
// executable (that is why the Dockerfile runs chmod +x)
const CLI_PRISMA = createRequire(import.meta.url).resolve('prisma/build/index.js');
const prisma = argomenti => esegui(process.execPath, [CLI_PRISMA, ...argomenti], { mostra: false });

/**
 * Creates the tables with the migrations, as the backend does at startup, and
 * checks that the result is exactly prisma/schema.prisma: a table created
 * outside the migrations (db push) or a forgotten migration makes the tests
 * fail, instead of being found out the day of a fresh install.
 */
function applicaMigrazioni() {
  const migrazione = prisma(['migrate', 'deploy']);
  if (migrazione.status !== 0) {
    throw new Error(`Le migrazioni non partono da un database vuoto:\n${migrazione.stdout}${migrazione.stderr}`);
  }

  // --exit-code: 0 if they match, 2 if there are differences
  const differenze = prisma([
    'migrate', 'diff', '--from-url', ambiente.DATABASE_URL,
    '--to-schema-datamodel', 'prisma/schema.prisma', '--script', '--exit-code'
  ]);
  if (differenze.status !== 0) {
    throw new Error(
      'Le migrazioni non producono prisma/schema.prisma. Manca una migrazione per:\n' +
      `${differenze.stdout}${differenze.stderr}`
    );
  }
}

/** The tests of a folder; node:test runs each file in its own process */
function eseguiTest(cartella, opzioni = []) {
  return esegui(process.execPath, [
    '--test', '--test-reporter=spec', '--test-force-exit', ...opzioni, `test/${cartella}/**/*.test.js`
  ]).status;
}

const esiti = [eseguiTest('unitari')];

if (!process.argv.includes('--solo-unitari')) {
  const spegni = avviaServizi();
  try {
    applicaMigrazioni();
    // One file at a time: they share the same database
    esiti.push(eseguiTest('integrazione', ['--test-concurrency=1']));
  } finally {
    spegni();
  }
}

process.exitCode = esiti.every(codice => codice === 0) ? 0 : 1;
