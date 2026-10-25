// A finished workout stays finished: "Termina" tapped again on an old screen
// (an end-of-rest notification opened hours later, another device) does not
// move its end, and its rest no longer sends a notification once it is over.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, MINUTO } from '../supporto/dati.js';
import { programmaFineRecupero, annullaFineRecupero } from '../../src/services/push.service.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ lingua: 'it' });
  panca = await creaEsercizio({ nome: 'Panca piana' });
  scheda = await creaScheda(utente, [panca], { titolo: 'Push' });
});

const minutiFa = n => new Date(Date.now() - n * MINUTO);
const chiama = (metodo, percorso, corpo) => server.richiesta(metodo, percorso, { token: tokenPer(utente), corpo });
const leggi = s => prisma.sessioneAllenamento.findUnique({ where: { id: s.id } });
const attendi = ms => new Promise(risolvi => setTimeout(risolvi, ms));

describe('"Termina" on a workout already finished', () => {
  it('a workout the user finished stays as it was', async () => {
    // Finished 40 minutes ago, its last set 45 minutes ago: within the two
    // hours that would make "now" the end of a workout still open
    const sessione = await creaSessione(utente, scheda, {
      inizio: minutiFa(100), durataMinuti: 60,
      serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(45) }]
    });
    const prima = await leggi(sessione);

    const risposta = await chiama('PATCH', `/sessioni/${sessione.id}/completa`, {});
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.giaConclusa, true);
    assert.deepEqual(risposta.corpo.recordPersonali, []);
    assert.equal(risposta.corpo.dati.dataFine, prima.dataFine.toISOString());

    const dopo = await leggi(sessione);
    assert.deepEqual([dopo.dataFine, dopo.durataMinuti], [prima.dataFine, 60]);
    assert.equal(await prisma.recordPersonale.count(), 0);
  });

  it('one the server closed because it was forgotten open is closed again by the user', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: minutiFa(300), durataMinuti: 10,
      serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(290) }]
    });
    await prisma.sessioneAllenamento.update({ where: { id: sessione.id }, data: { chiusaAutomaticamente: true } });

    const risposta = await chiama('PATCH', `/sessioni/${sessione.id}/completa`, {});
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.giaConclusa, undefined);
    assert.equal((await leggi(sessione)).chiusaAutomaticamente, false);
  });
});

describe('the end-of-rest notification of a finished workout', () => {
  let invii;
  before(() => {
    const chiavi = webpush.generateVAPIDKeys();
    process.env.VAPID_CHIAVE_PUBBLICA = chiavi.publicKey;
    process.env.VAPID_CHIAVE_PRIVATA = chiavi.privateKey;
  });
  beforeEach(async () => {
    invii = mock.method(webpush, 'sendNotification', async () => ({ statusCode: 201 }));
    await chiama('POST', '/notifiche/push/iscrizione', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/dispositivo-1', keys: { p256dh: 'chiave', auth: 'segreto' }
    });
  });

  it('a rest still running when "Termina" arrives does not notify', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: minutiFa(30), conclusa: false,
      serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(1) }]
    });
    await chiama('POST', '/notifiche/push/recupero', { secondi: 1, prossimo: 'Panca piana · serie 2', sessioneId: sessione.id });
    assert.equal((await chiama('PATCH', `/sessioni/${sessione.id}/completa`, {})).stato, 200);
    await attendi(1300);
    assert.equal(invii.mock.callCount(), 0);
  });

  it('a workout thrown away during its rest does not notify either', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: minutiFa(5), conclusa: false,
      serie: [{ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(1) }]
    });
    await chiama('POST', '/notifiche/push/recupero', { secondi: 1, prossimo: 'Panca piana · serie 2', sessioneId: sessione.id });
    assert.equal((await chiama('DELETE', `/sessioni/${sessione.id}`)).stato, 200);
    assert.equal(await prisma.sessioneAllenamento.count({ where: { id: sessione.id } }), 0);
    await attendi(1300);
    assert.equal(invii.mock.callCount(), 0);
  });

  it('a workout that ends cancels its own rest, not one of another workout', () => {
    programmaFineRecupero(utente.id, 60, null, 7);
    assert.equal(annullaFineRecupero(utente.id, 8), false);
    assert.equal(annullaFineRecupero(utente.id, 7), true);
    // Without a workout (the app interrupting the rest) it cancels whatever is waiting
    programmaFineRecupero(utente.id, 60, null, 7);
    assert.equal(annullaFineRecupero(utente.id), true);
    assert.equal(annullaFineRecupero(utente.id), false);
  });
});

describe('the details of a workout', () => {
  it('say until when a finished one can still be resumed; nothing while it is open', async () => {
    const aperta = await creaSessione(utente, scheda, { inizio: minutiFa(30), conclusa: false });
    assert.equal((await chiama('GET', `/sessioni/${aperta.id}`)).corpo.dati.riapribileFinoA, null);

    const finita = await creaSessione(utente, scheda, { inizio: minutiFa(100), durataMinuti: 60 });
    const { dati } = (await chiama('GET', `/sessioni/${finita.id}`)).corpo;
    assert.equal(new Date(dati.riapribileFinoA).getTime(), new Date(dati.dataFine).getTime() + 30 * MINUTO);
  });
});
