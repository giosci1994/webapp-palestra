// Every user's days, weeks and reminder hour are those of their own time
// zone: the one their phone sends in X-Fuso-Orario, saved for what happens
// outside a request (the reminders). Without one, the Copenhagen calendar.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaScheda, creaSessione } from '../supporto/dati.js';
import { inviaPromemoriaAllenamenti } from '../../src/services/notifiche.service.js';

let server;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(() => svuotaDatabase());

const GIORNO = 86400000;
const fusoSalvato = async chi => (await prisma.utente.findUnique({ where: { id: chi.id }, select: { fusoOrario: true } })).fusoOrario;
// The middleware saves it without making the request wait for the write
const pausa = () => new Promise(r => setTimeout(r, 100));

describe('the time zone the phone sends', () => {
  it('is saved for the user, and only a real one', async () => {
    const utente = await creaUtente();
    await server.richiesta('GET', '/notifiche', { token: tokenPer(utente), fuso: 'Asia/Tokyo' });
    await pausa();
    assert.equal(await fusoSalvato(utente), 'Asia/Tokyo');

    await server.richiesta('GET', '/notifiche', { token: tokenPer(utente), fuso: 'Marte/Olympus' });
    await pausa();
    assert.equal(await fusoSalvato(utente), 'Asia/Tokyo');
  });
});

describe('statistics by local day', () => {
  it('a workout in the evening in New York is already the next day in Tokyo', async () => {
    const utente = await creaUtente();
    const scheda = await creaScheda(utente);
    const adesso = new Date();
    const mezzanotte = Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate() - 10);
    // 20:00 UTC ten days ago: 15:00 or 16:00 in New York, 5:00 the next day in Tokyo
    await creaSessione(utente, scheda, { inizio: new Date(mezzanotte + 20 * 3600000) });

    const giorni = async fuso =>
      (await server.richiesta('GET', '/statistiche/attivita-annuale', { token: tokenPer(utente), fuso })).corpo.dati.map(g => g.giorno);
    const giorno = ms => new Date(ms).toISOString().slice(0, 10);
    assert.deepEqual(await giorni('America/New_York'), [giorno(mezzanotte)]);
    assert.deepEqual(await giorni('Asia/Tokyo'), [giorno(mezzanotte + GIORNO)]);
  });
});

describe('workout reminders', () => {
  it("go out from 8 in the morning of each user's own day, once", async () => {
    // 23:30 UTC on 12 October: 8:30 on the 13th in Tokyo, 19:30 on the 12th in
    // New York, 1:30 on the 13th in Copenhagen (the user who never sent a zone)
    const adesso = new Date('2026-10-12T23:30:00Z');
    const tokyo = await creaUtente({ fusoOrario: 'Asia/Tokyo' });
    const newYork = await creaUtente({ fusoOrario: 'America/New_York' });
    const copenaghen = await creaUtente();
    const pianifica = async (chi, data) => prisma.allenamentoPianificato.create({
      data: { utenteId: chi.id, schedaId: (await creaScheda(chi)).id, data: new Date(`${data}T00:00:00Z`) }
    });
    await pianifica(tokyo, '2026-10-13');
    await pianifica(newYork, '2026-10-12');
    await pianifica(newYork, '2026-10-13'); // tomorrow in New York: not in today's reminder
    await pianifica(copenaghen, '2026-10-13');

    assert.equal(await inviaPromemoriaAllenamenti(null, adesso), 2);
    const promemoria = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id, tipo: 'PROMEMORIA_ALLENAMENTO' } });
    assert.equal((await promemoria(tokyo)).length, 1);
    assert.equal((await promemoria(newYork)).length, 1);
    assert.match((await promemoria(newYork))[0].messaggio, /^Scheda \d+$/);
    assert.equal((await promemoria(copenaghen)).length, 0);

    // An hour later nobody gets it twice, and in Copenhagen it is still night
    assert.equal(await inviaPromemoriaAllenamenti(null, new Date(adesso.getTime() + 3600000)), 0);
    // 8:00 in Copenhagen: now its turn; still 2:00 in New York
    assert.equal(await inviaPromemoriaAllenamenti(null, new Date('2026-10-13T06:00:00Z')), 1);
    assert.equal((await promemoria(copenaghen)).length, 1);
    assert.equal((await promemoria(newYork)).length, 1);
  });
});
