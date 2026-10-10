// Vitest: i test accanto al codice (src/**/*.test.js).
// Configurazione separata da vite.config.js: ai test non servono la PWA ne'
// la versione dell'app.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    // Funzioni pure per ora: niente DOM simulato
    environment: 'node',
    // Il fuso di chi usa l'app, qualunque sia quello della macchina dei test
    env: { TZ: 'Europe/Rome' }
  }
});
