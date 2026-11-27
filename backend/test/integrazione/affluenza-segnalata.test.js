// POST /sessioni/:id/affluenza: how busy the gym is, said during a workout.
// One per workout, only on one's own open and recent workout, the gym taken
// by the server, the gym's day and hour; and nothing the app shows changes.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaScheda, creaSessione, MINUTO } from '../supporto/dati.js';
import { FUSO_ORARIO, orarioLocale } from '../../src/utils/date.js';
import { limitatoreSegnalazioni } from '../../src/middleware/limitatore.js';
import { eliminaAccount } from '../../src/services/eliminazioneAccount.service.js';
import { celleNostre, liveSegnalato, RICHIESTE_SEGNALAZIONE_ORA } from '../../src/utils/affluenzaSegnalata.js';

let server;
let palestra;
let altraPalestra;
let utente;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  // The ids start again from 1 in every test: so does the rate limit
  for (let id = 1; id <= 10; id++) await limitatoreSegnalazioni.resetKey(`user:${id}`);
  palestra = await prisma.palestra.create({ data: { nomeCatena: 'FitClub', citta: 'Copenaghen', indirizzo: 'Via 1' } });
  altraPalestra = await prisma.palestra.create({ data: { nomeCatena: 'Altra', citta: 'Roma', indirizzo: 'Via 2' } });
  utente = await creaUtente({ palestraId: palestra.id });
  scheda = await creaScheda(utente);
});

const aperta = (chi = utente, inizio = new Date(Date.now() - 10 * MINUTO)) => creaSessione(chi, scheda, { inizio, conclusa: false });
const segnala = (sessione, corpo = { livello: 2 }, opzioni = {}) =>
  server.richiesta('POST', `/sessioni/${sessione.id ?? sessione}/affluenza`, { token: tokenPer(opzioni.chi ?? utente), corpo, ...opzioni });

describe('reporting how busy the gym is', () => {
  it('saves the level with the gym of the user, never the one sent', async () => {
    const sessione = await aperta();
    const prima = orarioLocale(new Date(), FUSO_ORARIO);
    const { stato, corpo } = await segnala(sessione, { livello: 3, palestraId: altraPalestra.id }, { fuso: 'Pacific/Auckland' });
    const dopo = orarioLocale(new Date(), FUSO_ORARIO);
    assert.equal(stato, 201);
    assert.deepEqual(corpo.dati, { affluenzaSegnalata: true });

    const righe = await prisma.segnalazioneAffluenza.findMany();
    assert.equal(righe.length, 1);
    assert.deepEqual([righe[0].utenteId, righe[0].palestraId, righe[0].sessioneId, righe[0].livello], [utente.id, palestra.id, sessione.id, 3]);
    // The gym's weekday and hour, whatever the phone's time zone
    assert.ok([prima, dopo].some(o => o.ora === righe[0].ora && o.giornoSettimana === righe[0].giornoSettimana));
  });

  it('only once per workout', async () => {
    const sessione = await aperta();
    assert.equal((await segnala(sessione)).stato, 201);
    const seconda = await segnala(sessione, { livello: 0 });
    assert.equal(seconda.stato, 409);
    assert.equal(seconda.corpo.codice, 'GIA_SEGNALATA');
    assert.equal(seconda.corpo.messaggio, "Hai già detto quanta gente c'è durante questo allenamento");
    assert.equal(await prisma.segnalazioneAffluenza.count(), 1);
  });

  it("not on someone else's workout, nor on one that does not exist", async () => {
    const altro = await creaUtente({ palestraId: palestra.id });
    const sua = await aperta(altro);
    assert.equal((await segnala(sua)).stato, 403);
    assert.equal((await segnala(99999)).stato, 404);
    assert.equal(await prisma.segnalazioneAffluenza.count(), 0);
  });

  it('not on a finished workout, nor after the first 3 hours', async () => {
    const conclusa = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 60 * MINUTO) });
    const finita = await segnala(conclusa);
    assert.equal(finita.stato, 400);
    assert.equal(finita.corpo.messaggio, "L'allenamento è già concluso");
    const vecchia = await segnala(await aperta(utente, new Date(Date.now() - 181 * MINUTO)), { livello: 1 }, { lingua: 'en' });
    assert.equal(vecchia.stato, 400);
    assert.equal(vecchia.corpo.messaggio, 'You can only say how busy the gym is in the first 3 hours of a workout');
  });

  it('not without a gym', async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { palestraId: null } });
    const { stato, corpo } = await segnala(await aperta());
    assert.equal(stato, 400);
    assert.equal(corpo.messaggio, 'Prima scegli la tua palestra nel Profilo');
  });

  it('at most once every 30 minutes, even on different workouts', async () => {
    const prima = await aperta(utente, new Date(Date.now() - 100 * MINUTO));
    await prisma.sessioneAllenamento.update({ where: { id: prima.id }, data: { dataFine: new Date() } });
    const seconda = await aperta();
    await prisma.segnalazioneAffluenza.create({
      data: { utenteId: utente.id, palestraId: palestra.id, sessioneId: prima.id, livello: 1, giornoSettimana: 0, ora: 0, istante: new Date(Date.now() - 20 * MINUTO) }
    });
    const troppoPresto = await segnala(seconda);
    assert.equal(troppoPresto.stato, 409);
    assert.equal(troppoPresto.corpo.codice, 'SEGNALAZIONE_RECENTE');

    await prisma.segnalazioneAffluenza.updateMany({ data: { istante: new Date(Date.now() - 31 * MINUTO) } });
    assert.equal((await segnala(seconda)).stato, 201);
  });

  it('the level must be 0, 1, 2 or 3', async () => {
    const sessione = await aperta();
    for (const corpo of [{ livello: 4 }, { livello: -1 }, { livello: 1.5 }, { livello: 'tanta' }, {}, [2]]) {
      const { stato } = await segnala(sessione, corpo);
      assert.equal(stato, 400, JSON.stringify(corpo));
    }
    assert.equal((await segnala(sessione, { livello: '0' })).stato, 201);
  });

  it(`at most ${RICHIESTE_SEGNALAZIONE_ORA} requests an hour per user`, async () => {
    const sessione = await aperta();
    for (let i = 0; i < RICHIESTE_SEGNALAZIONE_ORA; i++) assert.notEqual((await segnala(sessione)).stato, 429);
    const oltre = await segnala(sessione);
    assert.equal(oltre.stato, 429);
    assert.equal(oltre.corpo.codice, 'TROPPE_SEGNALAZIONI');
  });

  it('needs to be signed in', async () => {
    const sessione = await aperta();
    assert.equal((await server.richiesta('POST', `/sessioni/${sessione.id}/affluenza`, { corpo: { livello: 1 } })).stato, 401);
  });
});

describe('affluenzaSegnalata in the workout', () => {
  it('false when it starts, true once reported, and the report itself never shows', async () => {
    const avviata = await server.richiesta('POST', '/sessioni', { token: tokenPer(utente), corpo: { schedaId: scheda.id } });
    assert.equal(avviata.stato, 201);
    assert.equal(avviata.corpo.dati.affluenzaSegnalata, false);

    const dettaglio = () => server.richiesta('GET', `/sessioni/${avviata.corpo.dati.id}`, { token: tokenPer(utente) });
    assert.equal((await dettaglio()).corpo.dati.affluenzaSegnalata, false);
    await segnala(avviata.corpo.dati);
    const { corpo } = await dettaglio();
    assert.equal(corpo.dati.affluenzaSegnalata, true);
    assert.ok(!('segnalazioneAffluenza' in corpo.dati));
  });
});

describe('the reports go away', () => {
  it('with the workout and with the account', async () => {
    await creaUtente({ ruolo: 'SUPERADMIN' });
    const una = await aperta();
    await segnala(una);
    assert.equal((await server.richiesta('DELETE', `/sessioni/${una.id}`, { token: tokenPer(utente) })).stato, 200);
    assert.equal(await prisma.segnalazioneAffluenza.count(), 0);

    const due = await aperta();
    await prisma.segnalazioneAffluenza.create({
      data: { utenteId: utente.id, palestraId: palestra.id, sessioneId: due.id, livello: 2, giornoSettimana: 0, ora: 0 }
    });
    await eliminaAccount(utente.id);
    assert.equal(await prisma.segnalazioneAffluenza.count(), 0);
  });
});

describe('the aggregates from the database', () => {
  it('celleNostre and liveSegnalato read only this gym, and give no user ids', async () => {
    const altro = await creaUtente({ palestraId: palestra.id });
    const adesso = new Date();
    for (const [chi, palestraId] of [[utente, palestra.id], [altro, palestra.id], [altro, altraPalestra.id]]) {
      const sessione = await aperta(chi);
      await prisma.segnalazioneAffluenza.create({
        data: { utenteId: chi.id, palestraId, sessioneId: sessione.id, livello: 2, giornoSettimana: 1, ora: 18, istante: new Date(adesso - 5 * MINUTO) }
      });
    }
    const celle = await celleNostre(palestra.id, adesso);
    assert.deepEqual(celle.map(c => [c.giornoSettimana, c.ora, c.segnalazioni, c.utenti, c.sufficiente]), [[1, 18, 2, 2, false]]);
    const live = await liveSegnalato(palestra.id, adesso);
    assert.deepEqual([live.segnalazioni, live.livelloPercentuale], [2, 55]);
    assert.equal(await liveSegnalato(altraPalestra.id, adesso), null);
  });
});

describe('what the app shows does not change yet', () => {
  it('GET /palestre/:id/affluenza and the best times are the same with or without reports', async () => {
    await prisma.afluenzaPalestra.createMany({
      data: Array.from({ length: 7 * 24 }, (_, i) => ({ palestraId: palestra.id, giornoSettimana: Math.floor(i / 24), ora: i % 24, livelloPercentuale: (i * 7) % 100 }))
    });
    const leggi = async () => [
      (await server.richiesta('GET', `/palestre/${palestra.id}/affluenza`)).corpo,
      (await server.richiesta('GET', `/palestre/${palestra.id}/affluenza/migliori-orari`)).corpo
    ];
    const prima = await leggi();

    const { ora, giornoSettimana } = orarioLocale(new Date(), FUSO_ORARIO);
    const altri = await Promise.all([1, 2, 3].map(() => creaUtente({ palestraId: palestra.id })));
    for (let i = 0; i < 20; i++) {
      const chi = [utente, ...altri][i % 4];
      const sessione = await aperta(chi);
      await prisma.segnalazioneAffluenza.create({
        data: { utenteId: chi.id, palestraId: palestra.id, sessioneId: sessione.id, livello: 3, giornoSettimana, ora, istante: new Date(Date.now() - i * MINUTO) }
      });
    }
    assert.deepEqual(await leggi(), prima);
  });
});
