// public/.well-known/assetlinks.json: the file Android reads to let the
// GymMaster app open the site without the address bar (Digital Asset Links)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACCHETTO_ANDROID } from './utils/scarica.js';

const voci = JSON.parse(readFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));

describe('assetlinks.json', () => {
  it('links the site to the Android app package', () => {
    expect(voci).toHaveLength(1);
    expect(voci[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(voci[0].target).toMatchObject({ namespace: 'android_app', package_name: PACCHETTO_ANDROID });
  });

  it('has SHA-256 fingerprints written the way Android compares them (or the placeholder)', () => {
    const impronte = voci[0].target.sha256_cert_fingerprints;
    expect(impronte.length).toBeGreaterThan(0);
    for (const impronta of impronte) {
      // Until the signing key exists the file carries a placeholder
      if (impronta.startsWith('PLACEHOLDER_')) continue;
      expect(impronta).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });
});
