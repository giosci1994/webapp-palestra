// ============================================
// GymMaster — Avvio dei test del backend
// ============================================
//
//   npm test                unitari e d'integrazione (serve Docker)
//   npm run test:unitari    solo unitari: niente Docker, pochi secondi
//
// I test d'integrazione parlano con un Postgres e un Redis veri ma usa-e-getta:
// li avvia Docker Compose (test/docker-compose.yml) e li spegne alla fine.
// Con TEST_DATABASE_URL (e TEST_REDIS_URL) si usano invece servizi gia'
// avviati. In ogni caso il database deve chiamarsi *_test: i test lo svuotano.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'test/docker-compose.yml'];

// Ctrl+C arriva anche ai test, che si chiudono da soli: qui si ignora, cosi'
// si arriva comunque a spegnere i servizi
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});

const ambiente = {
  ...process.env,
  AMBIENTE: 'test',
  LIVELLO_LOG: process.env.LIVELLO_LOG || 'silent',
  // Segreti nuovi a ogni esecuzione
  JWT_SEGRETO_ACCESS: crypto.randomBytes(32).toString('hex'),
  JWT_SEGRETO_REFRESH: crypto.randomBytes(32).toString('hex')
};
// Durate di default dei token, e nessuna chiamata a servizi esterni (email,
// Gemini, Telegram). Il database lo decide avviaServizi().
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

/** Prepara Postgres e Redis; restituisce la funzione che li spegne */
function avviaServizi() {
  if (process.env.TEST_DATABASE_URL) {
    controllaNomeDatabase(process.env.TEST_DATABASE_URL);
    ambiente.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ambiente.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379';
    return () => {};
  }

  // Un'esecuzione interrotta di colpo puo' averli lasciati accesi
  docker('down', '--remove-orphans');
  console.log('Avvio di Postgres e Redis per i test...');
  docker('up', '--detach', '--wait');
  ambiente.DATABASE_URL = `postgresql://gymmaster:gymmaster@${docker('port', 'db', '5432')}/gymmaster_test`;
  ambiente.REDIS_URL = `redis://${docker('port', 'redis', '6379')}`;
  return () => docker('down', '--remove-orphans');
}

// La CLI di Prisma passando da node: node_modules/.bin/prisma non sempre e'
// eseguibile (per questo il Dockerfile fa chmod +x)
const CLI_PRISMA = createRequire(import.meta.url).resolve('prisma/build/index.js');
const prisma = argomenti => esegui(process.execPath, [CLI_PRISMA, ...argomenti], { mostra: false });

/**
 * Crea le tabelle con le migrazioni, come fa il backend all'avvio, e controlla
 * che il risultato sia proprio prisma/schema.prisma: una tabella creata fuori
 * dalle migrazioni (db push) o una migrazione dimenticata fanno fallire i test
 * invece di accorgersene il giorno di un'installazione nuova.
 */
function applicaMigrazioni() {
  const migrazione = prisma(['migrate', 'deploy']);
  if (migrazione.status !== 0) {
    throw new Error(`Le migrazioni non partono da un database vuoto:\n${migrazione.stdout}${migrazione.stderr}`);
  }

  // --exit-code: 0 se coincidono, 2 se ci sono differenze
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

/** I test di una cartella; node:test esegue ogni file nel suo processo */
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
    // Un file alla volta: condividono lo stesso database
    esiti.push(eseguiTest('integrazione', ['--test-concurrency=1']));
  } finally {
    spegni();
  }
}

process.exitCode = esiti.every(codice => codice === 0) ? 0 : 1;
