import { describe, it, expect } from 'vitest';
import { chiaveInByte, supportoPush, entro, chiudiNotificheRecupero } from './push.js';

describe('chiaveInByte', () => {
  it('decodifica il base64url senza padding delle chiavi VAPID', () => {
    // "GymMaster!" in base64url: R3ltTWFzdGVyIQ (without "==")
    expect(Array.from(chiaveInByte('R3ltTWFzdGVyIQ'))).toEqual([...'GymMaster!'].map(c => c.charCodeAt(0)));
    // The characters specific to base64url: - and _ instead of + and /
    expect(Array.from(chiaveInByte('-_8'))).toEqual([0xfb, 0xff]);
  });

  it('una chiave VAPID pubblica vera e\' di 65 byte', () => {
    const chiave = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    expect(chiaveInByte(chiave)).toHaveLength(65);
  });
});

describe('supportoPush', () => {
  const ambiente = ({ userAgent = 'Mozilla/5.0 (Linux; Android 14)', completo = true, standalone = false } = {}) => ({
    navigator: { userAgent, standalone, ...(completo && { serviceWorker: {} }) },
    ...(completo && { PushManager: {}, Notification: {} }),
    matchMedia: () => ({ matches: standalone })
  });

  it('con service worker, PushManager e Notification le push ci sono', () => {
    expect(supportoPush(ambiente())).toEqual({ supportate: true });
  });

  it('su iPhone nel browser bisogna aggiungere l\'app alla schermata Home', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)';
    expect(supportoPush(ambiente({ userAgent: iphone, completo: false }))).toEqual({ supportate: false, motivo: 'iphone-da-installare' });
  });

  it('un browser senza push resta senza', () => {
    expect(supportoPush(ambiente({ completo: false }))).toEqual({ supportate: false, motivo: 'browser' });
  });
});

describe('entro', () => {
  it('lascia passare la promessa in tempo', async () => {
    await expect(entro(Promise.resolve(42), 50, 'troppo lenta')).resolves.toBe(42);
  });

  it('oltre il limite rifiuta col messaggio', async () => {
    await expect(entro(new Promise(() => {}), 20, 'troppo lenta')).rejects.toThrow('troppo lenta');
  });
});

describe('chiudiNotificheRecupero', () => {
  const ambiente = (registrazione) => ({ navigator: { serviceWorker: { getRegistration: async () => registrazione } } });

  it('closes the end-of-rest notifications still showing, and only those', async () => {
    const chiuse = [];
    const chiesti = [];
    const notifica = nome => ({ close: () => chiuse.push(nome) });
    await chiudiNotificheRecupero(ambiente({
      getNotifications: async (filtro) => { chiesti.push(filtro); return [notifica('a'), notifica('b')]; }
    }));
    expect(chiesti).toEqual([{ tag: 'recupero' }]);
    expect(chiuse).toEqual(['a', 'b']);
  });

  it('without a service worker or notifications it does nothing, and does not fail', async () => {
    await expect(chiudiNotificheRecupero({ navigator: {} })).resolves.toBeUndefined();
    await expect(chiudiNotificheRecupero(ambiente(undefined))).resolves.toBeUndefined();
    await expect(chiudiNotificheRecupero(ambiente({ getNotifications: async () => { throw new Error('no'); } }))).resolves.toBeUndefined();
  });
});
