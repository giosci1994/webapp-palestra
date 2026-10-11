import { describe, it, expect } from 'vitest';
import { diLavoro, volumeDi, ordinaSerie, rampaRiscaldamento, pesoDrop } from './tipiSerie.js';

describe('diLavoro', () => {
  it('senza tipo una serie e\' di lavoro, riscaldamento e drop no', () => {
    expect([{}, { tipo: 'LAVORO' }, { tipo: 'RISCALDAMENTO' }, { tipo: 'DROP' }].map(diLavoro))
      .toEqual([true, true, false, false]);
  });
});

describe('volumeDi', () => {
  it('lavoro e drop si, riscaldamento no', () => {
    expect(volumeDi([
      { tipo: 'RISCALDAMENTO', pesoEffettivo: 40, repEffettive: 10 },
      { tipo: 'LAVORO', pesoEffettivo: 80, repEffettive: 8 },
      { tipo: 'DROP', pesoEffettivo: 60, repEffettive: 6 },
      { pesoEffettivo: 10, repEffettive: 3 }
    ])).toBe(80 * 8 + 60 * 6 + 10 * 3);
  });
});

describe('ordinaSerie', () => {
  it('riscaldamento, poi ogni serie di lavoro con i suoi drop; a parita\' come sono arrivate', () => {
    const serie = [
      { nome: 'L2', tipo: 'LAVORO', serieNumero: 2 },
      { nome: 'D1a', tipo: 'DROP', serieNumero: 1 },
      { nome: 'L1', serieNumero: 1 },
      { nome: 'R1', tipo: 'RISCALDAMENTO', serieNumero: 1 },
      { nome: 'D1b', tipo: 'DROP', serieNumero: 1 }
    ];
    expect(ordinaSerie(serie).map(s => s.nome)).toEqual(['R1', 'L1', 'D1a', 'D1b', 'L2']);
  });
});

describe('rampaRiscaldamento', () => {
  it('40%, 60% e 80% del peso di lavoro, al gradino dell\'attrezzo', () => {
    expect(rampaRiscaldamento(100)).toEqual([{ peso: 40, rep: 10 }, { peso: 60, rep: 5 }, { peso: 80, rep: 3 }]);
    expect(rampaRiscaldamento(82.5)).toEqual([{ peso: 32.5, rep: 10 }, { peso: 50, rep: 5 }, { peso: 65, rep: 3 }]);
    expect(rampaRiscaldamento(70, { incremento: 5 })).toEqual([{ peso: 30, rep: 10 }, { peso: 40, rep: 5 }, { peso: 55, rep: 3 }]);
  });

  it('col bilanciere non scende sotto la barra vuota, e non ripete lo stesso peso', () => {
    expect(rampaRiscaldamento(40, { minimo: 20 })).toEqual([{ peso: 20, rep: 10 }, { peso: 25, rep: 5 }, { peso: 32.5, rep: 3 }]);
    expect(rampaRiscaldamento(30, { minimo: 20 })).toEqual([{ peso: 20, rep: 10 }, { peso: 25, rep: 3 }]);
  });

  it('niente passi al peso di lavoro o oltre: con la barra vuota come lavoro non c\'e\' rampa', () => {
    expect(rampaRiscaldamento(20, { minimo: 20 })).toEqual([]);
    expect(rampaRiscaldamento(4, { incremento: 2 })).toEqual([{ peso: 2, rep: 10 }]);
  });

  it('senza un peso di lavoro non c\'e\' rampa', () => {
    expect(rampaRiscaldamento(0)).toEqual([]);
    expect(rampaRiscaldamento('')).toEqual([]);
    expect(rampaRiscaldamento(undefined)).toEqual([]);
  });
});

describe('pesoDrop', () => {
  it('un quinto in meno, al gradino', () => {
    expect(pesoDrop(80)).toBe(65);
    expect(pesoDrop(100)).toBe(80);
    expect(pesoDrop(30, 5)).toBe(25);
    expect(pesoDrop('22', 2)).toBe(18);
  });

  it('non sotto un gradino, e null quando non si puo\' calare', () => {
    expect(pesoDrop(5, 5)).toBeNull();
    expect(pesoDrop(4, 2)).toBe(2);
    expect(pesoDrop(0)).toBeNull();
    expect(pesoDrop('')).toBeNull();
  });
});
