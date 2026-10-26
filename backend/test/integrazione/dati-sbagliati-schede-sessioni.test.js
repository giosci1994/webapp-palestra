// Plans, workouts and the workouts' statistics, sent wrong data: a 400 (or 404)
// with the message in the user's language, nothing saved, and the valid
// requests the app sends keep working as before. (dati-sbagliati.test.js
// checks that no route answers 500; here the answers are checked.)
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaSessione, tokenPer, giorniFa } from '../supporto/dati.js';
import { testiDi } from '../../src/i18n/index.js';

let server;
let utente;
let panca;
let squat;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Panca piana' });
  squat = await creaEsercizio({ nome: 'Squat' });
  scheda = await creaScheda(utente, [panca]);
});

const chiedi = (metodo, percorso, corpo, lingua = 'it') =>
  server.richiesta(metodo, percorso, { token: tokenPer(utente), corpo, lingua });

/** The messages of a validation error (zod), by field */
const messaggi = risposta => Object.fromEntries(risposta.corpo.dettagli.map(d => [d.campo, d.messaggio]));

const conta = (tabella) => prisma[tabella].count();

describe('POST /schede', () => {
  it('a list of exercises that is not a list: 400 in the language of the app, nothing saved', async () => {
    const italiano = await chiedi('POST', '/schede', { titolo: 'Nuova', esercizi: 'abc' });
    assert.equal(italiano.stato, 400);
    assert.deepEqual(messaggi(italiano), { esercizi: 'Gli esercizi devono essere un elenco' });
    const inglese = await chiedi('POST', '/schede', { titolo: 'Nuova', esercizi: 'abc' }, 'en');
    assert.equal(inglese.stato, 400);
    assert.deepEqual(messaggi(inglese), { esercizi: 'The exercises must be a list' });
    assert.equal(await conta('schedaAllenamento'), 1);
  });

  it('every wrong value is refused with the field it is in', async () => {
    const prove = [
      [{ titolo: 5 }, 'titolo'],
      [{ titolo: 'x', descrizione: { x: 1 } }, 'descrizione'],
      [{ titolo: 'x', livello: 'abc' }, 'livello'],
      [{ titolo: 'x', visibilita: 'abc' }, 'visibilita'],
      [{ titolo: 'x', esercizi: { x: 1 } }, 'esercizi'],
      [{ titolo: 'x', esercizi: ['a'] }, 'esercizi.0'],
      [{ titolo: 'x', esercizi: [{}] }, 'esercizi.0.esercizioId'],
      [{ titolo: 'x', esercizi: [{ esercizioId: 'abc' }] }, 'esercizi.0.esercizioId'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, serieTarget: 'abc' }] }, 'esercizi.0.serieTarget'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, serieTarget: 99999 }] }, 'esercizi.0.serieTarget'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, recuperoSecondi: -5 }] }, 'esercizi.0.recuperoSecondi'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, repTarget: 12 }] }, 'esercizi.0.repTarget'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, note: ['a'] }] }, 'esercizi.0.note'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, velocitaKmh: { x: 1 } }] }, 'esercizi.0.velocitaKmh'],
      [{ titolo: 'x', esercizi: [{ esercizioId: panca.id, durataMinuti: 2147483648 }] }, 'esercizi.0.durataMinuti']
    ];
    for (const [corpo, campo] of prove) {
      const risposta = await chiedi('POST', '/schede', corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      assert.ok(campo in messaggi(risposta), `${campo} in ${JSON.stringify(messaggi(risposta))}`);
    }
    assert.equal(await conta('schedaAllenamento'), 1);
  });

  it('an exercise that does not exist is a 404 that names it', async () => {
    const risposta = await chiedi('POST', '/schede', { titolo: 'Nuova', esercizi: [{ esercizioId: panca.id }, { esercizioId: 99999 }] });
    assert.equal(risposta.stato, 404);
    assert.equal(risposta.corpo.messaggio, 'Esercizio 99999 non trovato');
    const inglese = await chiedi('POST', '/schede', { titolo: 'Nuova', esercizi: [{ esercizioId: 99999 }] }, 'en');
    assert.equal(inglese.corpo.messaggio, 'Exercise 99999 not found');
    assert.equal(await conta('schedaAllenamento'), 1);
  });

  it('the title is still required, with the same message', async () => {
    for (const corpo of [{}, { titolo: '' }, { titolo: null }]) {
      const risposta = await chiedi('POST', '/schede', corpo);
      assert.equal(risposta.stato, 400);
      assert.equal(risposta.corpo.messaggio, 'Il titolo è obbligatorio');
    }
  });

  it('what the plan editor sends keeps working: strength, cardio, empty and null fields', async () => {
    const risposta = await chiedi('POST', '/schede', {
      titolo: 'Completa', descrizione: '', livello: 'AVANZATO', visibilita: 'PERSONALE',
      esercizi: [
        { esercizioId: panca.id, serieTarget: 4, repTarget: '6-8', recuperoSecondi: 120, note: ' tieni la schiena ' },
        // Cardio and warm-up entry, as the editor builds it
        {
          esercizioId: squat.id, serieTarget: 1, repTarget: null, recuperoSecondi: 0, riscaldamento: true,
          durataMinuti: 10, velocitaKmh: 6.5, inclinazione: 1.5, livelloResistenza: null, distanzaKm: null
        },
        // The editor sends null for a field the user emptied: the defaults apply
        { esercizioId: panca.id, serieTarget: null, repTarget: '8-12', recuperoSecondi: null, note: null }
      ]
    });
    assert.equal(risposta.stato, 201);
    const { dati } = risposta.corpo;
    assert.equal(dati.livello, 'AVANZATO');
    assert.equal(dati.descrizione, '');
    assert.deepEqual(dati.esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.recuperoSecondi, e.note, e.riscaldamento]), [
      [panca.id, 4, '6-8', 120, 'tieni la schiena', false],
      [squat.id, 1, null, 0, null, true],
      [panca.id, 3, '8-12', 90, null, false]
    ]);
    assert.deepEqual([dati.esercizi[1].durataMinuti, dati.esercizi[1].velocitaKmh, dati.esercizi[1].inclinazione], [10, 6.5, 1.5]);
  });

  it('defaults: missing or empty level, visibility and exercises', async () => {
    const minima = await chiedi('POST', '/schede', { titolo: 'Minima' });
    assert.equal(minima.stato, 201);
    assert.deepEqual([minima.corpo.dati.livello, minima.corpo.dati.visibilita, minima.corpo.dati.esercizi], ['BASE', 'PERSONALE', []]);
    const vuota = await chiedi('POST', '/schede', { titolo: 'Vuota', livello: '', visibilita: null, esercizi: null });
    assert.equal(vuota.stato, 201);
    assert.deepEqual([vuota.corpo.dati.livello, vuota.corpo.dati.visibilita], ['BASE', 'PERSONALE']);
    // The ids as numeric strings, which the database alone would have refused
    const testo = await chiedi('POST', '/schede', { titolo: 'Testo', esercizi: [{ esercizioId: String(panca.id), serieTarget: '5' }] });
    assert.equal(testo.stato, 201);
    assert.deepEqual([testo.corpo.dati.esercizi[0].esercizioId, testo.corpo.dati.esercizi[0].serieTarget], [panca.id, 5]);
  });

  it('only admins and trainers can still create global plans', async () => {
    const risposta = await chiedi('POST', '/schede', { titolo: 'Globale', visibilita: 'GLOBALE' });
    assert.equal(risposta.stato, 403);
  });
});

describe('PUT /schede/:id', () => {
  it('a wrong level: 400, the plan and its exercises stay as they were', async () => {
    const prima = await prisma.schedaAllenamento.findUnique({ where: { id: scheda.id }, include: { esercizi: true } });
    for (const corpo of [{ livello: 'abc' }, { livello: null }, { visibilita: 'abc' }, { titolo: null }, { titolo: { x: 1 } },
      { esercizi: [{ esercizioId: 'abc' }] }, { esercizi: 'abc' }]) {
      const risposta = await chiedi('PUT', `/schede/${scheda.id}`, corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
    }
    const dopo = await prisma.schedaAllenamento.findUnique({ where: { id: scheda.id }, include: { esercizi: true } });
    assert.deepEqual(dopo, prima);

    const inglese = await chiedi('PUT', `/schede/${scheda.id}`, { livello: 'abc' }, 'en');
    assert.deepEqual(messaggi(inglese), { livello: 'The level is not valid' });
    assert.deepEqual(messaggi(await chiedi('PUT', `/schede/${scheda.id}`, { livello: 'abc' })), { livello: 'Il livello non è valido' });
  });

  it('an exercise that does not exist: 404 and the old exercises are not deleted', async () => {
    const risposta = await chiedi('PUT', `/schede/${scheda.id}`, { esercizi: [{ esercizioId: 99999 }] });
    assert.equal(risposta.stato, 404);
    assert.equal(await prisma.esercizioScheda.count({ where: { schedaId: scheda.id } }), 1);
  });

  it('what the editor sends keeps working: only the title, then the whole plan', async () => {
    const titolo = await chiedi('PUT', `/schede/${scheda.id}`, { titolo: 'Rinominata' });
    assert.equal(titolo.stato, 200);
    assert.equal(titolo.corpo.dati.titolo, 'Rinominata');
    assert.equal(titolo.corpo.dati.esercizi.length, 1);

    const tutta = await chiedi('PUT', `/schede/${scheda.id}`, {
      titolo: 'Cambiata', descrizione: 'Nuova', livello: 'INTERMEDIO', visibilita: 'PERSONALE',
      esercizi: [{ esercizioId: squat.id, serieTarget: 5, repTarget: '5', recuperoSecondi: 180, note: '' }]
    });
    assert.equal(tutta.stato, 200);
    assert.deepEqual(tutta.corpo.dati.esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.recuperoSecondi]), [[squat.id, 5, '5', 180]]);
    assert.equal(tutta.corpo.dati.livello, 'INTERMEDIO');

    // An empty description clears it, and no list leaves the exercises alone
    const senzaElenco = await chiedi('PUT', `/schede/${scheda.id}`, { descrizione: null, esercizi: null });
    assert.equal(senzaElenco.stato, 200);
    assert.equal(senzaElenco.corpo.dati.descrizione, null);
    assert.equal(senzaElenco.corpo.dati.esercizi.length, 1);
  });
});

describe('exercises inside a plan', () => {
  it('POST /schede/:id/esercizi: a wrong or missing exercise', async () => {
    for (const corpo of [{ esercizioId: 'abc' }, { esercizioId: { x: 1 } }, { esercizioId: -5 }, { esercizioId: 2147483648 }, { esercizioId: ['a'] }]) {
      const risposta = await chiedi('POST', `/schede/${scheda.id}/esercizi`, corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
    }
    const mancante = await chiedi('POST', `/schede/${scheda.id}/esercizi`, {});
    assert.equal(mancante.stato, 400);
    assert.deepEqual(messaggi(mancante), { esercizioId: "L'esercizio è obbligatorio" });
    assert.deepEqual(messaggi(await chiedi('POST', `/schede/${scheda.id}/esercizi`, {}, 'en')), { esercizioId: 'The exercise is required' });

    const inesistente = await chiedi('POST', `/schede/${scheda.id}/esercizi`, { esercizioId: 99999 });
    assert.equal(inesistente.stato, 404);
    assert.equal(inesistente.corpo.messaggio, 'Esercizio 99999 non trovato');
    assert.equal(await prisma.esercizioScheda.count({ where: { schedaId: scheda.id } }), 1);
  });

  it('POST /schede/:id/esercizi: the defaults and the values still apply', async () => {
    const predefiniti = await chiedi('POST', `/schede/${scheda.id}/esercizi`, { esercizioId: squat.id });
    assert.equal(predefiniti.stato, 201);
    assert.deepEqual([predefiniti.corpo.dati.serieTarget, predefiniti.corpo.dati.repTarget, predefiniti.corpo.dati.recuperoSecondi, predefiniti.corpo.dati.ordineEsecuzione], [3, '8-12', 90, 2]);
    const valori = await chiedi('POST', `/schede/${scheda.id}/esercizi`, { esercizioId: squat.id, serieTarget: 5, repTarget: '5', recuperoSecondi: 150 });
    assert.deepEqual([valori.corpo.dati.serieTarget, valori.corpo.dati.repTarget, valori.corpo.dati.recuperoSecondi], [5, '5', 150]);
  });

  it('PUT /schede/:id/esercizi/:id: wrong values are refused, the order cannot be emptied', async () => {
    const voce = await prisma.esercizioScheda.findFirst({ where: { schedaId: scheda.id } });
    for (const corpo of [{ serieTarget: 'abc' }, { ordineEsecuzione: null }, { ordineEsecuzione: 'abc' }, { recuperoSecondi: -5 }, { repTarget: 8 }]) {
      const risposta = await chiedi('PUT', `/schede/${scheda.id}/esercizi/${voce.id}`, corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
    }
    const buona = await chiedi('PUT', `/schede/${scheda.id}/esercizi/${voce.id}`, { serieTarget: 4, repTarget: null, ordineEsecuzione: 2 });
    assert.equal(buona.stato, 200);
    assert.deepEqual([buona.corpo.dati.serieTarget, buona.corpo.dati.repTarget, buona.corpo.dati.ordineEsecuzione], [4, null, 2]);
  });

  it('GET /schede/docx: an id beyond what the database holds is a 400', async () => {
    for (const ids of ['99999999999', '1,2147483648', '0', 'abc']) {
      assert.equal((await chiedi('GET', `/schede/docx?ids=${ids}`)).stato, 400, ids);
    }
  });
});

describe('POST /sessioni', () => {
  it('a wrong plan id: 400 in the language of the app, no workout started', async () => {
    const italiano = await chiedi('POST', '/sessioni', { schedaId: 'abc' });
    assert.equal(italiano.stato, 400);
    assert.deepEqual(messaggi(italiano), { schedaId: 'schedaId non valido' });
    const inglese = await chiedi('POST', '/sessioni', { schedaId: { x: 1 } }, 'en');
    assert.deepEqual(messaggi(inglese), { schedaId: 'schedaId is not valid' });
    for (const corpo of [{ schedaId: -5 }, { schedaId: ['a'] }, { schedaId: 2147483648 }, { schedaId: scheda.id, minutiRiscaldamento: 'abc' },
      { schedaId: scheda.id, minutiRiscaldamento: 99999 }, { libero: 'abc' }]) {
      assert.equal((await chiedi('POST', '/sessioni', corpo)).stato, 400, JSON.stringify(corpo));
    }
    assert.equal(await conta('sessioneAllenamento'), 0);
  });

  it('without a plan and not free: the same "required" message as before; a plan that does not exist is a 404', async () => {
    const mancante = await chiedi('POST', '/sessioni', {});
    assert.equal(mancante.stato, 400);
    assert.equal(mancante.corpo.messaggio, 'schedaId è obbligatorio');
    assert.equal((await chiedi('POST', '/sessioni', { schedaId: null })).corpo.messaggio, 'schedaId è obbligatorio');
    const inesistente = await chiedi('POST', '/sessioni', { schedaId: 99999 });
    assert.equal(inesistente.stato, 404);
  });

  it('what the app sends keeps working: a plan, a free workout, close the open ones', async () => {
    const conScheda = await chiedi('POST', '/sessioni', { schedaId: scheda.id });
    assert.equal(conScheda.stato, 201);
    assert.equal(conScheda.corpo.dati.schedaId, scheda.id);
    assert.equal((await chiedi('POST', '/sessioni', { schedaId: scheda.id })).stato, 409);

    const libera = await chiedi('POST', '/sessioni', { libero: true, chiudiAperte: true });
    assert.equal(libera.stato, 201);
    assert.equal(libera.corpo.dati.schedaId, null);

    const comeTesto = await chiedi('POST', '/sessioni', { schedaId: String(scheda.id), minutiRiscaldamento: 10, chiudiAperte: true });
    assert.equal(comeTesto.stato, 201);
    assert.deepEqual([comeTesto.corpo.dati.schedaId, comeTesto.corpo.dati.minutiRiscaldamento], [scheda.id, 10]);
  });
});

describe('the lists of workouts', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 3; i++) await creaSessione(utente, scheda, { inizio: giorniFa(i), serie: [{ esercizio: panca, peso: 50, rep: 10 }] });
  });

  it('GET /sessioni: a wrong page or limit is a 400', async () => {
    for (const query of ['limite=abc', 'pagina=abc', 'limite=0', 'pagina=0', 'limite=-5', 'limite=99999', 'pagina=99999999999',
      'limite=1.5', 'limite[a]=1', 'limite=1&limite=2']) {
      assert.equal((await chiedi('GET', `/sessioni?${query}`)).stato, 400, query);
    }
    const italiano = await chiedi('GET', '/sessioni?limite=abc');
    assert.deepEqual(messaggi(italiano), { limite: 'Il limite non è valido' });
    const inglese = await chiedi('GET', '/sessioni?pagina=abc', undefined, 'en');
    assert.deepEqual(messaggi(inglese), { pagina: 'The page is not valid' });
  });

  it('GET /sessioni: a missing or empty value keeps its default', async () => {
    assert.equal((await chiedi('GET', '/sessioni')).corpo.dati.length, 3);
    assert.equal((await chiedi('GET', '/sessioni?limite=&pagina=')).corpo.dati.length, 3);
    assert.equal((await chiedi('GET', '/sessioni?limite=2')).corpo.dati.length, 2);
    assert.equal((await chiedi('GET', '/sessioni?limite=2&pagina=2')).corpo.dati.length, 1);
  });

  it('GET /sessioni/storico: a wrong page, limit or plan is a 400', async () => {
    for (const query of ['limite=abc', 'pagina=abc', 'pagina=0', 'schedaId=abc', 'schedaId=-5', 'schedaId=99999999999', 'schedaId[a]=1']) {
      assert.equal((await chiedi('GET', `/sessioni/storico?${query}`)).stato, 400, query);
    }
    const italiano = await chiedi('GET', '/sessioni/storico?schedaId=abc');
    assert.deepEqual(messaggi(italiano), { schedaId: 'schedaId non valido' });
  });

  it('GET /sessioni/storico: what the History page sends keeps working', async () => {
    const pagina = await chiedi('GET', '/sessioni/storico?pagina=1&limite=15');
    assert.equal(pagina.stato, 200);
    assert.deepEqual(pagina.corpo.paginazione, { totale: 3, pagina: 1, limite: 15, pagine: 1 });
    const conFiltro = await chiedi('GET', `/sessioni/storico?pagina=1&limite=2&schedaId=${scheda.id}`);
    assert.equal(conFiltro.corpo.dati.length, 2);
    assert.equal(conFiltro.corpo.paginazione.pagine, 2);
    // A plan that does not exist is an empty list; an empty filter is no filter
    assert.equal((await chiedi('GET', '/sessioni/storico?schedaId=99999')).corpo.dati.length, 0);
    assert.equal((await chiedi('GET', '/sessioni/storico?schedaId=')).corpo.dati.length, 3);
    assert.equal((await chiedi('GET', '/sessioni/storico')).corpo.paginazione.limite, 15);
  });

  it('GET /sessioni/ultimi-carichi: ids beyond what the database holds are ignored', async () => {
    const risposta = await chiedi('GET', `/sessioni/ultimi-carichi?esercizi=${panca.id},99999999999&escludi=99999999999`);
    assert.equal(risposta.stato, 200);
    assert.deepEqual(Object.keys(risposta.corpo.dati), [String(panca.id)]);
  });
});

describe('GET /statistiche/sessioni', () => {
  it('a wrong number of days is a 400 in the language of the app', async () => {
    for (const giorni of ['abc', '-5', '99999999999', '3651', '1.5', '1e3']) {
      assert.equal((await chiedi('GET', `/statistiche/sessioni?giorni=${giorni}`)).stato, 400, giorni);
    }
    assert.equal((await chiedi('GET', '/statistiche/sessioni?giorni=1&giorni=2')).stato, 400);
    const italiano = await chiedi('GET', '/statistiche/sessioni?giorni=abc');
    assert.equal(italiano.corpo.messaggio, 'Il numero di giorni non è valido');
    const inglese = await chiedi('GET', '/statistiche/sessioni?giorni=abc', undefined, 'en');
    assert.equal(inglese.corpo.messaggio, 'The number of days is not valid');
  });

  it('what the page sends keeps working, and 30 days without the parameter', async () => {
    await creaSessione(utente, scheda, { inizio: giorniFa(10), serie: [{ esercizio: panca, peso: 50, rep: 10 }] });
    await creaSessione(utente, scheda, { inizio: giorniFa(100), serie: [{ esercizio: panca, peso: 50, rep: 10 }] });
    const giorni = async query => (await chiedi('GET', `/statistiche/sessioni${query}`)).corpo.dati.length;
    assert.equal(await giorni(''), 1);
    assert.equal(await giorni('?giorni='), 1);
    assert.equal(await giorni('?giorni=60'), 1);
    assert.equal(await giorni('?giorni=730'), 2);
    assert.equal(await giorni('?giorni=3650'), 2);
  });
});

describe('logging sets and past workouts', () => {
  let aperta;
  beforeEach(async () => {
    aperta = (await chiedi('POST', '/sessioni', { schedaId: scheda.id })).corpo.dati;
  });

  const serie = (corpo) => chiedi('POST', `/sessioni/${aperta.id}/serie`, { esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 60, repEffettive: 8, ...corpo });

  it('POST /sessioni/:id/serie: an exercise that does not exist is a 400, not a 404 (the phone would read it as a lost workout)', async () => {
    const risposta = await serie({ esercizioId: 99999 });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, "L'esercizio non esiste");
    assert.equal(await conta('logSerie'), 0);
  });

  it('POST /sessioni/:id/serie: values the database cannot hold are a 400', async () => {
    for (const corpo of [{ esercizioId: 'abc' }, { esercizioId: -5 }, { serieNumero: 'abc' }, { serieNumero: 99999999999 }, { repEffettive: 99999999999 },
      { pesoEffettivo: '1e999' }, { rpe: 99999999999 }, { noteSerie: { x: 1 } }, { motivoSaltoEsercizio: ['a'] }, { durataMinuti: 2147483648 }]) {
      assert.equal((await serie(corpo)).stato, 400, JSON.stringify(corpo));
    }
    assert.equal((await serie({ noteSerie: { x: 1 } })).corpo.messaggio, '"noteSerie" non è valido');
    assert.equal(await conta('logSerie'), 0);
  });

  it('POST /sessioni/:id/serie: what the workout page sends keeps working (empty and not-a-number values included)', async () => {
    const normale = await serie({ rpe: '8', completato: true });
    assert.equal(normale.stato, 201);
    assert.equal(normale.corpo.dati.rpe, 8);
    // A weight that was not a number reaches the server as null: 0, as it always was
    const vuota = await serie({ serieNumero: 2, pesoEffettivo: null, repEffettive: null, rpe: '' });
    assert.equal(vuota.stato, 201);
    assert.deepEqual([vuota.corpo.dati.pesoEffettivo, vuota.corpo.dati.repEffettive, vuota.corpo.dati.rpe], [0, 0, null]);
    const saltata = await serie({ serieNumero: 3, pesoEffettivo: 0, repEffettive: 0, completato: false, motivoSaltoEsercizio: 'Saltata' });
    assert.equal(saltata.stato, 201);
    assert.equal(saltata.corpo.dati.motivoSaltoEsercizio, 'Saltata');
    const cardio = await serie({ serieNumero: 4, pesoEffettivo: 0, repEffettive: 0, durataMinuti: 20, livelloResistenza: 2.5 });
    assert.equal(cardio.stato, 201);
    assert.deepEqual([cardio.corpo.dati.durataMinuti, cardio.corpo.dati.livelloResistenza], [20, 2]);
  });

  it('PATCH /sessioni/:id/completa: notes that are not text are a 400', async () => {
    for (const noteFinali of [{ x: 1 }, 5, ['a'], true]) {
      assert.equal((await chiedi('PATCH', `/sessioni/${aperta.id}/completa`, { noteFinali })).stato, 400);
    }
    assert.equal((await prisma.sessioneAllenamento.findUnique({ where: { id: aperta.id } })).dataFine, null);
    const buona = await chiedi('PATCH', `/sessioni/${aperta.id}/completa`, { noteFinali: '' });
    assert.equal(buona.stato, 200);
  });

  const passata = (corpo) => chiedi('POST', '/sessioni/passata', {
    schedaId: scheda.id, dataInizio: giorniFa(2).toISOString(), durataMinuti: 45, ...corpo
  });

  it('POST /sessioni/passata: wrong values are a 400 that names the set, nothing saved', async () => {
    await chiedi('PATCH', `/sessioni/${aperta.id}/completa`, {});
    const prima = await conta('sessioneAllenamento');
    const riga = (extra) => ({ esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 60, repEffettive: 8, ...extra });
    const prove = [
      { schedaId: 2147483648 }, { schedaId: 'abc' }, { minutiRiscaldamento: 99999999999 }, { noteFinali: { x: 1 } },
      { serie: [null] }, { serie: ['a'] },
      { serie: [riga({ esercizioId: 99999 })] }, { serie: [riga({ esercizioId: -5 })] }, { serie: [riga({ esercizioId: 2147483648 })] },
      { serie: [riga({ serieNumero: 99999999999 })] },
      { serie: [riga({ pesoEffettivo: 'abc' })] }, { serie: [riga({ repEffettive: 'abc' })] }, { serie: [riga({ repEffettive: 99999999999 })] },
      { serie: [riga({ noteSerie: { x: 1 } })] }, { serie: [riga({ rpe: 99999999999 })] }, { serie: [riga({ durataMinuti: 2147483648 })] }
    ];
    for (const corpo of prove) assert.equal((await passata(corpo)).stato, 400, JSON.stringify(corpo));

    const italiano = await passata({ serie: [riga(), riga({ serieNumero: 2, esercizioId: 99999 })] });
    assert.equal(italiano.corpo.messaggio, "Serie 2: l'esercizio non esiste");
    const inglese = await chiedi('POST', '/sessioni/passata', {
      schedaId: scheda.id, dataInizio: giorniFa(2).toISOString(), durataMinuti: 45, serie: [riga({ noteSerie: 5 })]
    }, 'en');
    assert.equal(inglese.corpo.messaggio, 'Set 1: "noteSerie" is not valid');
    assert.equal(await conta('sessioneAllenamento'), prima);
    assert.equal(await conta('logSerie'), 0);
  });

  it('POST /sessioni/passata: what the offline queue sends keeps working', async () => {
    await chiedi('PATCH', `/sessioni/${aperta.id}/completa`, {});
    const risposta = await passata({
      noteFinali: null,
      serie: [
        { esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 60, repEffettive: 8, rpe: '', completato: true },
        // A weight that was not a number: null, 0
        { esercizioId: panca.id, serieNumero: 2, pesoEffettivo: null, repEffettive: 8, rpe: null, noteSerie: '' },
        { esercizioId: squat.id, serieNumero: 1, pesoEffettivo: 0, repEffettive: 0, durataMinuti: 15, livelloResistenza: 3, completato: false, motivoSaltoEsercizio: 'Saltata' }
      ]
    });
    assert.equal(risposta.stato, 201);
    const salvate = await prisma.logSerie.findMany({ where: { sessioneId: risposta.corpo.dati.id }, orderBy: { id: 'asc' } });
    assert.deepEqual(salvate.map(s => [s.esercizioId, s.pesoEffettivo, s.rpe, s.durataMinuti]), [[panca.id, 60, null, null], [panca.id, 0, null, null], [squat.id, 0, null, 15]]);

    const libera = await chiedi('POST', '/sessioni/passata', { dataInizio: giorniFa(3).toISOString(), durataMinuti: 30, serie: [] });
    assert.equal(libera.stato, 201);
  });
});

describe('the messages of the schemas', () => {
  it('every key the schemas use exists in English and Italian', () => {
    const usate = new Set();
    for (const file of ['schede', 'sessioni']) {
      const sorgente = readFileSync(new URL(`../../src/validators/${file}.schema.js`, import.meta.url), 'utf8');
      for (const [, chiave] of sorgente.matchAll(/'((?:schede|sessioni)Schema\.\w+)'/g)) usate.add(chiave);
    }
    assert.ok(usate.size > 20, `only ${usate.size} keys found`);
    for (const lingua of ['en', 'it']) {
      const testi = testiDi(lingua);
      assert.deepEqual([...usate].filter(chiave => !testi[chiave]), [], lingua);
    }
  });
});
