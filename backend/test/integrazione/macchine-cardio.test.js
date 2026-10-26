// The cardio exercises every installation has: created by the seed with the
// English name and the Italian one, and converted on the installations that
// had them with the Italian name only (migration 20261026_macchine_cardio_in_inglese).
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { garantisciEserciziCardio } from '../../src/utils/macchineCardio.js';

after(() => prisma.$disconnect());
beforeEach(() => svuotaDatabase());

const cardio = () => prisma.esercizio.findMany({
  where: { gruppoMuscoloPrimario: 'Cardio' }, orderBy: { id: 'asc' },
  select: { nome: true, nomeIt: true, descrizione: true, attrezzaturaRichiestaId: true }
});

describe('the seed', () => {
  it('creates the missing cardio exercises, with English and Italian names, linked to their equipment', async () => {
    const tapis = await prisma.attrezzatura.create({ data: { nome: 'Tapis Roulant', categoria: 'CARDIO' } });

    assert.equal(await garantisciEserciziCardio(prisma), 6);
    const creati = await cardio();
    assert.deepEqual(creati.map(e => [e.nome, e.nomeIt]), [
      ['Treadmill', 'Tapis Roulant'], ['Exercise Bike', 'Cyclette'], ['Elliptical', 'Ellittica'],
      ['Rowing Machine', 'Vogatore'], ['Stepper', 'Stepper'], ['Air Bike', 'Air Bike']
    ]);
    assert.equal(creati[0].attrezzaturaRichiestaId, tapis.id);
    assert.equal(creati[0].descrizione, 'Cardio machine: Treadmill');

    // At every start: nothing more
    assert.equal(await garantisciEserciziCardio(prisma), 0);
  });
});

describe('migration 20261026_macchine_cardio_in_inglese', () => {
  const istruzioni = readFileSync(
    new URL('../../prisma/migrations/20261026_macchine_cardio_in_inglese/migration.sql', import.meta.url), 'utf8'
  ).split('\n').filter(riga => !riga.startsWith('--')).join('\n')
    .split(';').map(istruzione => istruzione.trim()).filter(Boolean);

  it('gives English names to the cardio exercises the old seed created, and the seed does not add them again', async () => {
    // As the old seed created them
    for (const nome of ['Tapis Roulant', 'Cyclette', 'Ellittica', 'Vogatore (Rower)', 'Stepper', 'Air Bike']) {
      await prisma.esercizio.create({ data: { nome, gruppoMuscoloPrimario: 'Cardio', descrizione: `Macchina cardio: ${nome}` } });
    }
    // Not touched: one with an Italian name already, and a non-cardio exercise
    await prisma.esercizio.create({ data: { nome: 'Cyclette', nomeIt: 'Cyclette da casa', gruppoMuscoloPrimario: 'Cardio' } });
    await prisma.esercizio.create({ data: { nome: 'Ellittica', gruppoMuscoloPrimario: 'Gambe', descrizione: 'Macchina cardio: Ellittica' } });

    for (const istruzione of istruzioni) await prisma.$executeRawUnsafe(istruzione);

    const dopo = await prisma.esercizio.findMany({ orderBy: { id: 'asc' }, select: { nome: true, nomeIt: true, descrizione: true } });
    assert.deepEqual(dopo, [
      { nome: 'Treadmill', nomeIt: 'Tapis Roulant', descrizione: 'Cardio machine: Treadmill' },
      { nome: 'Exercise Bike', nomeIt: 'Cyclette', descrizione: 'Cardio machine: Exercise Bike' },
      { nome: 'Elliptical', nomeIt: 'Ellittica', descrizione: 'Cardio machine: Elliptical' },
      { nome: 'Rowing Machine', nomeIt: 'Vogatore', descrizione: 'Cardio machine: Rowing Machine' },
      { nome: 'Stepper', nomeIt: 'Stepper', descrizione: 'Cardio machine: Stepper' },
      { nome: 'Air Bike', nomeIt: 'Air Bike', descrizione: 'Cardio machine: Air Bike' },
      { nome: 'Cyclette', nomeIt: 'Cyclette da casa', descrizione: null },
      { nome: 'Ellittica', nomeIt: null, descrizione: 'Macchina cardio: Ellittica' }
    ]);
    assert.equal(await garantisciEserciziCardio(prisma), 0);
  });

  it('a machine renamed by hand before the migration is left as it is, and not created twice', async () => {
    await prisma.esercizio.create({ data: { nome: 'Tapis Roulant', nomeIt: 'Tapis della palestra', gruppoMuscoloPrimario: 'Cardio' } });
    for (const istruzione of istruzioni) await prisma.$executeRawUnsafe(istruzione);
    assert.equal(await garantisciEserciziCardio(prisma), 5);
    assert.equal(await prisma.esercizio.count({ where: { OR: [{ nome: 'Treadmill' }, { nome: 'Tapis Roulant' }] } }), 1);
  });
});
