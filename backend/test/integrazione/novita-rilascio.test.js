// When a version is released its stories enter the novita table, once only:
// repeating the release does not duplicate them, and past versions do not come
// back even if they were deleted from the admin panel.
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { applicaNovita } from '../../src/services/novitaRilascio.service.js';

after(() => prisma.$disconnect());
beforeEach(() => svuotaDatabase());

const storie = [
  { versione: '1.2.0', titolo: 'Della versione prima' },
  { versione: '1.3.0', titolo: 'Notifiche', icona: '🔔', punti: [{ icona: '⏱️', testo: 'Recupero finito' }], ctaRotta: '/profilo' },
  { versione: '1.3.0', titolo: 'Progressione', ordine: 2 }
];

describe('applicaNovita', () => {
  it('aggiunge solo le storie della versione, con i loro campi', async () => {
    const esito = await applicaNovita('1.3.0', storie);
    assert.deepEqual(esito, { aggiunte: ['Notifiche', 'Progressione'], presenti: [] });

    const righe = await prisma.novita.findMany({ orderBy: [{ ordine: 'asc' }, { creatoIl: 'desc' }] });
    assert.deepEqual(righe.map(r => r.titolo), ['Notifiche', 'Progressione']);
    assert.equal(righe[0].icona, '🔔');
    assert.deepEqual(JSON.parse(righe[0].punti), [{ icona: '⏱️', testo: 'Recupero finito' }]);
    assert.equal(righe[0].ctaRotta, '/profilo');
    assert.equal(righe[0].attiva, true);
    assert.equal(righe[1].ordine, 2);
  });

  it('ripetere il rilascio non duplica, e le storie gia\' presenti si lasciano come sono', async () => {
    await prisma.novita.create({ data: { titolo: 'Notifiche', sottotitolo: 'Cambiata dal pannello admin', attiva: false } });
    const esito = await applicaNovita('1.3.0', storie);
    assert.deepEqual(esito, { aggiunte: ['Progressione'], presenti: ['Notifiche'] });
    assert.deepEqual(await applicaNovita('1.3.0', storie), { aggiunte: [], presenti: ['Notifiche', 'Progressione'] });

    assert.equal(await prisma.novita.count(), 2);
    const modificata = await prisma.novita.findFirst({ where: { titolo: 'Notifiche' } });
    assert.equal(modificata.sottotitolo, 'Cambiata dal pannello admin');
    assert.equal(modificata.attiva, false);
  });

  it('una versione senza storie non aggiunge niente', async () => {
    assert.deepEqual(await applicaNovita('1.3.1', storie), { aggiunte: [], presenti: [] });
    assert.equal(await prisma.novita.count(), 0);
  });

  it('con il file sbagliato non scrive niente e dice cosa non va', async () => {
    await assert.rejects(applicaNovita('1.3.0', [...storie, { versione: '1.3.0', titolo: 'Colore', coloreInizio: 'rosso' }]), /coloreInizio/);
    assert.equal(await prisma.novita.count(), 0);
  });
});
