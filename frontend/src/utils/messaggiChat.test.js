import { describe, it, expect } from 'vitest';
import { conNuovoMessaggio } from './messaggiChat.js';

describe('a message that arrives through the socket', () => {
  const primo = { id: 1, conversazioneId: 7, contenuto: 'ciao' };

  it('is added when it belongs to the open conversation', () => {
    const nuovo = { id: 2, conversazioneId: 7, contenuto: 'come va?' };
    expect(conNuovoMessaggio([primo], nuovo, 7)).toEqual([primo, nuovo]);
  });

  it('of another conversation it is left out', () => {
    const lista = [primo];
    expect(conNuovoMessaggio(lista, { id: 3, conversazioneId: 8, contenuto: 'altro' }, 7)).toBe(lista);
  });

  it('once only, and nothing for an empty event', () => {
    const lista = [primo];
    expect(conNuovoMessaggio(lista, { ...primo }, 7)).toBe(lista);
    expect(conNuovoMessaggio(lista, undefined, 7)).toBe(lista);
  });
});
