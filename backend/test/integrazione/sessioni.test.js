// Avvio, chiusura e correzione degli allenamenti (PATCH /sessioni/:id),
// attraverso le rotte vere e un database vero.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import {
  creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, creaRecord, giorniFa, MINUTO
} from '../supporto/dati.js';
import { giornoLocale } from '../../src/utils/date.js';

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

const correggi = (sessione, corpo, chi = utente) =>
  server.richiesta('PATCH', `/sessioni/${sessione.id}`, { token: tokenPer(chi), corpo });

/** I record dell'utente per un esercizio, dal piu' basso */
const recordDi = (chi, esercizio) => prisma.recordPersonale.findMany({
  where: { utenteId: chi.id, esercizioId: esercizio.id },
  orderBy: { pesoMaxRaggiunto: 'asc' }
});

describe('correzione di un allenamento: chi puo\' farla', () => {
  it("un altro utente non puo' correggere l'allenamento", async () => {
    const sessione = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    const altro = await creaUtente();

    const risposta = await correggi(sessione, { noteFinali: 'scritto da un altro' }, altro);
    assert.equal(risposta.stato, 403);
    assert.equal(risposta.corpo.messaggio, 'Non puoi modificare questa sessione');
    const salvata = await prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });
    assert.equal(salvata.noteFinali, null);
  });

  it("il superadmin puo'", async () => {
    const sessione = await creaSessione(utente, scheda);
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });

    const risposta = await correggi(sessione, { noteFinali: 'corretta dall\'admin' }, admin);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.noteFinali, 'corretta dall\'admin');
  });

  it('una sessione che non esiste risponde 404 con un messaggio leggibile', async () => {
    const risposta = await correggi({ id: 999 }, { noteFinali: 'x' });
    assert.equal(risposta.stato, 404);
    assert.equal(risposta.corpo.messaggio, 'Sessione non trovata');
  });

  it("un allenamento ancora in corso non si corregge: si chiude con \"Termina\"", async () => {
    const inCorso = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 20 * MINUTO), conclusa: false });

    const risposta = await correggi(inCorso, { noteFinali: 'x' });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Puoi modificare solo un allenamento concluso');
  });
});

describe('correzione di un allenamento: serie e record personali', () => {
  it('800 kg digitati al posto di 80: il record sbagliato sparisce e nasce quello vero', async () => {
    const precedente = await creaSessione(utente, scheda, {
      inizio: giorniFa(10), serie: [{ esercizio: panca, peso: 70, rep: 5 }]
    });
    await creaRecord(utente, panca, 70, precedente.dataInizio);
    const sbagliata = await creaSessione(utente, scheda, {
      inizio: giorniFa(2), serie: [{ esercizio: panca, peso: 800, rep: 5 }]
    });
    await creaRecord(utente, panca, 800, sbagliata.dataInizio);

    const risposta = await correggi(sbagliata, { serie: [{ id: sbagliata.logSerie[0].id, pesoEffettivo: 80 }] });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.volumeTotaleKg, 400);

    // Il nuovo record e' datato all'allenamento in cui e' stato sollevato
    assert.deepEqual(
      risposta.corpo.recordPersonali.map(r => [r.pesoMaxRaggiunto, r.dataRecord]),
      [[80, sbagliata.dataInizio.toISOString()]]
    );
    assert.deepEqual((await recordDi(utente, panca)).map(r => r.pesoMaxRaggiunto), [70, 80]);
  });

  it('un record nato in un altro allenamento non si tocca', async () => {
    await creaSessione(utente, scheda, { inizio: giorniFa(10), serie: [{ esercizio: panca, peso: 100, rep: 3 }] });
    await creaRecord(utente, panca, 100);
    const sessione = await creaSessione(utente, scheda, {
      inizio: giorniFa(2), serie: [{ esercizio: panca, peso: 90, rep: 5 }]
    });

    const risposta = await correggi(sessione, { serie: [{ id: sessione.logSerie[0].id, pesoEffettivo: 95 }] });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.recordPersonali, []);
    assert.deepEqual((await recordDi(utente, panca)).map(r => r.pesoMaxRaggiunto), [100]);
  });

  it('togliere una serie registrata due volte la elimina, rinumera le altre e ricalcola il volume', async () => {
    const sessione = await creaSessione(utente, scheda, {
      serie: [
        { esercizio: panca, peso: 60, rep: 10 },
        { esercizio: panca, peso: 60, rep: 10 }, // doppione
        { esercizio: panca, peso: 65, rep: 8 }
      ]
    });
    const [prima, , terza] = sessione.logSerie;

    const risposta = await correggi(sessione, { serie: [{ id: prima.id }, { id: terza.id }] });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.volumeTotaleKg, 60 * 10 + 65 * 8);

    const rimaste = await prisma.logSerie.findMany({ where: { sessioneId: sessione.id }, orderBy: { id: 'asc' } });
    assert.deepEqual(rimaste.map(s => [s.id, s.serieNumero]), [[prima.id, 1], [terza.id, 2]]);
  });

  it("si aggiungono serie agli esercizi dell'allenamento, non ad altri", async () => {
    const squat = await creaEsercizio({ nome: 'Squat', gruppoMuscoloPrimario: 'Quadricipiti' });
    const sessione = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    const esistente = { id: sessione.logSerie[0].id };

    const estranea = await correggi(sessione, {
      serie: [esistente, { esercizioId: squat.id, pesoEffettivo: 100, repEffettive: 5 }]
    });
    assert.equal(estranea.stato, 400);
    assert.equal(estranea.corpo.messaggio, 'Serie 2: si aggiungono serie solo agli esercizi di questo allenamento');

    const aggiunta = await correggi(sessione, {
      serie: [esistente, { esercizioId: panca.id, pesoEffettivo: 60, repEffettive: 8 }]
    });
    assert.equal(aggiunta.stato, 200);
    assert.deepEqual(
      aggiunta.corpo.dati.esercizi[0].serie.map(s => [s.serieNumero, s.repEffettive]),
      [[1, 10], [2, 8]]
    );
  });

  it("le serie di un altro allenamento non si toccano da qui", async () => {
    const sessione = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    const altra = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 70, rep: 5 }] });

    const risposta = await correggi(sessione, { serie: [{ id: altra.logSerie[0].id, pesoEffettivo: 1 }] });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Serie 1: non appartiene a questo allenamento');
    const intatta = await prisma.logSerie.findUnique({ where: { id: altra.logSerie[0].id } });
    assert.equal(intatta.pesoEffettivo, 70);
  });
});

describe('correzione di un allenamento: orari e calendario', () => {
  it('cambiare la durata ricalcola la fine (il caso di "Termina" premuto la mattina dopo)', async () => {
    const dimenticata = await creaSessione(utente, scheda, { inizio: giorniFa(1), durataMinuti: 600 });

    const risposta = await correggi(dimenticata, { durataMinuti: 75 });
    assert.equal(risposta.stato, 200);
    const salvata = await prisma.sessioneAllenamento.findUnique({ where: { id: dimenticata.id } });
    assert.equal(salvata.durataMinuti, 75);
    assert.equal(salvata.dataFine.getTime(), dimenticata.dataInizio.getTime() + 75 * MINUTO);
  });

  it('rifiuta inizio e durata che farebbero finire l\'allenamento nel futuro', async () => {
    const sessione = await creaSessione(utente, scheda);

    const risposta = await correggi(sessione, {
      dataInizio: new Date(Date.now() - 10 * MINUTO).toISOString(), durataMinuti: 60
    });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, "Con quest'ora d'inizio e questa durata l'allenamento finirebbe nel futuro");
  });

  it('spostato a un altro giorno, chiude in calendario quello nuovo e riapre quello vecchio', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: giorniFa(5) });
    const nuovoInizio = giorniFa(3);
    const vecchio = await prisma.allenamentoPianificato.create({
      data: {
        utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(sessione.dataInizio),
        stato: 'COMPLETATO', sessioneId: sessione.id
      }
    });
    const nuovo = await prisma.allenamentoPianificato.create({
      data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(nuovoInizio) }
    });

    const risposta = await correggi(sessione, { dataInizio: nuovoInizio.toISOString() });
    assert.equal(risposta.stato, 200);

    const [dopoVecchio, dopoNuovo] = await Promise.all([vecchio, nuovo].map(p =>
      prisma.allenamentoPianificato.findUnique({ where: { id: p.id } })));
    assert.deepEqual([dopoVecchio.stato, dopoVecchio.sessioneId], ['PIANIFICATO', null]);
    assert.deepEqual([dopoNuovo.stato, dopoNuovo.sessioneId], ['COMPLETATO', sessione.id]);
  });
});

describe('avvio e chiusura di un allenamento', () => {
  const avvia = (chi, schedaId) =>
    server.richiesta('POST', '/sessioni', { token: tokenPer(chi), corpo: { schedaId } });

  it('si avvia sulle proprie schede e su quelle globali, non sulle schede private degli altri', async () => {
    const altro = await creaUtente();
    const privataAltrui = await creaScheda(altro, [panca]);
    const globale = await creaScheda(altro, [panca], { visibilita: 'GLOBALE' });

    assert.equal((await avvia(utente, scheda.id)).stato, 201);
    assert.equal((await avvia(utente, globale.id)).stato, 201);

    const vietata = await avvia(utente, privataAltrui.id);
    assert.equal(vietata.stato, 403);
    assert.equal(vietata.corpo.messaggio, 'Non hai accesso a questa scheda');
    assert.equal(await prisma.sessioneAllenamento.count({ where: { schedaId: privataAltrui.id } }), 0);
  });

  it("il record di un allenamento chiuso dal superadmin va a chi si e' allenato", async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 45 * MINUTO), conclusa: false, serie: [{ esercizio: panca, peso: 100, rep: 5 }]
    });
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });

    const risposta = await server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, { token: tokenPer(admin), corpo: {} });
    assert.equal(risposta.stato, 200);
    assert.deepEqual((await recordDi(utente, panca)).map(r => r.pesoMaxRaggiunto), [100]);
    assert.deepEqual(await recordDi(admin, panca), []);
  });
});
