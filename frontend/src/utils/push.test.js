import { describe, it, expect } from 'vitest';
import { chiaveInByte, supportoPush, entro } from './push.js';

describe('chiaveInByte', () => {
  it('decodifica il base64url senza padding delle chiavi VAPID', () => {
    // "GymMaster!" in base64url: R3ltTWFzdGVyIQ (senza "==")
    expect(Array.from(chiaveInByte('R3ltTWFzdGVyIQ'))).toEqual([...'GymMaster!'].map(c => c.charCodeAt(0)));
    // I caratteri propri del base64url: - e _ al posto di + e /
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
