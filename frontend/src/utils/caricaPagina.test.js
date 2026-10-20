import { describe, it, expect, vi } from 'vitest';
import { quandoNonCarica } from './caricaPagina.js';

function ambiente({ memoria = new Map(), senzaStorage = false } = {}) {
  return {
    sessionStorage: senzaStorage ? undefined : {
      getItem: k => memoria.get(k) ?? null,
      setItem: (k, v) => memoria.set(k, v),
      removeItem: k => memoria.delete(k)
    },
    navigator: {},
    location: { reload: vi.fn() }
  };
}

describe('quandoNonCarica', () => {
  it('the first missing page file updates the app, without an error', async () => {
    const amb = ambiente();
    const esito = quandoNonCarica(new Error('404'), amb);
    expect(esito).toBeInstanceOf(Promise);
    await vi.waitFor(() => expect(amb.location.reload).toHaveBeenCalledTimes(1));
  });

  it('a second one in the same session is a real error: no reload loop', async () => {
    const memoria = new Map();
    quandoNonCarica(new Error('404'), ambiente({ memoria }));
    const dopo = ambiente({ memoria });
    expect(() => quandoNonCarica(new Error('ancora 404'), dopo)).toThrow('ancora 404');
    expect(dopo.location.reload).not.toHaveBeenCalled();
  });

  it('without sessionStorage it does not reload at all', () => {
    const amb = ambiente({ senzaStorage: true });
    expect(() => quandoNonCarica(new Error('404'), amb)).toThrow('404');
    expect(amb.location.reload).not.toHaveBeenCalled();
  });
});
