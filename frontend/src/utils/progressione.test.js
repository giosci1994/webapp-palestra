import { describe, it, expect, beforeEach } from 'vitest';
import { leggiForbice, incrementoPer, propostaCarico, FALLIMENTI_PRIMA_DELLO_SCARICO } from './progressione.js';
import { scegli } from '../i18n/index.js';

beforeEach(() => scegli('it'));

/** A session with the sets [weight, reps] */
const seduta = (...serie) => ({ data: '2026-10-01', serie: serie.map(([pesoEffettivo, repEffettive]) => ({ pesoEffettivo, repEffettive })) });
const proposta = (storico, altro = {}) => propostaCarico({ storico, serieTarget: 3, repTarget: '8-12', incremento: 2.5, ...altro });

describe('leggiForbice', () => {
  it('legge forbici e numeri singoli, anche con spazi o trattini lunghi', () => {
    expect(leggiForbice('8-12')).toEqual({ min: 8, max: 12 });
    expect(leggiForbice(' 6 – 8 ')).toEqual({ min: 6, max: 8 });
    expect(leggiForbice('12-8')).toEqual({ min: 8, max: 12 });
    expect(leggiForbice('10')).toEqual({ min: 10, max: 10 });
    expect(leggiForbice(10)).toEqual({ min: 10, max: 10 });
  });

  it('niente forbice per il cardio o le indicazioni a parole', () => {
    for (const valore of [null, undefined, '', 'AMRAP', 'max', '0', '30s']) expect(leggiForbice(valore), String(valore)).toBeNull();
  });
});

describe('incrementoPer', () => {
  const con = (nome, categoria = 'PESI_LIBERI') => ({ attrezzatura: { nome, categoria } });

  it('il gradino dell\'attrezzo', () => {
    expect(incrementoPer(con('Bilanciere Olimpico'))).toBe(2.5);
    expect(incrementoPer(con('Manubri (Set)'))).toBe(2);
    expect(incrementoPer(con('Kettlebell'))).toBe(4);
    expect(incrementoPer(con('Lat Machine', 'MACCHINE'))).toBe(5);
    expect(incrementoPer(con('Cavo alto', 'CAVI'))).toBe(5);
    expect(incrementoPer({})).toBe(2.5);
  });
});

describe('propostaCarico', () => {
  it('tutte le serie in cima alla forbice: si sale di un gradino', () => {
    expect(proposta([seduta([60, 12], [60, 12], [60, 12])])).toMatchObject({
      peso: 62.5, esito: 'sali', ripetizioni: { min: 8, max: 12 },
      motivo: "Tutte le serie in cima alla forbice (l'ultima volta 12-12-12 ripetizioni a 60 kg): si sale di 2,5 kg"
    });
  });

  it('dentro la forbice: stesso peso, una ripetizione in piu\'', () => {
    expect(proposta([seduta([60, 12], [60, 11], [60, 9])])).toMatchObject({
      peso: 60, esito: 'resta',
      motivo: "Stesso peso, una ripetizione in piu' (l'ultima volta 12-11-9 ripetizioni a 60 kg): quando tutte arrivano a 12 si sale"
    });
  });

  it('le serie di riscaldamento, piu\' leggere, non contano', () => {
    expect(proposta([seduta([40, 12], [60, 12], [60, 12], [60, 12])])).toMatchObject({ peso: 62.5, esito: 'sali' });
  });

  it('meno serie del previsto al peso di lavoro non bastano per salire', () => {
    expect(proposta([seduta([60, 12], [60, 12], [50, 12])])).toMatchObject({ peso: 60, esito: 'resta' });
  });

  it('sotto la forbice: stesso peso, puntando al minimo', () => {
    expect(proposta([seduta([60, 9], [60, 7], [60, 6])])).toMatchObject({
      peso: 60, esito: 'resta',
      motivo: "Stesso peso (l'ultima volta 9-7-6 ripetizioni a 60 kg): punta ad almeno 8 ripetizioni in ogni serie"
    });
  });

  it(`${FALLIMENTI_PRIMA_DELLO_SCARICO} volte di fila sotto la forbice allo stesso peso: scarico del 10%`, () => {
    const difficile = seduta([62.5, 7], [62.5, 6], [62.5, 6]);
    expect(proposta([difficile, difficile, difficile])).toMatchObject({
      peso: 55, esito: 'scarico',
      motivo: '3 volte di fila sotto le 8 ripetizioni a 62,5 kg: si scarica del 10% e si risale'
    });
  });

  it('due volte non bastano, e una seduta buona in mezzo azzera il conto', () => {
    const difficile = seduta([62.5, 7], [62.5, 6], [62.5, 6]);
    const buona = seduta([62.5, 8], [62.5, 8], [62.5, 8]);
    expect(proposta([difficile, difficile]).esito).toBe('resta');
    expect(proposta([difficile, difficile, buona, difficile]).esito).toBe('resta');
  });

  it('il conto riparte quando cambia il peso', () => {
    const difficile = peso => seduta([peso, 6], [peso, 6], [peso, 6]);
    expect(proposta([difficile(62.5), difficile(62.5), difficile(60)]).esito).toBe('resta');
  });

  it('lo scarico non scende sotto un gradino', () => {
    const difficile = seduta([2, 5], [2, 5], [2, 5]);
    expect(proposta([difficile, difficile, difficile], { incremento: 2 }).peso).toBe(2);
  });

  it('ripetizioni fisse: si sale quando tutte le serie le raggiungono', () => {
    expect(proposta([seduta([80, 5], [80, 5], [80, 5])], { repTarget: '5' })).toMatchObject({ peso: 82.5, esito: 'sali' });
    expect(proposta([seduta([80, 5], [80, 5], [80, 4])], { repTarget: 5 })).toMatchObject({ peso: 80, esito: 'resta' });
  });

  it('il gradino dipende dall\'attrezzo', () => {
    expect(proposta([seduta([20, 12], [20, 12], [20, 12])], { incremento: 2 }).peso).toBe(22);
  });

  it('in inglese il motivo e il numero seguono la lingua', () => {
    scegli('en');
    const difficile = seduta([62.5, 7], [62.5, 6], [62.5, 6]);
    expect(proposta([seduta([60, 12], [60, 12], [60, 12])]).motivo)
      .toBe('Every set at the top of the range (last time 12-12-12 reps at 60 kg): go up 2.5 kg');
    expect(proposta([seduta([60, 12], [60, 11], [60, 9])]).motivo)
      .toBe('Same weight, one more rep (last time 12-11-9 reps at 60 kg): once every set reaches 12, go up');
    expect(proposta([seduta([60, 9], [60, 7], [60, 6])]).motivo)
      .toBe('Same weight (last time 9-7-6 reps at 60 kg): aim for at least 8 reps on every set');
    expect(proposta([difficile, difficile, difficile]).motivo)
      .toBe('3 times in a row under 8 reps at 62.5 kg: deload by 10% and build back up');
  });

  it('niente proposta la prima volta, a corpo libero o senza forbice', () => {
    expect(proposta([])).toBeNull();
    expect(proposta([seduta([0, 15], [0, 15], [0, 15])])).toBeNull();
    expect(proposta([seduta([60, 12])], { repTarget: null })).toBeNull();
  });
});
