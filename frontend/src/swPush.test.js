// The push part of the service worker (public/sw-push.js): what a tap on a
// notification does with the windows of the app.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const CODICE = readFileSync(new URL('../public/sw-push.js', import.meta.url), 'utf8');
const ORIGINE = 'https://gymmaster.test';

/** A window of the browser on `url` */
function finestra(url) {
  return { url, focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) };
}

/** Runs sw-push.js with these windows open, then taps a notification for `percorso` */
async function tocca(percorso, finestre) {
  const ascoltatori = {};
  const self = {
    location: { origin: ORIGINE },
    addEventListener: (tipo, funzione) => { ascoltatori[tipo] = funzione; },
    clients: { matchAll: async () => finestre, openWindow: vi.fn(async () => {}) },
    registration: { showNotification: vi.fn() }
  };
  new Function('self', CODICE)(self);

  let attesa;
  const evento = {
    notification: { close: vi.fn(), data: { percorso } },
    waitUntil: promessa => { attesa = promessa; }
  };
  ascoltatori.notificationclick(evento);
  await attesa;
  expect(evento.notification.close).toHaveBeenCalled();
  return self.clients.openWindow;
}

describe('tap on a notification', () => {
  it('a window already on that page only comes to the front, without reloading', async () => {
    // The end of the rest, with the workout open in the background
    const allenamento = finestra(`${ORIGINE}/allenamento/42`);
    const apri = await tocca('/allenamento/42', [allenamento]);
    expect(allenamento.focus).toHaveBeenCalled();
    expect(allenamento.navigate).not.toHaveBeenCalled();
    expect(apri).not.toHaveBeenCalled();
  });

  it('among several windows, the one already on that page', async () => {
    const chat = finestra(`${ORIGINE}/chat`);
    const allenamento = finestra(`${ORIGINE}/allenamento/42`);
    await tocca('/allenamento/42', [chat, allenamento]);
    expect(allenamento.focus).toHaveBeenCalled();
    expect(chat.focus).not.toHaveBeenCalled();
    expect(chat.navigate).not.toHaveBeenCalled();
  });

  it('a window on another page comes to the front and goes to the page', async () => {
    const dashboard = finestra(`${ORIGINE}/dashboard`);
    await tocca('/chat/7', [dashboard]);
    expect(dashboard.focus).toHaveBeenCalled();
    expect(dashboard.navigate).toHaveBeenCalledWith(`${ORIGINE}/chat/7`);
  });

  it('without windows of the app it opens one; windows of other sites do not count', async () => {
    const altroSito = finestra('https://altro.test/allenamento/42');
    const apri = await tocca('/allenamento/42', [altroSito]);
    expect(apri).toHaveBeenCalledWith(`${ORIGINE}/allenamento/42`);
    expect(altroSito.focus).not.toHaveBeenCalled();
  });
});
