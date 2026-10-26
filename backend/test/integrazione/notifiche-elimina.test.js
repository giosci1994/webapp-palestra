// Deleting notifications from the bell and the Notifiche tab: one, or all of
// them; only your own.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;
let altro;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  altro = await creaUtente();
});

const crea = (chi, dati = {}) => prisma.allenamentoNotifica.create({ data: { utenteId: chi.id, titolo: 'T', messaggio: 'M', ...dati } });
const elimina = (percorso, chi = utente, lingua) => server.richiesta('DELETE', percorso, { token: tokenPer(chi), lingua });
const titoli = async chi => (await prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id }, orderBy: { id: 'asc' } })).map(n => n.titolo);

describe('deleting notifications', () => {
  it('one: it goes, the others stay, and the unread count comes back', async () => {
    const prima = await crea(utente, { titolo: 'Prima' });
    await crea(utente, { titolo: 'Seconda' });
    await crea(utente, { titolo: 'Letta', letta: true });

    const risposta = await elimina(`/notifiche/${prima.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.nonLette, 1);
    assert.deepEqual(await titoli(utente), ['Seconda', 'Letta']);
  });

  it("someone else's, or one that does not exist, is a 404 and nothing goes", async () => {
    const sua = await crea(altro, { titolo: 'Sua' });
    const italiano = await elimina(`/notifiche/${sua.id}`);
    const inglese = await elimina('/notifiche/99999', utente, 'en');
    assert.deepEqual([italiano.stato, italiano.corpo.messaggio], [404, 'Notifica non trovata']);
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [404, 'Notification not found']);
    assert.deepEqual(await titoli(altro), ['Sua']);
  });

  it('all: only your own, read or not', async () => {
    await crea(utente, { titolo: 'A' });
    await crea(utente, { titolo: 'B', letta: true });
    await crea(altro, { titolo: 'Sua' });

    const risposta = await elimina('/notifiche');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati, { eliminate: 2, nonLette: 0 });
    assert.deepEqual(await titoli(utente), []);
    assert.deepEqual(await titoli(altro), ['Sua']);
  });

  it('only when signed in', async () => {
    const notifica = await crea(utente);
    assert.equal((await server.richiesta('DELETE', `/notifiche/${notifica.id}`)).stato, 401);
    assert.equal((await server.richiesta('DELETE', '/notifiche')).stato, 401);
    assert.equal(await prisma.allenamentoNotifica.count(), 1);
  });
});
