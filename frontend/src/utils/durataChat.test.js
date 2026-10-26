import { describe, it, expect } from 'vitest';
import { DURATE_CHAT, scelteDurataChat, etichettaDurataChat } from './durataChat.js';

describe('chat retention choices', () => {
  it('the standard choices, "forever" last', () => {
    expect(scelteDurataChat(7)).toEqual(DURATE_CHAT);
    expect(scelteDurataChat(0)).toEqual(DURATE_CHAT);
    expect(scelteDurataChat(undefined)).toEqual(DURATE_CHAT);
  });

  it("a value of the user's that is not among them shows up in its place", () => {
    expect(scelteDurataChat(14)).toEqual([7, 14, 30, 90, 365, 0]);
    expect(scelteDurataChat(200)).toEqual([7, 30, 90, 200, 365, 0]);
  });

  it('names: forever, years, days', () => {
    expect(etichettaDurataChat(0)).toEqual(['profilo.privacy.chat.perSempre', {}]);
    expect(etichettaDurataChat(365)).toEqual(['profilo.privacy.chat.anni', { count: 1 }]);
    expect(etichettaDurataChat(30)).toEqual(['profilo.privacy.chat.giorni', { count: 30 }]);
    expect(etichettaDurataChat(1)).toEqual(['profilo.privacy.chat.giorni', { count: 1 }]);
  });
});
