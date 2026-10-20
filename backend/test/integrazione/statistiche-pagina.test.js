// The Statistics page: summary, muscles and exercises, records, the trend of
// an exercise, weekly frequency and the yearly grid. The requests come from a
// phone on UTC, so the expected days are UTC days.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaSessione, creaRecord, tokenPer, giorniFa, GIORNO } from '../supporto/dati.js';

let server;
let utente;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  scheda = await creaScheda(utente);
});

const leggi = (percorso, chi = utente) => server.richiesta('GET', percorso, { token: tokenPer(chi), fuso: 'UTC' });
const giorno = istante => istante.toISOString().slice(0, 10);

/** A finished workout with its totals, as the end of a workout saves them */
function allenamento(inizio, { minuti = 60, volume = null, conclusa = true, chi = utente } = {}) {
  return prisma.sessioneAllenamento.create({
    data: {
      utenteId: chi.id, schedaId: scheda.id, dataInizio: inizio, volumeTotaleKg: volume,
      ...(conclusa && { dataFine: new Date(inizio.getTime() + minuti * 60000), durataMinuti: minuti })
    }
  });
}

describe('summary', () => {
  beforeEach(async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { dataResetStatistiche: giorniFa(40) } });
    await creaScheda(utente);
    const esercizio = await creaEsercizio();
    await allenamento(new Date(), { minuti: 60, volume: 1000 });
    await allenamento(new Date(Date.now() - GIORNO), { minuti: 30, volume: 500.6 });
    await allenamento(giorniFa(7), { minuti: 45 });
    // Not counted: still open, and from before the reset
    await allenamento(new Date(), { conclusa: false });
    await allenamento(giorniFa(60), { minuti: 90, volume: 9999 });
    await creaRecord(utente, esercizio, 100);
    await creaRecord(utente, esercizio, 90, giorniFa(50));
  });

  it('totals since the reset, days in a row and weeks in a row', async () => {
    const risposta = await leggi('/statistiche/riepilogo');
    assert.equal(risposta.stato, 200);
    const { ultimeSettimane, ...dati } = risposta.corpo.dati;
    assert.deepEqual(dati, {
      totaleSessioni: 3, totaleDurata: 135, totaleVolume: 1501, totaleRecord: 1,
      streak: 2, schedeCreate: 2, settimaneDiFila: 2
    });
    // From the oldest week to this one
    assert.deepEqual(ultimeSettimane, [...Array(10).fill(false), true, true]);
  });

  it('starting over from Profile counts from now, and keeps the plans', async () => {
    const azzera = await server.richiesta('POST', '/utenti/reset-statistiche', { token: tokenPer(utente) });
    assert.equal(azzera.stato, 200);
    assert.equal(azzera.corpo.messaggio, 'Statistiche azzerate con successo');

    const { ultimeSettimane, ...dati } = (await leggi('/statistiche/riepilogo')).corpo.dati;
    assert.deepEqual(dati, {
      totaleSessioni: 0, totaleDurata: 0, totaleVolume: 0, totaleRecord: 0,
      streak: 0, schedeCreate: 2, settimaneDiFila: 0
    });
    assert.ok(ultimeSettimane.every(attiva => !attiva));
  });
});

describe('muscles and exercises', () => {
  let panca;
  let curl;
  let corsa;
  let a;
  let b;
  beforeEach(async () => {
    panca = await creaEsercizio({ nome: 'Panca', gruppoMuscoloPrimario: 'Petto', gruppoMuscoloSecondario: 'Tricipiti, Spalle' });
    curl = await creaEsercizio({ nome: 'Curl', gruppoMuscoloPrimario: 'Bicipiti' });
    corsa = await creaEsercizio({ nome: 'Corsa', gruppoMuscoloPrimario: 'Cardio' });
    a = await creaSessione(utente, scheda, { inizio: giorniFa(5), serie: [
      { esercizio: panca, peso: 40, rep: 10, tipo: 'RISCALDAMENTO' },
      { esercizio: panca, peso: 80, rep: 8 },
      { esercizio: panca, peso: 85, rep: 5 },
      { esercizio: panca, peso: 100, rep: 1 },
      { esercizio: panca, peso: 60, rep: 8, tipo: 'DROP' },
      { esercizio: curl, peso: 20, rep: 10, completato: false }
    ] });
    b = await creaSessione(utente, scheda, { inizio: giorniFa(2), serie: [
      { esercizio: panca, peso: 82, rep: 6 },
      { esercizio: panca, peso: 82, rep: 8 },
      { esercizio: curl, peso: 25, rep: 10 },
      { esercizio: corsa, peso: 0, rep: 0, durataMinuti: 20 }
    ] });
    // Someone else's sets do not count
    const altro = await creaUtente();
    await creaSessione(altro, await creaScheda(altro), { inizio: giorniFa(1), serie: [{ esercizio: panca, peso: 200, rep: 1 }] });
  });

  it('working sets per group in the period, the secondary ones at half', async () => {
    const risposta = await leggi('/statistiche/muscoli?giorni=30');
    assert.equal(risposta.stato, 200);
    const { periodo, gruppi } = risposta.corpo.dati;
    assert.equal(periodo.giorni, 30);
    assert.equal(periodo.settimane, 4.3);

    const gruppo = nome => gruppi.find(g => g.nome === nome);
    assert.equal(gruppi[0].nome, 'Petto');
    assert.deepEqual(gruppo('Petto'), {
      nome: 'Petto', muscolare: true, seriePeriodo: 5, serieDirettePeriodo: 5, serieSettimanali: 1.2,
      ultimaData: b.dataInizio.toISOString(), ultimaDataDiretta: b.dataInizio.toISOString(),
      esercizi: [panca.id], eserciziSecondari: []
    });
    assert.deepEqual(gruppo('Tricipiti'), {
      nome: 'Tricipiti', muscolare: true, seriePeriodo: 2.5, serieDirettePeriodo: 0, serieSettimanali: 0.6,
      ultimaData: b.dataInizio.toISOString(), ultimaDataDiretta: null,
      esercizi: [], eserciziSecondari: [panca.id]
    });
    assert.equal(gruppo('Bicipiti').seriePeriodo, 1);
    assert.equal(gruppo('Cardio').muscolare, false);
    // A main group never trained is there anyway, empty
    assert.deepEqual([gruppo('Femorali').seriePeriodo, gruppo('Femorali').ultimaData], [0, null]);
  });

  it('per exercise: the best set of the last time, the true max and the estimated one', async () => {
    const { esercizi } = (await leggi('/statistiche/muscoli?giorni=30')).corpo.dati;
    assert.deepEqual(esercizi[panca.id], {
      id: panca.id, nome: 'Panca', nomeIt: null, serie: 5, seriePeriodo: 5, sessioni: 2,
      ultimo: { data: b.dataInizio.toISOString(), peso: 82, rep: 8, minuti: null },
      massimale: { peso: 100, data: a.dataInizio.toISOString() },
      // Epley on 82 × 8, to the half kilo
      stimato: { peso: 104, data: b.dataInizio.toISOString(), daPeso: 82, daRip: 8 }
    });
    assert.deepEqual(esercizi[curl.id].stimato, { peso: 33.5, data: b.dataInizio.toISOString(), daPeso: 25, daRip: 10 });
    assert.equal(esercizi[curl.id].serie, 1);
    assert.deepEqual(esercizi[corsa.id].ultimo, { data: b.dataInizio.toISOString(), peso: 0, rep: 0, minuti: 20 });
    assert.equal(esercizi[corsa.id].stimato, null);
  });

  it('the period is between 1 day and 10 years, 30 days if missing', async () => {
    const periodo = async query => (await leggi(`/statistiche/muscoli${query}`)).corpo.dati.periodo.giorni;
    assert.equal(await periodo(''), 30);
    assert.equal(await periodo('?giorni=abc'), 30);
    assert.equal(await periodo('?giorni=-4'), 1);
    assert.equal(await periodo('?giorni=99999'), 3650);
    // Workouts out of the period do not count
    const { gruppi } = (await leggi('/statistiche/muscoli?giorni=3')).corpo.dati;
    assert.equal(gruppi.find(g => g.nome === 'Petto').seriePeriodo, 2);
  });

  it('the trend of an exercise: one point per day, warm-up and drop sets left out', async () => {
    const risposta = await leggi(`/statistiche/progressione/${panca.id}`);
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati, [
      // The heaviest set of the day; the best estimate comes from 80 × 8
      { data: giorno(a.dataInizio), peso: 100, rip: 1, minuti: null, stimato: 101.5, massimale: 100 },
      { data: giorno(b.dataInizio), peso: 82, rip: 8, minuti: null, stimato: 104, massimale: null }
    ]);

    // Since the statistics reset only
    await prisma.utente.update({ where: { id: utente.id }, data: { dataResetStatistiche: giorniFa(3) } });
    assert.deepEqual((await leggi(`/statistiche/progressione/${panca.id}`)).corpo.dati.map(p => p.data), [giorno(b.dataInizio)]);
  });
});

describe('records', () => {
  it('yours since the reset, the most recent first', async () => {
    const esercizio = await creaEsercizio({ nome: 'Stacco' });
    await prisma.utente.update({ where: { id: utente.id }, data: { dataResetStatistiche: giorniFa(30) } });
    await creaRecord(utente, esercizio, 150, giorniFa(10));
    await creaRecord(utente, esercizio, 160, giorniFa(1));
    await creaRecord(utente, esercizio, 120, giorniFa(60));
    await creaRecord(await creaUtente(), esercizio, 300);

    const { dati } = (await leggi('/statistiche/record')).corpo;
    assert.deepEqual(dati.map(r => r.pesoMaxRaggiunto), [160, 150]);
    assert.equal(dati[0].esercizio.nome, 'Stacco');
  });

  it('you delete your own; someone else\'s only an admin', async () => {
    const esercizio = await creaEsercizio();
    const altro = await creaUtente();
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });
    const mio = await creaRecord(utente, esercizio, 100);
    const suo = await creaRecord(altro, esercizio, 100);
    const elimina = (record, chi) => server.richiesta('DELETE', `/statistiche/record/${record.id}`, { token: tokenPer(chi) });

    const vietato = await elimina(suo, utente);
    assert.equal(vietato.stato, 403);
    assert.equal(vietato.corpo.messaggio, 'Non autorizzato');

    const eliminato = await elimina(mio, utente);
    assert.equal(eliminato.stato, 200);
    assert.equal(eliminato.corpo.messaggio, 'Record eliminato');
    assert.equal((await elimina(suo, admin)).stato, 200);
    assert.equal(await prisma.recordPersonale.count(), 0);
  });
});

describe('weekly frequency', () => {
  it('the last 12 weeks: workouts done and those on the calendar', async () => {
    const oggi = new Date();
    await allenamento(oggi);
    await allenamento(new Date(oggi.getTime() - 14 * GIORNO));
    await allenamento(new Date(oggi.getTime() - 14 * GIORNO));
    await allenamento(giorniFa(200));
    await allenamento(oggi, { conclusa: false });
    await allenamento(oggi, { chi: await creaUtente() });
    const giornoUtc = istante => new Date(giorno(istante));
    await prisma.allenamentoPianificato.createMany({ data: [
      { utenteId: utente.id, schedaId: scheda.id, data: giornoUtc(oggi) },
      { utenteId: utente.id, schedaId: scheda.id, data: giornoUtc(new Date(oggi.getTime() - 7 * GIORNO)), stato: 'SALTATO' }
    ] });

    const risposta = await leggi('/statistiche/frequenza');
    assert.equal(risposta.stato, 200);
    const settimane = risposta.corpo.dati;
    assert.equal(settimane.length, 12);
    const lunedi = new Date(giornoUtc(oggi).getTime() - ((oggi.getUTCDay() + 6) % 7) * GIORNO);
    assert.equal(settimane[11].settimana, giorno(lunedi));
    assert.equal(settimane[0].settimana, giorno(new Date(lunedi.getTime() - 11 * 7 * GIORNO)));
    assert.deepEqual(settimane.map(s => [s.fatti, s.programmati]), [
      ...Array(9).fill([0, 0]), [2, 0], [0, 1], [1, 1]
    ]);
  });
});

describe('yearly activity', () => {
  it('per day: the workouts and their completed working sets, for the last 53 weeks', async () => {
    const esercizio = await creaEsercizio();
    // Midday: the second workout, a second later, is on the same day
    const ieri = new Date(`${giorno(new Date(Date.now() - GIORNO))}T12:00:00Z`);
    await creaSessione(utente, scheda, { inizio: ieri, serie: [
      { esercizio, peso: 50, rep: 10 }, { esercizio, peso: 50, rep: 10 },
      { esercizio, peso: 20, rep: 10, tipo: 'RISCALDAMENTO' }, { esercizio, peso: 50, rep: 10, completato: false }
    ] });
    await creaSessione(utente, scheda, { inizio: new Date(ieri.getTime() + 1000), serie: [{ esercizio, peso: 50, rep: 5 }] });
    await creaSessione(utente, scheda, { inizio: giorniFa(10) });
    await creaSessione(utente, scheda, { inizio: giorniFa(400), serie: [{ esercizio, peso: 50, rep: 5 }] });
    await creaSessione(utente, scheda, { inizio: ieri, conclusa: false, serie: [{ esercizio, peso: 50, rep: 5 }] });

    const risposta = await leggi('/statistiche/attivita-annuale');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati, [
      { giorno: giorno(giorniFa(10)), allenamenti: 1, serie: 0 },
      { giorno: giorno(ieri), allenamenti: 2, serie: 3 }
    ]);
  });
});
