// Notifiche push: iscrizioni dei dispositivi, invii e fine del recupero.
// L'invio vero (web-push verso i servizi push dei browser) e' simulato.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';
import { creaNotifica } from '../../src/services/notifiche.service.js';

let server;
let utente;
let invii;

const iscrizione = (n = 1) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/dispositivo-${n}`,
  keys: { p256dh: `chiave-${n}`, auth: `segreto-${n}` }
});
const chiama = (metodo, percorso, corpo, chi = utente) =>
  server.richiesta(metodo, `/notifiche/push${percorso}`, { token: tokenPer(chi), corpo });
const attendi = ms => new Promise(risolvi => setTimeout(risolvi, ms));

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  invii = mock.method(webpush, 'sendNotification', async () => ({ statusCode: 201 }));
});

describe('push senza chiavi VAPID', () => {
  it('risultano spente e non si puo\' iscriversi', async () => {
    const stato = await chiama('GET', '');
    assert.deepEqual(stato.corpo.dati, { attive: false, chiave: null, dispositivi: 0 });
    assert.equal((await chiama('POST', '/iscrizione', iscrizione())).stato, 400);
  });
});

describe('push con le chiavi VAPID', () => {
  before(() => {
    const chiavi = webpush.generateVAPIDKeys();
    process.env.VAPID_CHIAVE_PUBBLICA = chiavi.publicKey;
    process.env.VAPID_CHIAVE_PRIVATA = chiavi.privateKey;
  });

  it('un dispositivo si iscrive e si toglie; lo stesso browser passa a chi ci entra', async () => {
    assert.equal((await chiama('GET', '')).corpo.dati.chiave, process.env.VAPID_CHIAVE_PUBBLICA);
    assert.equal((await chiama('POST', '/iscrizione', iscrizione())).stato, 201);
    assert.equal((await chiama('POST', '/iscrizione', iscrizione())).stato, 201); // di nuovo: nessun doppione
    assert.equal((await chiama('GET', '')).corpo.dati.dispositivi, 1);

    const altro = await creaUtente();
    await chiama('POST', '/iscrizione', iscrizione(), altro);
    assert.equal((await chiama('GET', '')).corpo.dati.dispositivi, 0);
    assert.equal((await chiama('GET', '', undefined, altro)).corpo.dati.dispositivi, 1);

    // Il dispositivo di un altro non si toglie
    await chiama('DELETE', '/iscrizione', { endpoint: iscrizione().endpoint });
    assert.equal(await prisma.iscrizionePush.count(), 1);
    await chiama('DELETE', '/iscrizione', { endpoint: iscrizione().endpoint }, altro);
    assert.equal(await prisma.iscrizionePush.count(), 0);
  });

  it('iscrizioni non valide: 400', async () => {
    for (const corpo of [
      {}, { endpoint: 'http://non-sicuro.example/x', keys: iscrizione().keys },
      { endpoint: 'non un indirizzo', keys: iscrizione().keys }, { endpoint: iscrizione().endpoint },
      { endpoint: iscrizione().endpoint, keys: { p256dh: 'x'.repeat(300), auth: 'y' } }
    ]) {
      assert.equal((await chiama('POST', '/iscrizione', corpo)).stato, 400, JSON.stringify(corpo).slice(0, 60));
    }
  });

  it('la prova arriva a tutti i dispositivi dell\'utente', async () => {
    await chiama('POST', '/iscrizione', iscrizione(1));
    await chiama('POST', '/iscrizione', iscrizione(2));
    const risposta = await chiama('POST', '/prova');
    assert.equal(risposta.corpo.dati.raggiunti, 2);
    const [destinatario, contenuto, opzioni] = invii.mock.calls[0].arguments;
    assert.deepEqual(destinatario.keys, iscrizione(1).keys);
    assert.deepEqual([JSON.parse(contenuto).titolo, JSON.parse(contenuto).sempre], ['🔔 Notifiche attive', true]);
    assert.equal(opzioni.urgency, 'normal');
  });

  it('un\'iscrizione revocata dal browser (410) si cancella', async () => {
    await chiama('POST', '/iscrizione', iscrizione());
    invii.mock.mockImplementation(async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); });
    assert.equal((await chiama('POST', '/prova')).corpo.dati.raggiunti, 0);
    assert.equal(await prisma.iscrizionePush.count(), 0);
  });

  it('le notifiche dell\'app arrivano anche come push', async () => {
    await chiama('POST', '/iscrizione', iscrizione());
    await creaNotifica(null, utente.id, { tipo: 'SISTEMA', titolo: 'Allenamento chiuso', messaggio: 'Prova', percorso: '/storico' });
    await attendi(100);
    assert.deepEqual(JSON.parse(invii.mock.calls[0].arguments[1]), {
      titolo: 'Allenamento chiuso', messaggio: 'Prova', percorso: '/storico', tag: 'SISTEMA'
    });
  });

  it('fine del recupero: la push arriva allo scadere, urgente e con vita breve', async () => {
    await chiama('POST', '/iscrizione', iscrizione());
    assert.equal((await chiama('POST', '/recupero', { secondi: 1, prossimo: 'Panca piana · serie 2' })).stato, 200);
    assert.equal(invii.mock.callCount(), 0);
    await attendi(1300);
    assert.equal(invii.mock.callCount(), 1);
    const [, contenuto, opzioni] = invii.mock.calls[0].arguments;
    assert.deepEqual(JSON.parse(contenuto), {
      titolo: '⏱️ Recupero finito', messaggio: 'Tocca a te: Panca piana · serie 2', percorso: '/allenamento', tag: 'recupero'
    });
    assert.deepEqual([opzioni.urgency, opzioni.TTL], ['high', 60]);
  });

  it('un recupero interrotto, o sostituito da uno nuovo, non avvisa', async () => {
    await chiama('POST', '/iscrizione', iscrizione());
    await chiama('POST', '/recupero', { secondi: 1 });
    assert.equal((await chiama('DELETE', '/recupero')).corpo.dati.annullato, true);
    await chiama('POST', '/recupero', { secondi: 1 });
    await chiama('POST', '/recupero', { secondi: 3 });
    await attendi(1300);
    assert.equal(invii.mock.callCount(), 0);
    await chiama('DELETE', '/recupero');
  });

  it('recupero non valido: 400', async () => {
    for (const corpo of [{}, { secondi: 0 }, { secondi: 901 }, { secondi: '30' }, { secondi: 30, prossimo: 'x'.repeat(121) }]) {
      assert.equal((await chiama('POST', '/recupero', corpo)).stato, 400, JSON.stringify(corpo).slice(0, 60));
    }
  });
});
