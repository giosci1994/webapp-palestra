// The texts the routes build for the app (badges, levels, crowd labels, route
// errors, "what's new" stories) come in the language of the request.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
});

const leggi = (percorso, lingua) => server.richiesta('GET', percorso, { token: tokenPer(utente), lingua });

describe('texts built by the routes', () => {
  it('badge names and descriptions, and the level name, follow the request language', async () => {
    const [it, en] = await Promise.all([leggi('/gamification/profilo', 'it'), leggi('/gamification/profilo', 'en')]);
    const primo = r => r.corpo.dati.badge.find(b => b.id === 'primo_allenamento');
    assert.deepEqual([primo(it).nome, primo(it).desc], ['Prima Volta', 'Completa il primo allenamento']);
    assert.deepEqual([primo(en).nome, primo(en).desc], ['First Time', 'Complete your first workout']);
    assert.equal(it.corpo.dati.livello.nome, 'Principiante');
    assert.equal(en.corpo.dati.livello.nome, 'Beginner');
    // The shape of a badge does not change: no internal key leaks out
    assert.deepEqual(Object.keys(primo(en)).sort(), ['desc', 'icona', 'id', 'nome', 'sbloccato', 'xp']);
  });

  it('the crowd level label follows the request language', async () => {
    const it = await leggi('/palestre/999/affluenza', 'it');
    const en = await leggi('/palestre/999/affluenza', 'en');
    assert.equal(it.corpo.dati.livelloTesto, 'Nessun dato');
    assert.equal(en.corpo.dati.livelloTesto, 'No data');
    assert.equal(en.corpo.dati.livelloColore, 'grigio');
  });

  it('an unknown route and a missing record are explained in the request language', async () => {
    const it = await leggi('/rotta-inesistente', 'it');
    const en = await leggi('/rotta-inesistente', 'en');
    assert.equal(it.corpo.messaggio, 'La rotta GET /api/v1/rotta-inesistente non esiste');
    assert.equal(en.corpo.messaggio, 'Route GET /api/v1/rotta-inesistente does not exist');

    const record = await server.richiesta('DELETE', '/statistiche/record/999999', { token: tokenPer(utente), lingua: 'en' });
    assert.equal(record.stato, 404);
    assert.equal(record.corpo.messaggio, 'Record not found');
  });

  it("\"what's new\" stories come in the app's language when they have it, in Italian otherwise", async () => {
    await prisma.novita.createMany({ data: [
      {
        titolo: 'Notifiche', sottotitolo: 'Anche a schermo bloccato', ordine: 1,
        punti: JSON.stringify([{ icona: '⏱️', testo: 'Recupero finito' }]), ctaTesto: 'Attivale', ctaRotta: '/profilo',
        traduzioni: JSON.stringify({ en: {
          titolo: 'Notifications', sottotitolo: 'Even with the screen locked',
          punti: [{ icona: '⏱️', testo: 'Rest is over' }], ctaTesto: 'Turn them on'
        } })
      },
      { titolo: 'Solo in italiano', ordine: 2 }
    ] });

    const [it, en] = await Promise.all([leggi('/novita', 'it'), leggi('/novita', 'en')]);
    assert.deepEqual(it.corpo.dati.map(n => n.titolo), ['Notifiche', 'Solo in italiano']);
    assert.deepEqual(en.corpo.dati.map(n => n.titolo), ['Notifications', 'Solo in italiano']);
    const [inglese] = en.corpo.dati;
    assert.equal(inglese.sottotitolo, 'Even with the screen locked');
    assert.deepEqual(JSON.parse(inglese.punti), [{ icona: '⏱️', testo: 'Rest is over' }]);
    assert.deepEqual([inglese.ctaTesto, inglese.ctaRotta], ['Turn them on', '/profilo']);
    assert.equal(it.corpo.dati[0].ctaTesto, 'Attivale');
    // The translations stay on the server
    assert.ok(en.corpo.dati.every(n => !('traduzioni' in n)));
  });
});
