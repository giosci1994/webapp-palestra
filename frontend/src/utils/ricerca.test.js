import { describe, it, expect } from 'vitest';
import { normalizza, radice, distanza, cerca, indicizzaEsercizi, preferitiPrima } from './ricerca.js';

const esercizio = (nomeIt, nome, gruppoMuscoloPrimario = 'Petto', attrezzatura = null) =>
  ({ nomeIt, nome, gruppoMuscoloPrimario, attrezzatura: attrezzatura && { nome: attrezzatura } });

// A piece of the real catalog
const CATALOGO = [
  esercizio('Stacco Rumeno con Due Manubri', 'Double Dumbbell Romanian Deadlift', 'Femorali', 'Manubri (Set)'),
  esercizio('Stacco Rumeno con Bilanciere', 'Barbell Romanian Deadlift', 'Femorali', 'Bilanciere Olimpico'),
  esercizio('Stacco da Terra con Bilanciere', 'Barbell Deadlift', 'Femorali', 'Bilanciere Olimpico'),
  esercizio('Panca Piana con Bilanciere', 'Barbell Bench Press', 'Petto', 'Bilanciere Olimpico'),
  esercizio('Panca Piana con Manubri', 'Dumbbell Bench Press', 'Petto', 'Manubri (Set)'),
  esercizio('Affondo in Avanti con Manubri', 'Dumbbell Forward Lunge', 'Quadricipiti', 'Manubri (Set)'),
  esercizio('Military Press con Bilanciere', 'Barbell Overhead Press', 'Spalle', 'Bilanciere Olimpico'),
  esercizio('Curl con Kettlebell', 'Kettlebell Curl', 'Bicipiti', 'Kettlebell'),
  esercizio('Crunch', 'Crunch', 'Addominali', null)
];
const indice = indicizzaEsercizi(CATALOGO, { conDettagli: true });
const nomi = testo => cerca(indice, testo).map(e => e.nomeIt);

describe('normalizza, radice e distanza', () => {
  it('normalizza toglie maiuscole, accenti e punteggiatura', () => {
    expect(normalizza("Alzate Laterali (Più Lente) all'Indietro")).toBe('alzate laterali piu lente all indietro');
  });

  it('singolare e plurale hanno la stessa radice, in italiano e in inglese', () => {
    for (const [a, b] of [['manubrio', 'manubri'], ['stacco', 'stacchi'], ['panca', 'panche'], ['affondo', 'affondi'],
      ['lunge', 'lunges'], ['press', 'presses'], ['crunch', 'crunches'], ['row', 'rows']]) {
      expect(radice(a), `${a} / ${b}`).toBe(radice(b));
    }
  });

  it('la distanza conta anche lo scambio di due lettere vicine', () => {
    expect(distanza('panca', 'panca')).toBe(0);
    expect(distanza('pacna', 'panca')).toBe(1);
    expect(distanza('manubri', 'manbri')).toBe(1);
    expect(distanza('squat', 'stacco', 1)).toBe(2); // beyond the maximum it stops counting
  });
});

describe('cerca', () => {
  it('senza testo restituisce tutto, nell\'ordine originale', () => {
    expect(nomi('  ')).toEqual(CATALOGO.map(e => e.nomeIt));
  });

  it('le parole valgono in qualsiasi ordine, e devono esserci tutte', () => {
    expect(nomi('manubri stacco')).toEqual(['Stacco Rumeno con Due Manubri']);
    expect(nomi('stacco rumeno')).toEqual(['Stacco Rumeno con Bilanciere', 'Stacco Rumeno con Due Manubri']);
  });

  it('cerca anche nel nome inglese', () => {
    expect(nomi('bench press')).toEqual(['Panca Piana con Manubri', 'Panca Piana con Bilanciere']);
  });

  it('finds muscles and equipment by their English names too', () => {
    expect(nomi('hamstrings').sort()).toEqual(['Stacco Rumeno con Bilanciere', 'Stacco Rumeno con Due Manubri', 'Stacco da Terra con Bilanciere']);
    expect(nomi('chest dumbbells')).toEqual(['Panca Piana con Manubri']);
  });

  it('una parola a meta\', il plurale e gli accenti non contano', () => {
    expect(nomi('affon')).toEqual(['Affondo in Avanti con Manubri']);
    expect(nomi('affondi')).toEqual(['Affondo in Avanti con Manubri']);
    expect(nomi('PANCA')).toContain('Panca Piana con Bilanciere');
  });

  it('tollera un errore di battitura, e due nelle parole lunghe', () => {
    expect(nomi('pacna piana')).toEqual(['Panca Piana con Manubri', 'Panca Piana con Bilanciere']);
    expect(nomi('bilancere')).toContain('Panca Piana con Bilanciere');
    expect(nomi('kettlebel curl')).toEqual(['Curl con Kettlebell']);
  });

  it('nelle parole corte non inventa corrispondenze', () => {
    expect(nomi('cul')).toEqual([]);
  });

  it('capisce le abbreviazioni da palestra', () => {
    expect(nomi('rdl')).toEqual(['Stacco Rumeno con Bilanciere', 'Stacco Rumeno con Due Manubri']);
    expect(nomi('ohp')).toEqual(['Military Press con Bilanciere']);
    expect(nomi('db panca')).toEqual(['Panca Piana con Manubri']);
    expect(nomi('kb')).toEqual(['Curl con Kettlebell']);
  });

  it('con i dettagli cerca anche muscoli e attrezzatura, che contano meno del nome', () => {
    expect(nomi('femorali')).toHaveLength(3);
    expect(nomi('petto manubri')).toEqual(['Panca Piana con Manubri']);
  });

  it('prima le corrispondenze esatte e i nomi che cominciano con la parola cercata', () => {
    expect(nomi('stacco')[0]).toBe('Stacco Rumeno con Bilanciere');
    expect(nomi('crunch')[0]).toBe('Crunch');
  });
});

describe('preferitiPrima', () => {
  const elenco = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it('porta i preferiti in cima e lascia il resto nell\'ordine di prima', () => {
    expect(preferitiPrima(elenco, new Set([4, 2])).map(e => e.id)).toEqual([2, 4, 1, 3]);
  });

  it('senza preferiti restituisce l\'elenco cosi\' com\'e\'', () => {
    expect(preferitiPrima(elenco, new Set())).toBe(elenco);
  });
});
