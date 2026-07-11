// ============================================
// GymMaster — Script di Build con Auto-Versioning
// Incrementa la versione patch ad ogni build
// Uso: node build.js [major|minor|patch]
// ============================================

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSIONE_PATH = resolve(__dirname, 'version.json');

// Leggi version.json
const versionData = JSON.parse(readFileSync(VERSIONE_PATH, 'utf-8'));

// Determina il tipo di bump (default: patch)
const tipo = process.argv[2] || 'patch';
const [major, minor, patch] = versionData.versione.split('.').map(Number);

let nuovaVersione;
switch (tipo) {
  case 'major':
    nuovaVersione = `${major + 1}.0.0`;
    break;
  case 'minor':
    nuovaVersione = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    nuovaVersione = `${major}.${minor}.${patch + 1}`;
    break;
}

// Aggiorna version.json
const oggi = new Date().toISOString().split('T')[0];
versionData.versione = nuovaVersione;
versionData.build = oggi;

// Se la versione è nuova, aggiungi entry changelog vuota (editabile manualmente)
if (!versionData.changelog.find(c => c.versione === nuovaVersione)) {
  versionData.changelog.unshift({
    versione: nuovaVersione,
    data: oggi,
    modifiche: ['Build automatica']
  });
}

writeFileSync(VERSIONE_PATH, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');

console.log(`\n⚡ GymMaster — Versione aggiornata: ${nuovaVersione} (${oggi})\n`);

// Build frontend
console.log('📦 Build frontend in corso...');
try {
  execSync('node node_modules/vite/bin/vite.js build', { cwd: resolve(__dirname, 'frontend'), stdio: 'inherit' });
  console.log('✅ Frontend buildato con successo!\n');
  
  // Copia version.json nella dist per il check auto-aggiornamento
  const versionSrc = resolve(__dirname, 'version.json');
  const versionDst = resolve(__dirname, 'frontend', 'dist', 'version.json');
  copyFileSync(versionSrc, versionDst);
  console.log('📋 version.json copiato in dist/\n');
} catch (err) {
  console.error('❌ Errore nel build frontend');
  process.exit(1);
}

console.log(`🚀 Pronto per il deploy: docker compose up -d --build backend && docker compose up -d --force-recreate nginx\n`);
