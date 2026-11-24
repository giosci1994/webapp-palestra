// The API client: only a 401/403 to the renewal ends the session; no network
// and server errors leave the user signed in (docs/offline-and-sessions.md)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, impostaToken, cancellaToken, impostaGestoreSessioneScaduta, scaricaFile } from './api.js';
import { traduci } from '../i18n/index.js';

const json = (stato, corpo) => new Response(JSON.stringify(corpo), {
  status: stato, headers: { 'content-type': 'application/json' }
});
const rinnovato = () => json(200, { dati: { accessToken: 'nuovo' } });
const senzaRete = () => Promise.reject(new TypeError('Failed to fetch'));

/** fetch that answers the given responses in order (functions are called) */
function rispondi(...risposte) {
  const finto = vi.fn(async () => {
    const r = risposte.shift();
    return typeof r === 'function' ? r() : r;
  });
  vi.stubGlobal('fetch', finto);
  return finto;
}

let scaduta;
beforeEach(() => {
  impostaToken('vecchio');
  scaduta = vi.fn();
  impostaGestoreSessioneScaduta(scaduta);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cancellaToken();
});

describe('renewing the session after a 401', () => {
  it('a renewed token retries the request', async () => {
    const fetch = rispondi(json(401, {}), rinnovato(), json(200, { dati: 1 }));
    expect(await api.get('/x')).toEqual({ dati: 1 });
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer nuovo');
    expect(scaduta).not.toHaveBeenCalled();
  });

  it.each([401, 403])('a %i to the renewal ends the session', async (stato) => {
    rispondi(json(401, {}), json(stato, {}));
    await expect(api.get('/x')).rejects.toMatchObject({ codice: 'SESSIONE_SCADUTA' });
    expect(scaduta).toHaveBeenCalledOnce();
  });

  it.each([500, 502, 503, 429])('a %i to the renewal does not end it', async (stato) => {
    rispondi(json(401, {}), json(stato, {}));
    await expect(api.get('/x')).rejects.toMatchObject({ stato });
    expect(scaduta).not.toHaveBeenCalled();
  });

  it('no network during the renewal does not end it', async () => {
    rispondi(json(401, {}), senzaRete);
    const errore = await api.get('/x').catch(e => e);
    expect(errore).toBeInstanceOf(TypeError);
    expect(errore.codice).toBe('SENZA_RETE');
    expect(scaduta).not.toHaveBeenCalled();
  });

  it('a renewal answered with something other than JSON does not end it', async () => {
    rispondi(json(401, {}), new Response('<html>', { status: 200 }));
    await expect(api.get('/x')).rejects.toMatchObject({ stato: 502 });
    expect(scaduta).not.toHaveBeenCalled();
  });
});

describe('no network', () => {
  it('becomes a TypeError with the app\'s message', async () => {
    rispondi(senzaRete);
    const errore = await api.get('/x').catch(e => e);
    expect(errore).toBeInstanceOf(TypeError);
    expect(errore.message).toBe(traduci('api.senzaRete'));
    expect(errore.message).not.toBe('Failed to fetch');
  });

  it('an abort is not turned into "no network"', async () => {
    const interrotta = new DOMException('Aborted', 'AbortError');
    rispondi(() => Promise.reject(interrotta));
    await expect(api.get('/x')).rejects.toBe(interrotta);
  });
});

describe('downloading a file', () => {
  it('revokes the object URL a little after the click, not right away', async () => {
    vi.useFakeTimers();
    const link = { click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    const revoca = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:prova', revokeObjectURL: revoca });
    rispondi(new Response('dati', { status: 200, headers: { 'content-disposition': 'attachment; filename="scheda.docx"' } }));

    expect(await scaricaFile('/schede/1/docx')).toBe('scheda.docx');
    expect(link.click).toHaveBeenCalled();
    expect(revoca).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(revoca).toHaveBeenCalledWith('blob:prova');
  });
});
