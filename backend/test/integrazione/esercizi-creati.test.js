// Exercises created by hand: the admin panel and the personal trainers share
// one check of the form (services/esercizi.service.js). Before, the fields
// went straight to the database: a missing name was a 500.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let admin;
let trainer;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
  trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
});

const crea = (chi, percorso, corpo) => server.richiesta('POST', percorso, { token: tokenPer(chi), corpo });

describe('exercises created by the admin and by a trainer', () => {
  it('both create it the same way, with the Italian name for the search', async () => {
    const bilanciere = await prisma.attrezzatura.create({ data: { nome: 'Bilanciere', categoria: 'PESI_LIBERI' } });
    for (const [chi, percorso] of [[admin, '/admin/esercizi'], [trainer, '/pt/esercizi']]) {
      const risposta = await crea(chi, percorso, {
        nome: '  Barbell Bench Press ', gruppoMuscoloPrimario: 'Petto', attrezzaturaRichiestaId: String(bilanciere.id),
        linkVideo: 'https://www.youtube.com/watch?v=abc', difficulty: 'Intermedio', descrizione: ''
      });
      assert.equal(risposta.stato, 201, percorso);
      const { dati } = risposta.corpo;
      assert.equal(dati.nome, 'Barbell Bench Press');
      assert.equal(dati.nomeIt, 'Distensioni su Panca con Bilanciere');
      assert.equal(dati.attrezzatura.nome, 'Bilanciere');
      assert.equal(dati.descrizione, null);
    }
    const italiano = await crea(admin, '/admin/esercizi', { nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    assert.equal(italiano.corpo.dati.nomeIt, null);
  });

  it('a wrong form answers 400 and saves nothing', async () => {
    const casi = [
      [{ gruppoMuscoloPrimario: 'Petto' }, /nome/],
      [{ nome: '   ', gruppoMuscoloPrimario: 'Petto' }, /nome/],
      [{ nome: 'Squat' }, /gruppoMuscoloPrimario/],
      [{ nome: 'x'.repeat(201), gruppoMuscoloPrimario: 'Petto' }, /200/],
      [{ nome: 'Squat', gruppoMuscoloPrimario: 'Gambe', linkVideo: 'javascript:alert(1)' }, /link/i],
      [{ nome: 'Squat', gruppoMuscoloPrimario: 'Gambe', attrezzaturaRichiestaId: 99999 }, /Attrezzatura/],
      [{ nome: 'Squat', gruppoMuscoloPrimario: 'Gambe', difficulty: { livello: 3 } }, /difficulty/]
    ];
    for (const [corpo, messaggio] of casi) {
      for (const [chi, percorso] of [[admin, '/admin/esercizi'], [trainer, '/pt/esercizi']]) {
        const risposta = await crea(chi, percorso, corpo);
        assert.equal(risposta.stato, 400, `${percorso} ${JSON.stringify(corpo).slice(0, 60)}`);
        assert.match(risposta.corpo.messaggio, messaggio);
      }
    }
    assert.equal(await prisma.esercizio.count(), 0);
  });

  it('the admin updates it with the whole form, and the Italian name stays', async () => {
    const { corpo } = await crea(admin, '/admin/esercizi', { nome: 'Dumbbell Curl', gruppoMuscoloPrimario: 'Bicipiti' });
    const modifica = await server.richiesta('PUT', `/admin/esercizi/${corpo.dati.id}`, {
      token: tokenPer(admin), corpo: { nome: 'Dumbbell Curl', gruppoMuscoloPrimario: 'Bicipiti', mechanics: 'Isolamento' }
    });
    assert.equal(modifica.stato, 200);
    assert.equal(modifica.corpo.dati.mechanics, 'Isolamento');
    assert.equal(modifica.corpo.dati.nomeIt, 'Curl con Manubri');
    const vuota = await server.richiesta('PUT', `/admin/esercizi/${corpo.dati.id}`, { token: tokenPer(admin), corpo: { nome: '' } });
    assert.equal(vuota.stato, 400);
  });

  it('an ordinary user cannot create one', async () => {
    const utente = await creaUtente();
    assert.equal((await crea(utente, '/pt/esercizi', { nome: 'Squat', gruppoMuscoloPrimario: 'Gambe' })).stato, 403);
    assert.equal((await crea(utente, '/admin/esercizi', { nome: 'Squat', gruppoMuscoloPrimario: 'Gambe' })).stato, 403);
  });
});
