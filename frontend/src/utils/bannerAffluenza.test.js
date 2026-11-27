import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mostraBannerAffluenza, bannerChiusoQui, segnaBannerChiuso, chiaveBannerAffluenza, ORE_MASSIME_BANNER
} from './bannerAffluenza.js';

const ADESSO = Date.parse('2026-11-27T18:00:00Z');
const ORA = 60 * 60 * 1000;
const utente = { id: 1, palestraId: 7 };
const sessione = (campi = {}) => ({
  id: 42, dataInizio: new Date(ADESSO - 20 * 60 * 1000).toISOString(), dataFine: null, affluenzaSegnalata: false, ...campi
});

describe('mostraBannerAffluenza', () => {
  it('shows it on an open workout, not reported, of a user with a gym', () => {
    expect(mostraBannerAffluenza({ sessione: sessione(), utente, adesso: ADESSO })).toBe(true);
  });

  it('does not show it without a gym or without a user', () => {
    expect(mostraBannerAffluenza({ sessione: sessione(), utente: { id: 1, palestraId: null }, adesso: ADESSO })).toBe(false);
    expect(mostraBannerAffluenza({ sessione: sessione(), utente: null, adesso: ADESSO })).toBe(false);
  });

  it('does not show it once reported, or closed on this phone', () => {
    expect(mostraBannerAffluenza({ sessione: sessione({ affluenzaSegnalata: true }), utente, adesso: ADESSO })).toBe(false);
    expect(mostraBannerAffluenza({ sessione: sessione(), utente, chiusoQui: true, adesso: ADESSO })).toBe(false);
  });

  it('shows it when the server did not say (the field is missing): the server refuses a second report', () => {
    const senzaCampo = sessione();
    delete senzaCampo.affluenzaSegnalata;
    expect(mostraBannerAffluenza({ sessione: senzaCampo, utente, adesso: ADESSO })).toBe(true);
  });

  it('does not show it on a finished workout, or one started too long ago', () => {
    expect(mostraBannerAffluenza({ sessione: sessione({ dataFine: new Date(ADESSO).toISOString() }), utente, adesso: ADESSO })).toBe(false);
    const vecchia = sessione({ dataInizio: new Date(ADESSO - ORE_MASSIME_BANNER * ORA).toISOString() });
    expect(mostraBannerAffluenza({ sessione: vecchia, utente, adesso: ADESSO })).toBe(false);
    const quasi = sessione({ dataInizio: new Date(ADESSO - ORE_MASSIME_BANNER * ORA + 60 * 1000).toISOString() });
    expect(mostraBannerAffluenza({ sessione: quasi, utente, adesso: ADESSO })).toBe(true);
  });

  it('does not show it without a session or a valid start', () => {
    expect(mostraBannerAffluenza({ sessione: null, utente, adesso: ADESSO })).toBe(false);
    expect(mostraBannerAffluenza({ sessione: sessione({ dataInizio: undefined }), utente, adesso: ADESSO })).toBe(false);
  });
});

describe('closed on this phone', () => {
  let memoria;
  beforeEach(() => {
    memoria = new Map();
    vi.stubGlobal('localStorage', {
      getItem: k => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => memoria.set(k, String(v))
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers it per workout', () => {
    expect(bannerChiusoQui(42)).toBe(false);
    segnaBannerChiuso(42);
    expect(memoria.get(chiaveBannerAffluenza(42))).toBe('1');
    expect(bannerChiusoQui(42)).toBe(true);
    expect(bannerChiusoQui(43)).toBe(false);
  });

  it('does not break when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    });
    expect(() => segnaBannerChiuso(42)).not.toThrow();
    expect(bannerChiusoQui(42)).toBe(false);
  });
});
