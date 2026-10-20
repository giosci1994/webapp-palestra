// Vitest: tests next to the code (src/**/*.test.{js,jsx}).
// Configuration separate from vite.config.js: the tests need neither the PWA
// nor the app version.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    // Pure functions for now: no simulated DOM
    environment: 'node',
    // The time zone of the app's users, whatever the test machine's is
    env: { TZ: 'Europe/Rome' },
    // The app loads only the language in use; the tests need them all
    setupFiles: ['./src/i18n/preparaTest.js']
  }
});
