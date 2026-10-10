// Quando e' finito un allenamento che si chiude adesso.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fineEffettiva, MINUTI_INATTIVITA } from '../../src/services/conclusioneSessione.service.js';

const MINUTO = 60 * 1000;
const ADESSO = new Date('2026-10-11T18:00:00Z');
const minutiFa = n => new Date(ADESSO.getTime() - n * MINUTO);
const serieAlle = (...minuti) => minuti.map(n => ({ registrataIl: minutiFa(n) }));

describe('fineEffettiva', () => {
  it('con l\'ultima serie recente l\'allenamento finisce adesso', () => {
    assert.deepEqual(fineEffettiva(minutiFa(70), serieAlle(60, 30, 5), ADESSO), { fine: ADESSO, dimenticata: false });
  });

  it(`fermo da piu' di ${MINUTI_INATTIVITA} minuti era dimenticato: finisce all'ultima serie`, () => {
    assert.deepEqual(
      fineEffettiva(minutiFa(600), serieAlle(590, 560, 545), ADESSO),
      { fine: minutiFa(545), dimenticata: true }
    );
  });

  it('conta l\'ultima serie per orario, non per posizione', () => {
    assert.deepEqual(fineEffettiva(minutiFa(600), serieAlle(545, 590), ADESSO).fine, minutiFa(545));
  });

  it('senza serie: appena cominciato e\' in corso, dopo ore era dimenticato e dura zero', () => {
    assert.deepEqual(fineEffettiva(minutiFa(30), [], ADESSO), { fine: ADESSO, dimenticata: false });
    assert.deepEqual(fineEffettiva(minutiFa(300), [], ADESSO), { fine: minutiFa(300), dimenticata: true });
  });

  it('serie senza orario (registrate prima che lo avessero): tre minuti a serie dall\'inizio', () => {
    const vecchie = [{ registrataIl: null }, { registrataIl: null }, { registrataIl: null }, { registrataIl: null }];
    assert.deepEqual(fineEffettiva(minutiFa(1000), vecchie, ADESSO), { fine: minutiFa(1000 - 12), dimenticata: true });
  });

  it('un orario prima dell\'inizio non fa finire l\'allenamento prima di cominciare', () => {
    assert.deepEqual(fineEffettiva(minutiFa(300), serieAlle(320), ADESSO).fine, minutiFa(300));
  });
});
