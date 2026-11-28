// Swipe a set in the live workout: what the gesture does, the renumbering
// (the same rule as the server's DELETE /sessioni/:id/serie/:idClient), the
// copy, and that the turns of a superset stay right after a copy or a delete.
import { describe, it, expect } from 'vitest';
import {
  azioneDelGesto, rinumera, copiaDi, serieOggiDopoCopia, suggerimentoDaMostrare, segnaSuggerimentoVisto, CHIAVE_SUGGERIMENTO
} from './scorriSerie.js';
import { passoDopoSerie, giroDi } from './superset.js';
import { SERIE_MAX_OGGI } from './ripresa.js';

const gesto = (dati) => azioneDelGesto({ inizioX: 200, larghezzaSchermo: 390, dy: 0, velocita: 0, larghezza: 358, ...dati });

describe('azioneDelGesto', () => {
  it('a sinistra elimina, a destra copia, oltre la soglia', () => {
    expect(gesto({ dx: -150 })).toBe('elimina');
    expect(gesto({ dx: 150 })).toBe('copia');
  });

  it('sotto la soglia la riga torna indietro, a meno di un colpo veloce', () => {
    expect(gesto({ dx: -40 })).toBeNull();
    expect(gesto({ dx: -40, velocita: -900 })).toBe('elimina');
    expect(gesto({ dx: 40, velocita: 900 })).toBe('copia');
    // A flick against the direction of the offset does not count
    expect(gesto({ dx: 40, velocita: -900 })).toBeNull();
  });

  it('nei bordi dello schermo il gesto e\' del sistema', () => {
    expect(gesto({ inizioX: 10, dx: 200 })).toBeNull();
    expect(gesto({ inizioX: 380, dx: -200 })).toBeNull();
  });

  it('un movimento verticale resta uno scorrimento della pagina', () => {
    expect(gesto({ dx: -150, dy: 160 })).toBeNull();
    expect(gesto({ dx: -5, dy: 4 })).toBeNull();
  });
});

// Warm-up 1-2, set 1 with its drop, sets 2 and 3, and another exercise's set 1
const lista = () => [
  { idClient: 'r1', esercizioId: 1, tipo: 'RISCALDAMENTO', serieNumero: 1 },
  { idClient: 'r2', esercizioId: 1, tipo: 'RISCALDAMENTO', serieNumero: 2 },
  { idClient: 's1', esercizioId: 1, tipo: 'LAVORO', serieNumero: 1 },
  { idClient: 'd1', esercizioId: 1, tipo: 'DROP', serieNumero: 1 },
  { idClient: 's2', esercizioId: 1, tipo: 'LAVORO', serieNumero: 2 },
  { idClient: 's3', esercizioId: 1, serieNumero: 3 },
  { idClient: 'x1', esercizioId: 2, tipo: 'LAVORO', serieNumero: 1 }
];
const numeri = serie => serie.map(s => `${s.idClient}:${s.serieNumero}`);

describe('rinumera', () => {
  it('una serie di lavoro va via con le sue drop; le successive dello stesso esercizio scendono', () => {
    const { serie, via } = rinumera(lista(), 's1');
    expect(via.map(s => s.idClient)).toEqual(['s1', 'd1']);
    expect(numeri(serie)).toEqual(['r1:1', 'r2:2', 's2:1', 's3:2', 'x1:1']);
  });

  it('un riscaldamento rinumera solo i riscaldamenti', () => {
    expect(numeri(rinumera(lista(), 'r1').serie)).toEqual(['r2:1', 's1:1', 'd1:1', 's2:2', 's3:3', 'x1:1']);
  });

  it('una drop va via da sola e non sposta nulla', () => {
    expect(numeri(rinumera(lista(), 'd1').serie)).toEqual(['r1:1', 'r2:2', 's1:1', 's2:2', 's3:3', 'x1:1']);
  });

  it('una chiave che non c\'e\' non cambia niente', () => {
    const prima = lista();
    expect(rinumera(prima, 'nessuna')).toEqual({ serie: prima, via: [] });
  });
});

describe('copiaDi', () => {
  it('la stessa serie come prossima dell\'esercizio: peso, ripetizioni, RPE e tipo', () => {
    const serie = { idClient: 's2', esercizioId: 1, tipo: 'LAVORO', serieNumero: 2, pesoEffettivo: 80, repEffettive: 8, rpe: 8 };
    expect(copiaDi(serie, { prossimoNumero: 4, riscaldamenti: 2 })).toEqual({
      esercizioId: 1, tipo: 'LAVORO', serieNumero: 4, pesoEffettivo: 80, repEffettive: 8, rpe: 8, completato: true
    });
  });

  it('un riscaldamento diventa un riscaldamento in piu\'', () => {
    const serie = { esercizioId: 1, tipo: 'RISCALDAMENTO', serieNumero: 1, pesoEffettivo: 40, repEffettive: 10 };
    expect(copiaDi(serie, { prossimoNumero: 2, riscaldamenti: 2 })).toMatchObject({ tipo: 'RISCALDAMENTO', serieNumero: 3 });
  });

  it('il cardio tiene minuti e livello; una drop non si copia', () => {
    const cardio = { esercizioId: 5, tipo: 'LAVORO', serieNumero: 1, pesoEffettivo: 0, repEffettive: 0, durataMinuti: 20, livelloResistenza: 6 };
    expect(copiaDi(cardio, { prossimoNumero: 2, riscaldamenti: 0 })).toMatchObject({ durataMinuti: 20, livelloResistenza: 6, serieNumero: 2 });
    expect(copiaDi({ esercizioId: 1, tipo: 'DROP', serieNumero: 1 }, { prossimoNumero: 2, riscaldamenti: 0 })).toBeNull();
  });
});

describe('serieOggiDopoCopia', () => {
  it('oltre le serie di oggi le alza di una, dentro le lascia', () => {
    expect(serieOggiDopoCopia(3, 1)).toBe(3);
    expect(serieOggiDopoCopia(3, 2)).toBe(3);
    expect(serieOggiDopoCopia(3, 3)).toBe(4);
  });

  it('al massimo di un allenamento la copia non si fa', () => {
    expect(serieOggiDopoCopia(SERIE_MAX_OGGI, SERIE_MAX_OGGI)).toBeNull();
  });
});

describe('in un superset i turni restano giusti', () => {
  // A1 and B1, three rounds; the rest after the round is B1's
  const superset = () => [
    { esercizioId: 1, gruppo: 1, serieTarget: 3, recuperoSecondi: 0 },
    { esercizioId: 2, gruppo: 1, serieTarget: 3, recuperoSecondi: 90 }
  ];

  it('la copia di A1 e\' una serie in piu\' solo di A1: dopo la prossima di A1 tocca a B1', () => {
    const esercizi = superset();
    // Round 2, on A1: A1 1 set, B1 1 set. The copy brings A1 to 2
    const dopoCopia = [2, 1];
    expect(giroDi(esercizi, dopoCopia, 0).giro).toBe(3);
    expect(giroDi(esercizi, dopoCopia, 1).giro).toBe(2);
    // A1 does its next set (the third): B1 next, no rest in between
    expect(passoDopoSerie(esercizi, [3, 1], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 0, fineGiro: false });
    // B1 closes its round 2: A1 is done, B1 goes on alone after the rest
    expect(passoDopoSerie(esercizi, [3, 2], 1)).toEqual({ prossimoIdx: 1, recuperoSecondi: 90, fineGiro: true });
  });

  it('una copia oltre le serie di oggi alza solo quelle di A1', () => {
    const esercizi = superset();
    const oggi = serieOggiDopoCopia(3, 3);
    const dopo = esercizi.map((es, i) => (i === 0 ? { ...es, serieOggi: oggi } : es));
    expect(giroDi(dopo, [4, 3], 1).giri).toBe(4);
    // B1 has finished its three: after A1 nothing is left in the group
    expect(passoDopoSerie(dopo, [4, 3], 0).prossimoIdx).toBe(-1);
  });

  it("un'eliminazione in A1 lascia A1 indietro di una serie, e il giro la recupera", () => {
    const esercizi = superset();
    // A1 2, B1 2, then A1's set 1 is deleted: A1 1, B1 2
    expect(passoDopoSerie(esercizi, [2, 2], 0)).toEqual({ prossimoIdx: 1, recuperoSecondi: 0, fineGiro: false });
    expect(passoDopoSerie(esercizi, [2, 3], 1)).toEqual({ prossimoIdx: 0, recuperoSecondi: 90, fineGiro: true });
    expect(passoDopoSerie(esercizi, [3, 3], 0).prossimoIdx).toBe(-1);
  });
});

describe('il suggerimento la prima volta', () => {
  const archivio = () => {
    const valori = new Map();
    return { getItem: k => valori.get(k) ?? null, setItem: (k, v) => valori.set(k, v) };
  };

  it('si mostra finche\' non e\' visto', () => {
    const a = archivio();
    expect(suggerimentoDaMostrare(a)).toBe(true);
    segnaSuggerimentoVisto(a);
    expect(a.getItem(CHIAVE_SUGGERIMENTO)).toBe('1');
    expect(suggerimentoDaMostrare(a)).toBe(false);
  });

  it('con un archivio che non funziona non si rompe niente', () => {
    const rotto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(suggerimentoDaMostrare(rotto)).toBe(false);
    expect(() => segnaSuggerimentoVisto(rotto)).not.toThrow();
  });
});
