// Gamification: your profile (badges, XP, level), the leaderboard, a user's
// public profile with their privacy choices, and the records leaderboard.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaRecord, tokenPer, giorniFa, MINUTO } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ nome: 'Io' });
});

const leggi = (percorso, chi = utente) => server.richiesta('GET', percorso, { token: tokenPer(chi) });

/** A workout with its totals, finished unless { conclusa: false } */
function allenamento(chi, scheda, inizio, { minuti = 60, volume = null, conclusa = true } = {}) {
  return prisma.sessioneAllenamento.create({
    data: {
      utenteId: chi.id, schedaId: scheda.id, dataInizio: inizio, volumeTotaleKg: volume,
      ...(conclusa && { dataFine: new Date(inizio.getTime() + minuti * MINUTO), durataMinuti: minuti })
    }
  });
}

describe('your gamification profile', () => {
  it('counts what you did since the last reset, and unlocks badges, XP and level from it', async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { dataResetGamification: giorniFa(10) } });
    const scheda = await creaScheda(utente);
    await creaScheda(utente);
    await creaScheda(utente);
    await creaScheda(utente, [], { creatoIl: giorniFa(20) });
    const esercizio = await creaEsercizio();

    // Today and yesterday: two days in a row
    await allenamento(utente, scheda, new Date(), { minuti: 60, volume: 1200 });
    await allenamento(utente, scheda, giorniFa(1), { minuti: 30 });
    // Not counted: still open, and from before the reset
    await allenamento(utente, scheda, new Date(), { conclusa: false });
    await allenamento(utente, scheda, giorniFa(20), { minuti: 600, volume: 50000 });
    await creaRecord(utente, esercizio, 100);
    await creaRecord(utente, esercizio, 90, giorniFa(20));

    const risposta = await leggi('/gamification/profilo');
    assert.equal(risposta.stato, 200);
    const dati = risposta.corpo.dati;
    assert.deepEqual(dati.stats, { sessioni: 2, volume: 1200, durata: 90, record: 1, schede: 3, messaggi: 0, streak: 2 });
    assert.deepEqual(dati.badge.filter(b => b.sbloccato).map(b => b.id),
      ['primo_allenamento', 'tonnellata', 'primo_record', 'creatore']);
    assert.equal(dati.xp, 300);
    assert.deepEqual(dati.livello, { livello: 3, nome: 'Intermedio', prossimo: 600 });
    assert.equal(dati.badgeSbloccati, 4);
    assert.equal(dati.badgeTotali, dati.badge.length);
    assert.equal(dati.badgeTotali, 22);

    // The XP are saved for the leaderboard
    assert.equal((await prisma.utente.findUnique({ where: { id: utente.id } })).puntiEsperienza, 300);
  });

  it('a new account starts at level 1 with nothing unlocked', async () => {
    const { dati } = (await leggi('/gamification/profilo')).corpo;
    assert.equal(dati.xp, 0);
    assert.deepEqual(dati.livello, { livello: 1, nome: 'Principiante', prossimo: 100 });
    assert.equal(dati.badgeSbloccati, 0);
  });

  it('starting over from Profile brings everything back to zero', async () => {
    const scheda = await creaScheda(utente);
    await allenamento(utente, scheda, giorniFa(1), { volume: 2000 });
    assert.ok((await leggi('/gamification/profilo')).corpo.dati.xp > 0);

    const azzera = await server.richiesta('POST', '/utenti/reset-gamification', { token: tokenPer(utente) });
    assert.equal(azzera.stato, 200);
    assert.equal((await prisma.utente.findUnique({ where: { id: utente.id } })).puntiEsperienza, 0);
    const { dati } = (await leggi('/gamification/profilo')).corpo;
    assert.equal(dati.xp, 0);
    assert.equal(dati.stats.sessioni, 0);
  });
});

describe('leaderboard', () => {
  it('active users who play, by XP, with your position', async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { puntiEsperienza: 300 } });
    const primo = await creaUtente({ puntiEsperienza: 1600 });
    const terzo = await creaUtente({ puntiEsperienza: 100 });
    await creaUtente({ puntiEsperienza: 5000, gamificationAttiva: false });
    await creaUtente({ puntiEsperienza: 9000, stato: 'BANNATO' });

    const { dati } = (await leggi('/gamification/leaderboard')).corpo;
    assert.deepEqual(dati.classifica.map(u => [u.posizione, u.id]), [[1, primo.id], [2, utente.id], [3, terzo.id]]);
    assert.deepEqual(dati.classifica[0].livello, { livello: 6, nome: 'Maestro', prossimo: 2500 });
    assert.equal(dati.posizioneUtente, 2);
    assert.equal(dati.classifica[0].email, undefined);
  });

  it('whoever turned gamification off is not in it, and their position is 0', async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { gamificationAttiva: false, puntiEsperienza: 300 } });
    await creaUtente({ puntiEsperienza: 10 });
    const { dati } = (await leggi('/gamification/leaderboard')).corpo;
    assert.equal(dati.classifica.length, 1);
    assert.equal(dati.posizioneUtente, 0);
  });
});

describe('public profile', () => {
  let altro;
  let esercizio;
  beforeEach(async () => {
    const palestra = await prisma.palestra.create({ data: { nomeCatena: 'FitClub', citta: 'Copenaghen', indirizzo: 'Via 1' } });
    altro = await creaUtente({
      nome: 'Luca', bio: 'Powerlifter', puntiEsperienza: 700, palestraId: palestra.id,
      pesoKg: 90, altezzaCm: 185, dataNascita: new Date('1990-05-01'), obiettivoFitness: 'Forza'
    });
    esercizio = await creaEsercizio();
    await creaRecord(altro, esercizio, 180);
    await creaScheda(altro, [esercizio], { titolo: 'Pubblica', visibilita: 'GLOBALE' });
    await creaScheda(altro, [], { titolo: 'Privata' });
    const scheda = await creaScheda(altro);
    await allenamento(altro, scheda, giorniFa(2), { minuti: 45, volume: 3000.4 });
  });

  it('by default it shows the gym, the goal and the records, not the body or the statistics', async () => {
    const risposta = await leggi(`/gamification/profilo-pubblico/${altro.id}`);
    assert.equal(risposta.stato, 200);
    const p = risposta.corpo.dati;
    assert.equal(p.nome, 'Luca');
    assert.equal(p.bio, 'Powerlifter');
    assert.equal(p.livello.livello, 4);
    assert.deepEqual(p.palestra, { nomeCatena: 'FitClub', citta: 'Copenaghen' });
    assert.equal(p.obiettivoFitness, 'Forza');
    assert.deepEqual(p.record.map(r => r.pesoMaxRaggiunto), [180]);
    for (const nascosto of ['pesoKg', 'altezzaCm', 'dataNascita', 'statistiche', 'email']) {
      assert.equal(p[nascosto], undefined, nascosto);
    }
    // Only the plans shared with everyone
    assert.deepEqual(p.schedeGlobali.map(s => [s.titolo, s._count.esercizi]), [['Pubblica', 1]]);
  });

  it('follows what the user chose to show', async () => {
    await prisma.utente.update({
      where: { id: altro.id },
      data: { preferenzeVisibilita: JSON.stringify({ palestra: false, peso: true, altezza: true, eta: true, statistiche: true, record: false }) }
    });
    const p = (await leggi(`/gamification/profilo-pubblico/${altro.id}`)).corpo.dati;
    assert.equal(p.palestra, undefined);
    assert.equal(p.record, undefined);
    assert.equal(p.pesoKg, 90);
    assert.equal(p.altezzaCm, 185);
    assert.equal(p.dataNascita, '1990-05-01T00:00:00.000Z');
    assert.deepEqual(p.statistiche, { sessioni: 1, volume: 3000, durata: 45 });
  });

  it('broken preferences fall back to the defaults', async () => {
    await prisma.utente.update({ where: { id: altro.id }, data: { preferenzeVisibilita: '{rotto' } });
    const risposta = await leggi(`/gamification/profilo-pubblico/${altro.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.pesoKg, undefined);
    assert.equal(risposta.corpo.dati.record.length, 1);
  });

  it('a user who is not active, or does not exist, is not found', async () => {
    await prisma.utente.update({ where: { id: altro.id }, data: { stato: 'BANNATO' } });
    for (const id of [altro.id, 99999]) {
      const risposta = await leggi(`/gamification/profilo-pubblico/${id}`);
      assert.equal(risposta.stato, 404);
      assert.equal(risposta.corpo.messaggio, 'Utente non trovato');
    }
  });
});

describe('records leaderboard', () => {
  it('the best three users per exercise, each with their best weight; the fullest podiums first', async () => {
    const [panca, stacco, squat] = [await creaEsercizio({ nome: 'Panca' }), await creaEsercizio({ nome: 'Stacco' }), await creaEsercizio({ nome: 'Squat' })];
    const [a, b, c, d] = [await creaUtente(), await creaUtente(), await creaUtente(), await creaUtente()];
    const nonGioca = await creaUtente({ gamificationAttiva: false });
    const bannato = await creaUtente({ stato: 'BANNATO' });

    await creaRecord(a, panca, 100);
    await creaRecord(a, panca, 90);
    await creaRecord(b, panca, 95);
    await creaRecord(c, panca, 80);
    await creaRecord(d, panca, 70);
    await creaRecord(nonGioca, panca, 150);
    await creaRecord(bannato, panca, 160);
    await creaRecord(b, stacco, 60);
    await creaRecord(a, squat, 200);

    const { dati } = (await leggi('/gamification/classifica-record')).corpo;
    assert.deepEqual(
      dati.map(e => [e.esercizio.nome, e.top.map(t => [t.utente.id, t.pesoMax])]),
      [
        ['Panca', [[a.id, 100], [b.id, 95], [c.id, 80]]],
        ['Squat', [[a.id, 200]]],
        ['Stacco', [[b.id, 60]]]
      ]
    );
  });
});
