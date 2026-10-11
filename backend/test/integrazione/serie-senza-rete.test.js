// Sets logged without a network: the phone queues them and sends them when
// the connection comes back, even hours later (frontend/src/utils/codaSerie.js).
// Each one arrives with its key and the time it was done; "Termina" (finish)
// arrives with the time it was tapped.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, MINUTO } from '../supporto/dati.js';
import { chiudiSessioniDimenticate } from '../../src/services/conclusioneSessione.service.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Panca piana' });
  scheda = await creaScheda(utente, [panca]);
});

const minutiFa = n => new Date(Date.now() - n * MINUTO);
/** An open workout, started `inizio` minutes ago, with 80 kg sets logged that many minutes ago */
const aperto = (inizio, ...serie) => creaSessione(utente, scheda, {
  inizio: minutiFa(inizio),
  conclusa: false,
  serie: serie.map(n => ({ esercizio: panca, peso: 80, rep: 8, registrataIl: minutiFa(n) }))
});
const inviaSerie = (sessione, corpo, chi = utente) => server.richiesta('POST', `/sessioni/${sessione.id}/serie`, {
  token: tokenPer(chi), corpo: { esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 80, repEffettive: 8, ...corpo }
});
const serieDi = sessione => prisma.logSerie.findMany({ where: { sessioneId: sessione.id }, orderBy: { id: 'asc' } });
const sessioneDb = sessione => prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });

describe('la stessa serie inviata due volte', () => {
  it('si registra una volta sola: il secondo invio riceve quella gia\' salvata', async () => {
    const sessione = await aperto(30);
    const prima = await inviaSerie(sessione, { idClient: 'serie-0001' });
    const seconda = await inviaSerie(sessione, { idClient: 'serie-0001' });

    assert.equal(prima.stato, 201);
    assert.equal(seconda.stato, 200);
    assert.equal(seconda.corpo.dati.id, prima.corpo.dati.id);
    assert.equal((await serieDi(sessione)).length, 1);
  });

  it('anche se i due invii arrivano insieme', async () => {
    const sessione = await aperto(30);
    const risposte = await Promise.all([1, 2, 3].map(() => inviaSerie(sessione, { idClient: 'serie-insieme' })));

    assert.ok(risposte.every(r => r.stato === 200 || r.stato === 201), risposte.map(r => r.stato).join());
    assert.equal(new Set(risposte.map(r => r.corpo.dati.id)).size, 1);
    assert.equal((await serieDi(sessione)).length, 1);
  });

  it('serie diverse con chiavi diverse si registrano tutte, e senza chiave come prima', async () => {
    const sessione = await aperto(30);
    await inviaSerie(sessione, { idClient: 'serie-0001' });
    await inviaSerie(sessione, { idClient: 'serie-0002', serieNumero: 2 });
    await inviaSerie(sessione, { serieNumero: 3 });
    await inviaSerie(sessione, { serieNumero: 3 });
    assert.equal((await serieDi(sessione)).length, 4);
  });

  it('rifiuta una chiave che non e\' un identificativo', async () => {
    const sessione = await aperto(30);
    for (const idClient of ['corta', 'con spazi e accenti è', 42]) {
      const risposta = await inviaSerie(sessione, { idClient });
      assert.equal(risposta.stato, 400, String(idClient));
      assert.equal(risposta.corpo.messaggio, 'idClient non valido');
    }
  });
});

describe("l'ora della serie", () => {
  it("una serie arrivata in ritardo prende l'ora in cui e' stata fatta", async () => {
    const sessione = await aperto(60);
    const fatta = minutiFa(40);
    await inviaSerie(sessione, { idClient: 'serie-0001', registrataIl: fatta.toISOString() });
    const [serie] = await serieDi(sessione);
    assert.equal(serie.registrataIl.getTime(), fatta.getTime());
  });

  it("un orologio indietro non la mette prima dell'inizio", async () => {
    const sessione = await aperto(60);
    await inviaSerie(sessione, { registrataIl: minutiFa(90).toISOString() });
    const [serie] = await serieDi(sessione);
    assert.equal(serie.registrataIl.getTime(), sessione.dataInizio.getTime());
  });
});

describe('"Termina" toccato senza rete', () => {
  it("arriva dopo, e l'allenamento finisce quando e' stato toccato", async () => {
    const sessione = await aperto(90, 80, 60);
    const risposta = await server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, {
      token: tokenPer(utente), corpo: { conclusaIl: minutiFa(50).toISOString() }
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dimenticata, false);
    assert.equal(risposta.corpo.dati.durataMinuti, 40);
  });

  it("rifiuta un'ora che non si legge", async () => {
    const sessione = await aperto(90, 80);
    const risposta = await server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, {
      token: tokenPer(utente), corpo: { conclusaIl: 'adesso' }
    });
    assert.equal(risposta.stato, 400);
    assert.equal((await sessioneDb(sessione)).dataFine, null);
  });
});

describe("serie arrivate dopo che il server ha chiuso l'allenamento", () => {
  it('lo richiudono contandole: durata, volume e record le comprendono', async () => {
    // One set arrived, then the phone lost the network: after two hours the
    // server closes the workout at the last set it knows about
    const sessione = await aperto(300, 290);
    await chiudiSessioniDimenticate(null);
    assert.equal((await sessioneDb(sessione)).durataMinuti, 10);

    const fatta = minutiFa(260);
    const risposta = await inviaSerie(sessione, {
      idClient: 'serie-0002', serieNumero: 2, pesoEffettivo: 90, repEffettive: 5, registrataIl: fatta.toISOString()
    });
    assert.equal(risposta.stato, 201);

    const richiusa = await sessioneDb(sessione);
    assert.equal(richiusa.dataFine.getTime(), fatta.getTime());
    assert.equal(richiusa.durataMinuti, 40);
    assert.equal(richiusa.volumeTotaleKg, 80 * 8 + 90 * 5);
    // The 90 kg record belongs to the day of the workout, not to when it arrived
    const record = await prisma.recordPersonale.findFirst({ where: { utenteId: utente.id, pesoMaxRaggiunto: 90 } });
    assert.equal(record.dataRecord.getTime(), fatta.getTime());
  });

  it('una serie fatta prima di "Termina" non sposta la fine', async () => {
    const sessione = await aperto(60, 50);
    await server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, {
      token: tokenPer(utente), corpo: { conclusaIl: minutiFa(20).toISOString() }
    });

    await inviaSerie(sessione, { serieNumero: 2, registrataIl: minutiFa(30).toISOString() });
    const chiusa = await sessioneDb(sessione);
    assert.equal(chiusa.durataMinuti, 40);
    assert.equal(chiusa.volumeTotaleKg, 2 * 80 * 8);
  });
});
