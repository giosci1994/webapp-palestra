// Starting, closing and correcting workouts (PATCH /sessioni/:id), through
// the real routes and a real database.
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

/** The user's records for an exercise, lowest first */
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

    // The new record is dated to the workout in which it was lifted
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
        { esercizio: panca, peso: 60, rep: 10 }, // duplicate
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

  it('a past workout marks done the entry of its day, even a skipped one', async () => {
    const inizio = giorniFa(1);
    const piano = await prisma.allenamentoPianificato.create({
      data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(inizio), stato: 'SALTATO' }
    });
    const risposta = await server.richiesta('POST', '/sessioni/passata', {
      token: tokenPer(utente),
      corpo: {
        schedaId: scheda.id, dataInizio: inizio.toISOString(), durataMinuti: 45,
        serie: [{ esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 80, repEffettive: 8 }]
      }
    });
    assert.equal(risposta.stato, 201);
    const dopo = await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } });
    assert.deepEqual([dopo.stato, dopo.sessioneId], ['COMPLETATO', risposta.corpo.dati.id]);
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

describe('riprendere un allenamento chiuso per sbaglio', () => {
  const riapri = (sessione, chi = utente) =>
    server.richiesta('PATCH', `/sessioni/${sessione.id}/riapri`, { token: tokenPer(chi) });
  const completa = (sessione, chi = utente) =>
    server.richiesta('PATCH', `/sessioni/${sessione.id}/completa`, { token: tokenPer(chi), corpo: {} });
  /** A workout started 40 minutes ago and just closed */
  const appenaChiuso = async (dati = {}) => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 40 * MINUTO), conclusa: false, serie: [{ esercizio: panca, peso: 80, rep: 8 }], ...dati
    });
    assert.equal((await completa(sessione)).stato, 200);
    return sessione;
  };

  it('torna in corso, e la nuova chiusura ricalcola durata e volume con le serie aggiunte', async () => {
    const sessione = await appenaChiuso();

    const risposta = await riapri(sessione);
    assert.equal(risposta.stato, 200);
    const riaperta = await prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });
    assert.deepEqual([riaperta.dataFine, riaperta.durataMinuti, riaperta.volumeTotaleKg], [null, null, null]);

    const serie = await server.richiesta('POST', `/sessioni/${sessione.id}/serie`, {
      token: tokenPer(utente), corpo: { esercizioId: panca.id, serieNumero: 2, pesoEffettivo: 90, repEffettive: 5 }
    });
    assert.equal(serie.stato, 201);
    const chiusa = await completa(sessione);
    assert.equal(chiusa.stato, 200);
    assert.equal(chiusa.corpo.dati.volumeTotaleKg, 80 * 8 + 90 * 5);
    assert.ok(chiusa.corpo.dati.durataMinuti >= 40);
    // The 90 kg record comes with the second closing, the 80 kg one stays a single record
    assert.deepEqual((await recordDi(utente, panca)).map(r => r.pesoMaxRaggiunto), [80, 90]);
  });

  it('il calendario torna da fare e la nuova chiusura lo segna di nuovo', async () => {
    const inizio = new Date(Date.now() - 40 * MINUTO);
    const piano = await prisma.allenamentoPianificato.create({
      data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(inizio) }
    });
    const sessione = await appenaChiuso({ inizio });
    let dopo = await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } });
    assert.deepEqual([dopo.stato, dopo.sessioneId], ['COMPLETATO', sessione.id]);

    await riapri(sessione);
    dopo = await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } });
    assert.deepEqual([dopo.stato, dopo.sessioneId], ['PIANIFICATO', null]);

    await completa(sessione);
    dopo = await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } });
    assert.deepEqual([dopo.stato, dopo.sessioneId], ['COMPLETATO', sessione.id]);
  });

  it('a workout skipped from the reminder and then done anyway is marked done', async () => {
    const inizio = new Date(Date.now() - 40 * MINUTO);
    const piano = await prisma.allenamentoPianificato.create({
      data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(inizio), stato: 'SALTATO' }
    });
    const sessione = await appenaChiuso({ inizio });
    const dopo = await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } });
    assert.deepEqual([dopo.stato, dopo.sessioneId], ['COMPLETATO', sessione.id]);
  });

  it('solo chi si e\' allenato, o il superadmin', async () => {
    const sessione = await appenaChiuso();
    assert.equal((await riapri(sessione, await creaUtente())).stato, 403);
    assert.equal((await riapri(sessione, await creaUtente({ ruolo: 'SUPERADMIN' }))).stato, 200);
  });

  it('non si riapre un allenamento in corso, ne\' uno finito da piu\' di mezz\'ora', async () => {
    const inCorso = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 10 * MINUTO), conclusa: false });
    assert.equal((await riapri(inCorso)).stato, 400);

    const vecchio = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 120 * MINUTO), durataMinuti: 60 });
    const risposta = await riapri(vecchio);
    assert.equal(risposta.stato, 400);
    assert.match(risposta.corpo.messaggio, /entro 30 minuti/);
    assert.notEqual((await prisma.sessioneAllenamento.findUnique({ where: { id: vecchio.id } })).dataFine, null);
  });

  it('id non valido 400, sessione inesistente 404', async () => {
    assert.equal((await riapri({ id: 'abc' })).stato, 400);
    assert.equal((await riapri({ id: 99999 })).stato, 404);
  });
});

describe('salvare un allenamento come scheda', () => {
  const salva = (sessione, corpo = {}, chi = utente) =>
    server.richiesta('POST', `/sessioni/${sessione.id}/scheda`, { token: tokenPer(chi), corpo });
  const schedaCreata = id => prisma.schedaAllenamento.findUnique({
    where: { id }, include: { esercizi: { orderBy: { ordineEsecuzione: 'asc' } } }
  });

  it('crea una scheda personale con gli esercizi davvero fatti', async () => {
    const squat = await creaEsercizio({ nome: 'Squat' });
    const rematore = await creaEsercizio({ nome: 'Rematore' });
    const seguita = await creaScheda(utente, [panca, squat], { titolo: 'Push A', livello: 'INTERMEDIO' });
    await prisma.esercizioScheda.updateMany({ where: { schedaId: seguita.id, esercizioId: panca.id }, data: { recuperoSecondi: 180, note: 'Fermo al petto' } });
    // At the gym: squat skipped, row added, one extra bench set
    const sessione = await creaSessione(utente, seguita, {
      inizio: new Date('2026-10-09T10:00:00Z'),
      serie: [
        { esercizio: panca, peso: 80, rep: 8 }, { esercizio: panca, peso: 80, rep: 8 },
        { esercizio: panca, peso: 80, rep: 7 }, { esercizio: panca, peso: 70, rep: 10 },
        { esercizio: rematore, peso: 60, rep: 12 }, { esercizio: rematore, peso: 60, rep: 12 }
      ]
    });

    const risposta = await salva(sessione);
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.titolo, 'Push A (9 ott)');

    const nuova = await schedaCreata(risposta.corpo.dati.id);
    assert.deepEqual(
      [nuova.creatoreId, nuova.visibilita, nuova.livello, nuova.descrizione],
      [utente.id, 'PERSONALE', 'INTERMEDIO', "Dall'allenamento del 9 ottobre 2026"]
    );
    assert.deepEqual(
      nuova.esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.recuperoSecondi, e.note]),
      [[panca.id, 4, '7-10', 180, 'Fermo al petto'], [rematore.id, 2, '12', 90, null]]
    );
  });

  it('con un titolo scelto, ripulito dagli spazi', async () => {
    const sessione = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    const risposta = await salva(sessione, { titolo: '  Panca leggera  ' });
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.titolo, 'Panca leggera');
  });

  it('solo i propri allenamenti conclusi, con almeno una serie', async () => {
    const fatta = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    assert.equal((await salva(fatta, {}, await creaUtente())).stato, 403);

    const inCorso = await creaSessione(utente, scheda, { conclusa: false, serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    assert.equal((await salva(inCorso)).stato, 400);

    const vuota = await creaSessione(utente, scheda);
    const risposta = await salva(vuota);
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Nessuna serie completata da salvare');

    assert.equal(await prisma.schedaAllenamento.count({ where: { creatoreId: { not: utente.id } } }), 0);
    assert.equal(await prisma.schedaAllenamento.count(), 1); // only the original one
  });

  it('titolo troppo lungo o non testo 400, id non valido 400, sessione inesistente 404', async () => {
    const sessione = await creaSessione(utente, scheda, { serie: [{ esercizio: panca, peso: 60, rep: 10 }] });
    assert.equal((await salva(sessione, { titolo: 'x'.repeat(101) })).stato, 400);
    assert.equal((await salva(sessione, { titolo: 42 })).stato, 400);
    assert.equal((await salva({ id: 'abc' })).stato, 400);
    assert.equal((await salva({ id: 99999 })).stato, 404);
  });
});

describe('ultimi carichi, con lo storico per la progressione', () => {
  const carichi = (query, chi = utente) => server.richiesta('GET', `/sessioni/ultimi-carichi?${query}`, { token: tokenPer(chi) });
  const sedutaDi = (giorni, peso, ...ripetizioni) => creaSessione(utente, scheda, {
    inizio: giorniFa(giorni), serie: ripetizioni.map(rep => ({ esercizio: panca, peso, rep }))
  });

  it('l\'ultima volta in cima, e in storico le ultime quattro sedute dalla piu\' recente', async () => {
    for (const [giorni, peso] of [[10, 50], [8, 52.5], [6, 55], [4, 57.5], [2, 60]]) await sedutaDi(giorni, peso, 10, 9);

    const risposta = await carichi(`esercizi=${panca.id}`);
    assert.equal(risposta.stato, 200);
    const voce = risposta.corpo.dati[panca.id];
    assert.deepEqual(voce.serie.map(s => [s.pesoEffettivo, s.repEffettive]), [[60, 10], [60, 9]]);
    assert.equal(voce.sessioneId, voce.storico[0].sessioneId);
    assert.deepEqual(voce.storico.map(s => s.serie[0].pesoEffettivo), [60, 57.5, 55, 52.5]);
  });

  it('esclude la sessione in corso e quelle degli altri', async () => {
    const vecchia = await sedutaDi(5, 50, 10);
    const inCorso = await sedutaDi(0, 70, 3);
    await creaSessione(await creaUtente(), scheda, { serie: [{ esercizio: panca, peso: 100, rep: 5 }] });

    const voce = (await carichi(`esercizi=${panca.id}&escludi=${inCorso.id}`)).corpo.dati[panca.id];
    assert.deepEqual(voce.storico.map(s => s.sessioneId), [vecchia.id]);
  });
});
