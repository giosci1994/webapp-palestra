import { describe, it, expect, vi } from 'vitest';
import { aggiornaApp } from './aggiornamento.js';

function ambiente({ registrazioni = [], cache = ['workbox-precache-v2', 'immagini'], getRegistrations } = {}) {
  return {
    navigator: { serviceWorker: { getRegistrations: getRegistrations || (async () => registrazioni) } },
    caches: { keys: vi.fn(async () => cache), delete: vi.fn(async () => true) },
    location: { reload: vi.fn() }
  };
}

function registrazione({ inAttesa = false } = {}) {
  return {
    update: vi.fn(async () => {}),
    unregister: vi.fn(async () => true),
    waiting: inAttesa ? { postMessage: vi.fn() } : null
  };
}

describe('aggiornaApp', () => {
  it('aggiorna il service worker senza cancellarlo: le iscrizioni push restano', async () => {
    const reg = registrazione({ inAttesa: true });
    const amb = ambiente({ registrazioni: [reg] });
    await aggiornaApp(amb);
    expect(reg.update).toHaveBeenCalled();
    expect(reg.unregister).not.toHaveBeenCalled();
    expect(reg.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('svuota tutte le cache e ricarica la pagina', async () => {
    const amb = ambiente({ registrazioni: [registrazione()] });
    await aggiornaApp(amb);
    expect(amb.caches.delete).toHaveBeenCalledTimes(2);
    expect(amb.caches.delete).toHaveBeenCalledWith('workbox-precache-v2');
    expect(amb.location.reload).toHaveBeenCalledTimes(1);
  });

  it('ricarica anche se il service worker non risponde o manca', async () => {
    const guasto = ambiente({ getRegistrations: async () => { throw new Error('SW non disponibile'); } });
    await aggiornaApp(guasto);
    expect(guasto.location.reload).toHaveBeenCalledTimes(1);

    const reg = registrazione();
    reg.update.mockRejectedValue(new Error('offline'));
    const offline = ambiente({ registrazioni: [reg] });
    await aggiornaApp(offline);
    expect(offline.caches.delete).toHaveBeenCalled();
    expect(offline.location.reload).toHaveBeenCalledTimes(1);

    const senzaSW = { caches: undefined, navigator: {}, location: { reload: vi.fn() } };
    await aggiornaApp(senzaSW);
    expect(senzaSW.location.reload).toHaveBeenCalledTimes(1);
  });
});
