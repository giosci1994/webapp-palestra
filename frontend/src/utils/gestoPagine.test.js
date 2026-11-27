import { describe, it, expect } from 'vitest';
import {
  PAGINE_ISOLA, gestoAttivo, paginaVicina, destinazioneGesto, direzioneMovimento, superaSoglia,
  nelBordo, escluso, direzioneTransizione, immersiva, sostituisceStoria, SELETTORE_ESCLUSI
} from './gestoPagine.js';

describe('swipe between pages', () => {
  it('works on the pages of the bottom bar, not on the Workout one nor elsewhere', () => {
    expect(PAGINE_ISOLA).toEqual(['/dashboard', '/schede', '/allenamento', '/chat', '/profilo']);
    expect(gestoAttivo('/dashboard')).toBe(true);
    expect(gestoAttivo('/profilo')).toBe(true);
    expect(gestoAttivo('/allenamento')).toBe(false);
    expect(gestoAttivo('/allenamento/12')).toBe(false);
    expect(gestoAttivo('/chat/3')).toBe(false);
    expect(gestoAttivo('/statistiche')).toBe(false);
    expect(destinazioneGesto('/allenamento', 1)).toBeNull();
  });

  it('goes to the next and the previous page in the order of the bar', () => {
    expect(paginaVicina('/schede', 1)).toBe('/allenamento');
    expect(paginaVicina('/chat', -1)).toBe('/allenamento');
    expect(destinazioneGesto('/schede', -1)).toEqual({ tipo: 'pagina', percorso: '/dashboard' });
    expect(destinazioneGesto('/chat', 1)).toEqual({ tipo: 'pagina', percorso: '/profilo' });
  });

  it('stops at the ends of the bar', () => {
    expect(destinazioneGesto('/dashboard', -1)).toEqual({ tipo: 'fermo' });
    expect(destinazioneGesto('/profilo', 1)).toEqual({ tipo: 'fermo' });
  });

  it('on the Dashboard swipes through the tabs first, then on to the next page', () => {
    const schede = (indice) => ({ indice, conteggio: 3 });
    expect(destinazioneGesto('/dashboard', 1, schede(0))).toEqual({ tipo: 'scheda', indice: 1 });
    expect(destinazioneGesto('/dashboard', 1, schede(1))).toEqual({ tipo: 'scheda', indice: 2 });
    expect(destinazioneGesto('/dashboard', 1, schede(2))).toEqual({ tipo: 'pagina', percorso: '/schede' });
    expect(destinazioneGesto('/dashboard', -1, schede(1))).toEqual({ tipo: 'scheda', indice: 0 });
    expect(destinazioneGesto('/dashboard', -1, schede(0))).toEqual({ tipo: 'fermo' });
    // a single tab: straight to the pages
    expect(destinazioneGesto('/dashboard', 1, { indice: 0, conteggio: 1 })).toEqual({ tipo: 'pagina', percorso: '/schede' });
  });

  it('a mostly vertical move stays a scroll', () => {
    expect(direzioneMovimento(4, 3)).toBeNull();
    expect(direzioneMovimento(30, 5)).toBe('orizzontale');
    expect(direzioneMovimento(5, 30)).toBe('verticale');
    expect(direzioneMovimento(20, 19)).toBe('verticale');
  });

  it('changes page past a distance or with a quick flick', () => {
    expect(superaSoglia(-150, 0, 390)).toBe(true);
    expect(superaSoglia(-40, -100, 390)).toBe(false);
    expect(superaSoglia(-30, -900, 390)).toBe(true);
    expect(superaSoglia(30, -900, 390)).toBe(false);
  });

  it('leaves the screen edges to the system', () => {
    expect(nelBordo(10, 390)).toBe(true);
    expect(nelBordo(380, 390)).toBe(true);
    expect(nelBordo(200, 390)).toBe(false);
  });

  it('does not start on fields, charts, maps, the calendar or what scrolls sideways', () => {
    for (const s of ['input', 'textarea', 'select', '[role="slider"]', '[role="dialog"]', '.recharts-wrapper', '.mappa-muscoli', '[data-senza-gesto]']) {
      expect(SELETTORE_ESCLUSI).toContain(s);
    }
    const stile = (e) => ({ overflowX: e.overflowX || 'visible' });
    const nodo = (props, padre = null) => ({ parentElement: padre, scrollWidth: 100, clientWidth: 100, closest: () => null, ...props });
    const pagina = nodo({});
    expect(escluso(nodo({ closest: () => ({}) }, pagina), pagina, stile)).toBe(true);
    const riga = nodo({ overflowX: 'auto', scrollWidth: 600, clientWidth: 300 }, pagina);
    expect(escluso(nodo({}, riga), pagina, stile)).toBe(true);
    const rigaCorta = nodo({ overflowX: 'auto', scrollWidth: 300, clientWidth: 300 }, pagina);
    expect(escluso(nodo({}, rigaCorta), pagina, stile)).toBe(false);
    const finestra = nodo({ position: 'fixed' }, pagina);
    expect(escluso(nodo({}, finestra), pagina, (e) => ({ overflowX: 'visible', position: e.position || 'static' }))).toBe(true);
    expect(escluso(null)).toBe(false);
  });

  it('the transition follows the order of the bar, and "back" goes backwards', () => {
    expect(direzioneTransizione('/dashboard', '/chat', 'REPLACE')).toBe('avanti');
    expect(direzioneTransizione('/profilo', '/dashboard', 'REPLACE')).toBe('indietro');
    expect(direzioneTransizione('/dashboard', '/statistiche', 'PUSH')).toBe('avanti');
    expect(direzioneTransizione('/statistiche', '/dashboard', 'POP')).toBe('indietro');
  });

  it('full-screen pages have no transition', () => {
    expect(immersiva('/allenamento/7')).toBe(true);
    expect(immersiva('/chat/2')).toBe(true);
    expect(immersiva('/allenamento')).toBe(false);
  });

  it('keeps the history as [home] or [home, page], like the bottom bar', () => {
    expect(sostituisceStoria('/dashboard', '/schede')).toBe(false);
    expect(sostituisceStoria('/schede', '/allenamento')).toBe(true);
    expect(sostituisceStoria('/schede', '/dashboard')).toBe(true);
  });
});
