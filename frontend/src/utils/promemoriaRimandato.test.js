import { describe, it, expect } from 'vitest';
import { rimandaPromemoria, promemoriaDaMostrare } from './promemoriaRimandato.js';

/** An in-memory localStorage; `rotto` makes every access fail */
function archivioFinto({ rotto = false } = {}) {
  const valori = new Map();
  return {
    getItem: k => { if (rotto) throw new Error('SecurityError'); return valori.has(k) ? valori.get(k) : null; },
    setItem: (k, v) => { if (rotto) throw new Error('QuotaExceededError'); valori.set(k, String(v)); }
  };
}

const oggi = (...id) => ({ data: '2026-10-11', allenamenti: id.map(n => ({ id: n })) });

describe('today\'s reminder put off for the day', () => {
  it('shows when there is a workout and it was not put off', () => {
    expect(promemoriaDaMostrare(oggi(1), archivioFinto())).toBe(true);
  });

  it('shows nothing without workouts', () => {
    const archivio = archivioFinto();
    expect(promemoriaDaMostrare(oggi(), archivio)).toBe(false);
    expect(promemoriaDaMostrare(null, archivio)).toBe(false);
  });

  it('"Later" keeps it closed for the rest of the day', () => {
    const archivio = archivioFinto();
    rimandaPromemoria(oggi(1, 2), archivio);
    expect(promemoriaDaMostrare(oggi(1, 2), archivio)).toBe(false);
    // One of the two done or moved: still nothing new
    expect(promemoriaDaMostrare(oggi(2), archivio)).toBe(false);
  });

  it('shows again the next day', () => {
    const archivio = archivioFinto();
    rimandaPromemoria(oggi(1), archivio);
    expect(promemoriaDaMostrare({ data: '2026-10-12', allenamenti: [{ id: 1 }] }, archivio)).toBe(true);
  });

  it('shows again for a workout added after it was put off', () => {
    const archivio = archivioFinto();
    rimandaPromemoria(oggi(1), archivio);
    expect(promemoriaDaMostrare(oggi(1, 3), archivio)).toBe(true);
  });

  it('without storage it keeps working, and shows', () => {
    const archivio = archivioFinto({ rotto: true });
    expect(() => rimandaPromemoria(oggi(1), archivio)).not.toThrow();
    expect(promemoriaDaMostrare(oggi(1), archivio)).toBe(true);
    expect(promemoriaDaMostrare(oggi(1), null)).toBe(true);
  });

  it('a corrupted value shows the reminder', () => {
    const archivio = archivioFinto();
    archivio.setItem('gymmaster_promemoria_rimandato', '{not json');
    expect(promemoriaDaMostrare(oggi(1), archivio)).toBe(true);
  });
});
