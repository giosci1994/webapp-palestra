// The Word export of a plan: its headings and labels are in the language of the request.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { conLingua } from '../../src/i18n/index.js';
import { generaDocxSchede, nomeFileDocumento } from '../../src/services/schedaDocx.service.js';

/** The text of word/document.xml: a .docx is a zip, read here through its central directory */
function testoDelDocumento(buffer) {
  const fine = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const voci = buffer.readUInt16LE(fine + 10);
  let posizione = buffer.readUInt32LE(fine + 16);
  for (let i = 0; i < voci; i++) {
    const metodo = buffer.readUInt16LE(posizione + 10);
    const compressi = buffer.readUInt32LE(posizione + 20);
    const lunghezzaNome = buffer.readUInt16LE(posizione + 28);
    const extra = buffer.readUInt16LE(posizione + 30);
    const commento = buffer.readUInt16LE(posizione + 32);
    const locale = buffer.readUInt32LE(posizione + 42);
    const nome = buffer.toString('utf8', posizione + 46, posizione + 46 + lunghezzaNome);
    if (nome === 'word/document.xml') {
      const inizio = locale + 30 + buffer.readUInt16LE(locale + 26) + buffer.readUInt16LE(locale + 28);
      const dati = buffer.subarray(inizio, inizio + compressi);
      return (metodo === 8 ? inflateRawSync(dati) : dati).toString('utf8');
    }
    posizione += 46 + lunghezzaNome + extra + commento;
  }
  throw new Error('word/document.xml not found');
}

const voce = {
  serieTarget: 3, repTarget: '8-12', recuperoSecondi: 90, riscaldamento: true,
  esercizio: { nome: 'Bench Press', nomeIt: 'Panca piana', gruppoMuscoloPrimario: 'Petto', attrezzatura: null }
};
const scheda = { titolo: 'Push A', livello: 'INTERMEDIO', creatore: { nome: 'Mario' }, descrizione: '', esercizi: [voce] };
const genera = (lingua, schede = [scheda]) => conLingua(lingua, async () => testoDelDocumento(await generaDocxSchede(schede)));

describe('Word export of a plan', () => {
  it('in Italian: headings, labels, exercise name and date', async () => {
    const testo = await genera('it');
    for (const atteso of ['Esercizi', 'Serie x Reps', 'Recupero', 'Note Tecniche', 'Panca piana', 'Riscaldamento',
      'Livello: Intermedio', 'Creata da Mario', '1 esercizio', 'Note', 'Esportata da GymMaster il']) {
      assert.ok(testo.includes(atteso), atteso);
    }
  });

  it('in English: the same document, translated', async () => {
    const testo = await genera('en');
    for (const atteso of ['Exercises', 'Sets x Reps', 'Rest', 'Technical Notes', 'Bench Press', 'Warm-up',
      'Level: Intermediate', 'Created by Mario', '1 exercise', 'Notes', 'Exported from GymMaster on']) {
      assert.ok(testo.includes(atteso), atteso);
    }
    assert.ok(!testo.includes('Panca piana'));
    assert.ok(!testo.includes('Esportata'));
  });

  it('a program of several plans, and the file name when there is no title', async () => {
    const programma = await genera('en', [scheda, { ...scheda, titolo: 'Pull B', esercizi: [] }]);
    for (const atteso of ['Training Program', 'Weekly program of 2 sessions', '1 exercise in total', 'Session 2: Pull B', 'This plan has no exercises yet.']) {
      assert.ok(programma.includes(atteso), atteso);
    }
    const italiano = await genera('it', [scheda, scheda]);
    assert.ok(italiano.includes('Programma settimanale su 2 sedute — 2 esercizi complessivi'));

    assert.equal(conLingua('it', () => nomeFileDocumento('')), 'scheda.docx');
    assert.equal(conLingua('en', () => nomeFileDocumento('')), 'plan.docx');
    assert.equal(conLingua('en', () => nomeFileDocumento('Push A')), 'Push-A.docx');
  });
});
