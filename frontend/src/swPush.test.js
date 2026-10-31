// public/sw-push.js, run in a pretend service worker: what a tap on a
// notification does with the windows of the app
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const CODICE = readFileSync(new URL('../public/sw-push.js', import.meta.url), 'utf8');
const ORIGINE = 'https://palestra.test';

/** A window of the app; `risponde`: the app answers gymmaster:apri */
function finestra({ url = `${ORIGINE}/`, risponde = true, visibile = true, focused = false } = {}) {
  return {
    url,
    visibilityState: visibile ? 'visible' : 'hidden',
    focused,
    focus: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    postMessage: vi.fn((messaggio, [porta]) => {
      if (risponde) porta.postMessage({ ok: true });
    })
  };
}

/** The service worker with these windows open, and Cache Storage in memory */
function serviceWorker(finestre = []) {
  const ascoltatori = {};
  const archivio = new Map();
  const cache = {
    put: async (chiave, risposta) => { archivio.set(chiave, await risposta.text()); },
    match: async chiave => (archivio.has(chiave) ? new Response(archivio.get(chiave)) : undefined),
    delete: async chiave => archivio.delete(chiave)
  };
  const self = {
    location: { origin: ORIGINE },
    addEventListener: (tipo, gestore) => { ascoltatori[tipo] = gestore; },
    clients: { matchAll: vi.fn(async () => finestre), openWindow: vi.fn(async () => null) },
    caches: { open: async () => cache },
    registration: { showNotification: vi.fn(async () => {}) }
  };
  new Function('self', CODICE)(self);

  const tocca = async (percorso) => {
    const attese = [];
    ascoltatori.notificationclick({ notification: { close: vi.fn(), data: { percorso } }, waitUntil: p => attese.push(p) });
    await Promise.all(attese);
  };
  /** What the app asks when it starts (gymmaster:destinazione), and the answer */
  const chiediDestinazione = () => new Promise((risolvi) => {
    const canale = new MessageChannel();
    canale.port1.onmessage = (evento) => { canale.port1.close(); risolvi(evento.data.percorso); };
    ascoltatori.message({ data: { tipo: 'gymmaster:destinazione' }, ports: [canale.port2], waitUntil: () => {} });
  });
  return { self, tocca, chiediDestinazione };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a tap with the app open', () => {
  it('the window comes to the front and the app goes to the page by itself: no reload', async () => {
    // Opened from the home screen: the window's address stays "/" whatever page it shows
    const app = finestra({ url: `${ORIGINE}/` });
    const { self, tocca } = serviceWorker([app]);
    await tocca('/allenamento/12');
    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledWith({ tipo: 'gymmaster:apri', percorso: '/allenamento/12' }, expect.any(Array));
    expect(app.navigate).not.toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('a window that does not answer (an older app) is navigated to the page', async () => {
    vi.useFakeTimers();
    const vecchia = finestra({ risponde: false });
    const { tocca } = serviceWorker([vecchia]);
    const fatto = tocca('/allenamento/12');
    await vi.advanceTimersByTimeAsync(2000);
    await fatto;
    expect(vecchia.navigate).toHaveBeenCalledWith(`${ORIGINE}/allenamento/12`);
  });

  it('with more windows, the one in front', async () => {
    const dietro = finestra({ visibile: false });
    const davanti = finestra({ focused: true });
    const { tocca } = serviceWorker([dietro, davanti]);
    await tocca('/chat');
    expect(davanti.postMessage).toHaveBeenCalled();
    expect(dietro.postMessage).not.toHaveBeenCalled();
  });

  it('windows of other sites do not count', async () => {
    const altra = finestra({ url: 'https://altro.test/' });
    const { self, tocca } = serviceWorker([altra]);
    await tocca('/allenamento/12');
    expect(altra.postMessage).not.toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGINE}/allenamento/12`);
  });
});

describe('a tap with the app closed', () => {
  it('a new window opens on the page, and the app that starts can ask where to go, once', async () => {
    const { self, tocca, chiediDestinazione } = serviceWorker([]);
    await tocca('/allenamento/12');
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGINE}/allenamento/12`);
    expect(await chiediDestinazione()).toBe('/allenamento/12');
    // Asked again (the app opened later from its icon): no destination
    expect(await chiediDestinazione()).toBeNull();
  });

  it('a destination older than a minute is forgotten', async () => {
    const { tocca, chiediDestinazione } = serviceWorker([]);
    const adesso = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(adesso);
    await tocca('/allenamento/12');
    Date.now.mockReturnValue(adesso + 61 * 1000);
    expect(await chiediDestinazione()).toBeNull();
  });

  it('without a tap there is nothing to go to', async () => {
    const { chiediDestinazione } = serviceWorker([]);
    expect(await chiediDestinazione()).toBeNull();
  });
});
