import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ottieniUltimaRotta, ROTTE_ESCLUSE } from './useRottaPersistente.js';

const CHIAVE = 'gymmaster_ultima_rotta';

describe('ottieniUltimaRotta', () => {
  // The tests run in node: an in-memory localStorage
  beforeEach(() => {
    const valori = new Map();
    vi.stubGlobal('localStorage', {
      getItem: k => (valori.has(k) ? valori.get(k) : null),
      setItem: (k, v) => valori.set(k, String(v))
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nothing saved: null', () => {
    expect(ottieniUltimaRotta()).toBeNull();
  });

  it('a page of the app: restored', () => {
    localStorage.setItem(CHIAVE, '/schede');
    expect(ottieniUltimaRotta()).toBe('/schede');
  });

  it('the download and legal pages are never restored (no loop on "Back to the app")', () => {
    for (const rotta of ['/scarica', '/privacy', '/cookie-policy', '/termini']) {
      expect(ROTTE_ESCLUSE).toContain(rotta);
      localStorage.setItem(CHIAVE, rotta);
      expect(ottieniUltimaRotta()).toBeNull();
    }
  });
});
