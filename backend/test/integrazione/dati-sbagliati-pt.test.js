// The personal trainer area, sent wrong data: a client error (400, 404) with the
// message in the user's language, and nothing saved. Valid requests, as the
// app sends them (ids as texts, empty fields, dates with an offset), still work.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, tokenPer } from '../supporto/dati.js';
import { testiDi } from '../../src/i18n/index.js';

let server;
let trainer;
let cliente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna' });
  cliente = await creaUtente({ nome: 'Paolo' });
  await prisma.iscrizionePT.create({ data: { utenteId: cliente.id, trainerId: trainer.id, stato: 'ATTIVA' } });
});

const comePT = (metodo, percorso, corpo, lingua = 'it') => server.richiesta(metodo, percorso, { token: tokenPer(trainer), corpo, lingua });
const notifiche = () => prisma.allenamentoNotifica.count();
const NUL = 'a\u0000b';
const FUORI_INTERVALLO = '+275760-09-13T00:00:00.000Z';

/** Every body is refused with a 400 whose first detail is about `campo`; returns the responses */
async function rifiutati(metodo, percorso, corpi, campo) {
  const risposte = [];
  for (const corpo of corpi) {
    const risposta = await comePT(metodo, percorso, corpo);
    assert.equal(risposta.stato, 400, `${JSON.stringify(corpo)} → ${risposta.stato} ${risposta.corpo?.messaggio}`);
    assert.equal(risposta.corpo.codice, 'VALIDAZIONE_FALLITA');
    assert.equal(risposta.corpo.dettagli[0].campo, campo, JSON.stringify(corpo));
    risposte.push(risposta);
  }
  return risposte;
}

describe('GET /pt/appuntamenti', () => {
  it('a date or an id that is not one is a 400, in the language of the request', async () => {
    for (const query of ['da=abc', 'a=abc', `da=${encodeURIComponent(FUORI_INTERVALLO)}`, 'da=1800-01-01', 'clienteId=abc', 'clienteId=-5', 'clienteId=0', 'clienteId=99999999999', 'da[x]=1', 'clienteId=1&clienteId=2']) {
      const risposta = await comePT('GET', `/pt/appuntamenti?${query}`);
      assert.equal(risposta.stato, 400, query);
      assert.equal(risposta.corpo.codice, 'VALIDAZIONE_FALLITA', query);
      assert.equal(risposta.corpo.dettagli[0].origine, 'query');
    }

    const italiano = await comePT('GET', '/pt/appuntamenti?da=abc');
    assert.equal(italiano.corpo.messaggio, 'Dati della richiesta non validi');
    assert.deepEqual(italiano.corpo.dettagli.map(d => [d.campo, d.messaggio]), [['da', 'La data di inizio non è valida']]);
    const inglese = await comePT('GET', '/pt/appuntamenti?a=abc', undefined, 'en');
    assert.deepEqual(inglese.corpo.dettagli.map(d => [d.campo, d.messaggio]), [['a', 'The end date is not valid']]);
  });

  it('empty filters, dates and ids still work, as before', async () => {
    await prisma.appuntamentoPT.create({ data: { trainerId: trainer.id, clienteId: cliente.id, titolo: 'Uno', dataOra: new Date('2026-05-10T10:00:00Z') } });
    const titoli = async query => {
      const risposta = await comePT('GET', `/pt/appuntamenti${query}`);
      assert.equal(risposta.stato, 200, query);
      return risposta.corpo.dati.map(a => a.titolo);
    };
    assert.deepEqual(await titoli('?da=&a=&clienteId='), ['Uno']);
    assert.deepEqual(await titoli('?da=2026-05-10&a=2026-05-11'), ['Uno']);
    assert.deepEqual(await titoli('?da=2026-05-10T12:00:00Z'), []);
    assert.deepEqual(await titoli(`?clienteId=${cliente.id}&giorni=abc&pagina=abc`), ['Uno']);
    assert.deepEqual(await titoli('?da=2026-05-10T12:00:00%2B02:00'), ['Uno']);
  });
});

describe('POST /pt/appuntamenti', () => {
  const dataOra = '2026-05-10T10:00:00+02:00';
  const corpo = extra => ({ clienteId: cliente.id, titolo: 'Massimali', dataOra, ...extra });

  it('wrong data is a 400 and nothing is saved nor sent', async () => {
    await rifiutati('POST', '/pt/appuntamenti', [
      { ...corpo(), clienteId: undefined }, corpo({ clienteId: 'abc' }), corpo({ clienteId: { x: 1 } }), corpo({ clienteId: -5 }),
      corpo({ clienteId: 0 }), corpo({ clienteId: 99999999999 }), corpo({ clienteId: ['a'] }), corpo({ clienteId: '' }), corpo({ clienteId: null })
    ], 'clienteId');
    await rifiutati('POST', '/pt/appuntamenti', [
      { ...corpo(), titolo: undefined }, corpo({ titolo: '' }), corpo({ titolo: '   ' }), corpo({ titolo: null }), corpo({ titolo: 5 }),
      corpo({ titolo: { x: 1 } }), corpo({ titolo: ['a'] }), corpo({ titolo: NUL })
    ], 'titolo');
    await rifiutati('POST', '/pt/appuntamenti', [
      { ...corpo(), dataOra: undefined }, corpo({ dataOra: 'abc' }), corpo({ dataOra: '' }), corpo({ dataOra: null }), corpo({ dataOra: 99999 }),
      corpo({ dataOra: -5 }), corpo({ dataOra: { x: 1 } }), corpo({ dataOra: ['a'] }), corpo({ dataOra: FUORI_INTERVALLO }), corpo({ dataOra: '1800-01-01' })
    ], 'dataOra');
    await rifiutati('POST', '/pt/appuntamenti', [
      corpo({ durataMinuti: 'abc' }), corpo({ durataMinuti: '30' }), corpo({ durataMinuti: -5 }), corpo({ durataMinuti: 0 }), corpo({ durataMinuti: 1.5 }),
      corpo({ durataMinuti: 99999 }), corpo({ durataMinuti: { x: 1 } }), corpo({ durataMinuti: ['a'] })
    ], 'durataMinuti');
    await rifiutati('POST', '/pt/appuntamenti', [corpo({ descrizione: { x: 1 } }), corpo({ descrizione: 5 }), corpo({ descrizione: NUL })], 'descrizione');
    await rifiutati('POST', '/pt/appuntamenti', [corpo({ note: ['a'] }), corpo({ note: -5 }), corpo({ note: { x: 1 } })], 'note');

    assert.equal(await prisma.appuntamentoPT.count(), 0);
    assert.equal(await notifiche(), 0);
  });

  it('says what is wrong in the language of the request', async () => {
    const [italiano] = await rifiutati('POST', '/pt/appuntamenti', [corpo({ clienteId: 'abc' })], 'clienteId');
    assert.equal(italiano.corpo.dettagli[0].messaggio, 'Serve un ID cliente valido');
    const inglese = await comePT('POST', '/pt/appuntamenti', corpo({ dataOra: 'abc' }), 'en');
    assert.equal(inglese.stato, 400);
    assert.equal(inglese.corpo.messaggio, 'Invalid request data');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'A valid date and time are required');
  });

  it("someone who is not your client is still a 403, one that does not exist too", async () => {
    const estraneo = await creaUtente();
    for (const clienteId of [estraneo.id, 99999]) {
      const risposta = await comePT('POST', '/pt/appuntamenti', corpo({ clienteId }));
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [403, 'Questo utente non è un tuo cliente']);
    }
    assert.equal(await prisma.appuntamentoPT.count(), 0);
  });

  it('what the app sends works: the id as a text, no length, an empty description, a date with its offset', async () => {
    const risposta = await comePT('POST', '/pt/appuntamenti', {
      clienteId: String(cliente.id), titolo: 'Massimali', descrizione: '', dataOra, durataMinuti: null, note: null
    });
    assert.equal(risposta.stato, 201);
    const a = risposta.corpo.dati;
    assert.deepEqual([a.clienteId, a.dataOra, a.durataMinuti, a.descrizione, a.note], [cliente.id, '2026-05-10T08:00:00.000Z', 60, null, null]);

    const soloGiorno = await comePT('POST', '/pt/appuntamenti', { clienteId: cliente.id, titolo: 'Giorno', dataOra: '2026-06-01', durataMinuti: 90 });
    assert.equal(soloGiorno.stato, 201);
    assert.deepEqual([soloGiorno.corpo.dati.dataOra, soloGiorno.corpo.dati.durataMinuti], ['2026-06-01T00:00:00.000Z', 90]);
    assert.equal(await notifiche(), 2);
  });
});

describe('PATCH /pt/appuntamenti/:id', () => {
  let appuntamento;
  beforeEach(async () => {
    appuntamento = await prisma.appuntamentoPT.create({
      data: { trainerId: trainer.id, clienteId: cliente.id, titolo: 'Massimali', descrizione: 'Panca', note: 'Cintura', dataOra: new Date('2026-05-10T10:00:00Z') }
    });
  });
  const modifica = (corpo, lingua) => comePT('PATCH', `/pt/appuntamenti/${appuntamento.id}`, corpo, lingua);

  it('wrong data is a 400 and the appointment stays as it was', async () => {
    const prima = await prisma.appuntamentoPT.findUnique({ where: { id: appuntamento.id } });
    for (const [campo, valori] of Object.entries({
      titolo: ['', '  ', null, 5, { x: 1 }, ['a'], NUL],
      dataOra: ['abc', '', null, 99999, -5, { x: 1 }, ['a'], FUORI_INTERVALLO],
      durataMinuti: ['abc', '30', null, -5, 0, 99999, { x: 1 }, ['a']],
      completato: ['abc', 'true', 1, null, { x: 1 }, ['a']],
      descrizione: [5, { x: 1 }, ['a']],
      note: [5, { x: 1 }, ['a']]
    })) {
      await rifiutati('PATCH', `/pt/appuntamenti/${appuntamento.id}`, valori.map(valore => ({ [campo]: valore })), campo);
    }
    assert.deepEqual(await prisma.appuntamentoPT.findUnique({ where: { id: appuntamento.id } }), prima);

    const inglese = await modifica({ dataOra: 'abc' }, 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'A valid date and time are required');
    const italiano = await modifica({ completato: 'abc' });
    assert.equal(italiano.corpo.dettagli[0].messaggio, '"Completato" deve essere vero o falso');
  });

  it("a valid change works as before, null clears the description and the notes; someone else's is a 404", async () => {
    const risposta = await modifica({ titolo: 'Nuovo', dataOra: '2026-05-12T09:00:00+02:00', durataMinuti: 45, completato: true, descrizione: null, note: null });
    assert.equal(risposta.stato, 200);
    const a = risposta.corpo.dati;
    assert.deepEqual([a.titolo, a.dataOra, a.durataMinuti, a.completato, a.descrizione, a.note],
      ['Nuovo', '2026-05-12T07:00:00.000Z', 45, true, null, null]);

    const vuoto = await modifica({});
    assert.equal(vuoto.stato, 200);
    assert.equal(vuoto.corpo.dati.titolo, 'Nuovo');

    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const altrui = await server.richiesta('PATCH', `/pt/appuntamenti/${appuntamento.id}`, { token: tokenPer(altroTrainer), corpo: { titolo: 'X' } });
    assert.deepEqual([altrui.stato, altrui.corpo.messaggio], [404, 'Appuntamento non trovato']);
    assert.equal((await modifica({ titolo: 'Ok' })).stato, 200);
    assert.equal((await comePT('PATCH', '/pt/appuntamenti/99999', { titolo: 'X' })).stato, 404);
  });
});

describe('POST /pt/schede', () => {
  let panca;
  beforeEach(async () => { panca = await creaEsercizio(); });
  const esercizio = extra => ({ esercizioId: panca.id, ...extra });
  const corpo = extra => ({ titolo: 'Forza', esercizi: [esercizio()], ...extra });

  it('wrong data is a 400 and no plan is created', async () => {
    await rifiutati('POST', '/pt/schede', [
      corpo({ esercizi: 'abc' }), corpo({ esercizi: { x: 1 } }), corpo({ esercizi: -5 }), corpo({ esercizi: 99999 }),
      corpo({ esercizi: Array.from({ length: 101 }, () => esercizio()) })
    ], 'esercizi');
    // An element that is not an exercise: the first detail points at it
    for (const esercizi of [['a'], [null], [5], [{}], [esercizio(), 'a']]) {
      const risposta = await comePT('POST', '/pt/schede', corpo({ esercizi }));
      assert.equal(risposta.stato, 400, JSON.stringify(esercizi));
      assert.match(risposta.corpo.dettagli[0].campo, /^esercizi\.\d+/);
    }
    await rifiutati('POST', '/pt/schede', [
      corpo({ esercizi: [esercizio({ esercizioId: 'abc' })] }), corpo({ esercizi: [esercizio({ esercizioId: { x: 1 } })] }),
      corpo({ esercizi: [esercizio({ esercizioId: -5 })] }), corpo({ esercizi: [esercizio({ esercizioId: 99999999999 })] }),
      corpo({ esercizi: [esercizio({ esercizioId: ['a'] })] }), corpo({ esercizi: [esercizio({ esercizioId: null })] })
    ], 'esercizi.0.esercizioId');
    await rifiutati('POST', '/pt/schede', [
      corpo({ esercizi: [esercizio({ serieTarget: 'abc' })] }), corpo({ esercizi: [esercizio({ serieTarget: -5 })] }), corpo({ esercizi: [esercizio({ serieTarget: 99999 })] }),
      corpo({ esercizi: [esercizio({ serieTarget: { x: 1 } })] }), corpo({ esercizi: [esercizio({ serieTarget: ['a'] })] }), corpo({ esercizi: [esercizio({ serieTarget: 2.5 })] })
    ], 'esercizi.0.serieTarget');
    await rifiutati('POST', '/pt/schede', [
      corpo({ esercizi: [esercizio({ repTarget: 5 })] }), corpo({ esercizi: [esercizio({ repTarget: { x: 1 } })] }), corpo({ esercizi: [esercizio({ repTarget: ['a'] })] })
    ], 'esercizi.0.repTarget');
    await rifiutati('POST', '/pt/schede', [
      corpo({ esercizi: [esercizio({ recuperoSecondi: 'abc' })] }), corpo({ esercizi: [esercizio({ recuperoSecondi: -5 })] }), corpo({ esercizi: [esercizio({ recuperoSecondi: 99999 })] }),
      corpo({ esercizi: [esercizio({ recuperoSecondi: { x: 1 } })] }), corpo({ esercizi: [esercizio({ recuperoSecondi: ['a'] })] })
    ], 'esercizi.0.recuperoSecondi');
    await rifiutati('POST', '/pt/schede', [corpo({ titolo: 5 }), corpo({ titolo: { x: 1 } }), corpo({ titolo: ['a'] }), corpo({ titolo: NUL })], 'titolo');
    await rifiutati('POST', '/pt/schede', [corpo({ descrizione: 5 }), corpo({ descrizione: { x: 1 } }), corpo({ descrizione: ['a'] })], 'descrizione');
    await rifiutati('POST', '/pt/schede', [corpo({ livello: 'abc' }), corpo({ livello: 5 }), corpo({ livello: { x: 1 } }), corpo({ livello: ['a'] }), corpo({ livello: 'base' })], 'livello');
    assert.equal(await prisma.schedaAllenamento.count(), 0);
  });

  it('an exercise that does not exist is a 404, in the language of the request', async () => {
    const italiano = await comePT('POST', '/pt/schede', corpo({ esercizi: [esercizio(), esercizio({ esercizioId: 99999 })] }));
    assert.deepEqual([italiano.stato, italiano.corpo.messaggio], [404, 'Esercizio non trovato']);
    const inglese = await comePT('POST', '/pt/schede', corpo({ esercizi: [esercizio({ esercizioId: '99999' })] }), 'en');
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [404, 'Exercise not found']);
    assert.equal(await prisma.schedaAllenamento.count(), 0);
  });

  it('says what is wrong in the language of the request', async () => {
    const italiano = await comePT('POST', '/pt/schede', corpo({ livello: 'abc' }));
    assert.equal(italiano.corpo.dettagli[0].messaggio, 'Il livello deve essere BASE, INTERMEDIO o AVANZATO');
    const inglese = await comePT('POST', '/pt/schede', corpo({ esercizi: 'abc' }), 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'The exercises must be a list');
  });

  it('a missing title or exercises keep their own message; what the app sends works', async () => {
    for (const parziale of [{ esercizi: [esercizio()] }, { titolo: 'Vuota', esercizi: [] }, { titolo: 'Vuota' }, { titolo: 'Vuota', esercizi: null }, { titolo: '', esercizi: [esercizio()] }, { titolo: null, esercizi: [esercizio()] }]) {
      const risposta = await comePT('POST', '/pt/schede', parziale);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Titolo e almeno un esercizio sono obbligatori'], JSON.stringify(parziale));
    }

    const altro = await creaEsercizio();
    const risposta = await comePT('POST', '/pt/schede', {
      titolo: 'Forza', descrizione: '', livello: 'AVANZATO',
      // The app also sends the name it shows, and the numbers as it reads them
      esercizi: [
        { esercizioId: panca.id, nome: 'Panca', serieTarget: 4, repTarget: '6-8', recuperoSecondi: 120 },
        { esercizioId: String(altro.id), serieTarget: '5', repTarget: '', recuperoSecondi: null },
        { esercizioId: panca.id }
      ]
    });
    assert.equal(risposta.stato, 201);
    const s = risposta.corpo.dati;
    assert.deepEqual([s.livello, s.descrizione], ['AVANZATO', null]);
    const esercizi = [...s.esercizi].sort((x, y) => x.ordineEsecuzione - y.ordineEsecuzione).map(e => [e.esercizioId, e.serieTarget, e.repTarget, e.recuperoSecondi]);
    assert.deepEqual(esercizi, [[panca.id, 4, '6-8', 120], [altro.id, 5, '8-12', 90], [panca.id, 3, '8-12', 90]]);

    const senzaLivello = await comePT('POST', '/pt/schede', { titolo: 'Base', livello: '', esercizi: [esercizio()] });
    assert.deepEqual([senzaLivello.stato, senzaLivello.corpo.dati.livello], [201, 'BASE']);
  });
});

describe('POST /pt/clienti/:id/assegna-scheda', () => {
  it('a plan id that is not one is a 400, nothing is created', async () => {
    await creaScheda(trainer);
    const percorso = `/pt/clienti/${cliente.id}/assegna-scheda`;
    await rifiutati('POST', percorso, [{}, { schedaId: 'abc' }, { schedaId: { x: 1 } }, { schedaId: -5 }, { schedaId: 0 }, { schedaId: 99999999999 }, { schedaId: ['a'] }, { schedaId: null }], 'schedaId');
    assert.equal(await prisma.schedaAllenamento.count(), 1);

    const italiano = await comePT('POST', percorso, { schedaId: 'abc' });
    assert.equal(italiano.corpo.dettagli[0].messaggio, 'Serve un ID scheda valido');
    const inglese = await comePT('POST', percorso, { schedaId: 'abc' }, 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'A valid plan ID is required');
  });

  it('the id as a text works, as the app sends it', async () => {
    const originale = await creaScheda(trainer);
    const risposta = await comePT('POST', `/pt/clienti/${cliente.id}/assegna-scheda`, { schedaId: String(originale.id) });
    assert.equal(risposta.stato, 201);
  });
});

describe('PATCH /pt/richieste/:id/accetta', () => {
  let richiesta;
  beforeEach(async () => {
    const nuovo = await creaUtente();
    richiesta = await prisma.iscrizionePT.create({ data: { utenteId: nuovo.id, trainerId: trainer.id, stato: 'IN_ATTESA' } });
  });

  it('notes that are not a text are a 400 and the request stays pending; without a body it works', async () => {
    await rifiutati('PATCH', `/pt/richieste/${richiesta.id}/accetta`, [{ notePT: { x: 1 } }, { notePT: ['a'] }, { notePT: -5 }, { notePT: NUL }], 'notePT');
    assert.equal((await prisma.iscrizionePT.findUnique({ where: { id: richiesta.id } })).stato, 'IN_ATTESA');

    const accettata = await comePT('PATCH', `/pt/richieste/${richiesta.id}/accetta`);
    assert.equal(accettata.stato, 200);
    assert.equal(accettata.corpo.dati.stato, 'ATTIVA');
    assert.equal(accettata.corpo.dati.notePT, null);
  });

  it('notes as text are saved', async () => {
    const accettata = await comePT('PATCH', `/pt/richieste/${richiesta.id}/accetta`, { notePT: 'Ginocchio' });
    assert.equal(accettata.corpo.dati.notePT, 'Ginocchio');
  });
});

describe('POST /pt/annunci', () => {
  const corpo = extra => ({ titolo: 'Chiuso lunedì', contenuto: 'Siamo chiusi', ...extra });

  it('wrong data is a 400 and nothing is saved nor sent', async () => {
    await rifiutati('POST', '/pt/annunci', [corpo({ titolo: 5 }), corpo({ titolo: { x: 1 } }), corpo({ titolo: ['a'] }), corpo({ titolo: NUL })], 'titolo');
    await rifiutati('POST', '/pt/annunci', [corpo({ contenuto: 5 }), corpo({ contenuto: { x: 1 } }), corpo({ contenuto: ['a'] }), corpo({ contenuto: NUL })], 'contenuto');
    await rifiutati('POST', '/pt/annunci', [corpo({ priorita: 'abc' }), corpo({ priorita: 5 }), corpo({ priorita: { x: 1 } }), corpo({ priorita: ['a'] })], 'priorita');
    await rifiutati('POST', '/pt/annunci', [
      corpo({ destinatarioId: 'abc' }), corpo({ destinatarioId: { x: 1 } }), corpo({ destinatarioId: -5 }), corpo({ destinatarioId: 0 }),
      corpo({ destinatarioId: 99999999999 }), corpo({ destinatarioId: ['a'] }), corpo({ destinatarioId: true })
    ], 'destinatarioId');
    assert.equal(await prisma.annuncioPT.count(), 0);
    assert.equal(await notifiche(), 0);

    const italiano = await comePT('POST', '/pt/annunci', corpo({ priorita: 'abc' }));
    assert.equal(italiano.corpo.dettagli[0].messaggio, 'La priorità deve essere normale, importante o urgente');
    const inglese = await comePT('POST', '/pt/annunci', corpo({ destinatarioId: 'abc' }), 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'The recipient ID is not valid');
  });

  it('a missing title or content keeps its own message', async () => {
    for (const parziale of [{ titolo: 'Solo titolo' }, { contenuto: 'Solo testo' }, { titolo: '', contenuto: 'x' }, { titolo: 'x', contenuto: null }]) {
      const risposta = await comePT('POST', '/pt/annunci', parziale);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Titolo e contenuto sono obbligatori'], JSON.stringify(parziale));
    }
  });

  it('for everyone (no recipient, or an empty one) or for one client, as the app sends it', async () => {
    const secondo = await creaUtente();
    await prisma.iscrizionePT.create({ data: { utenteId: secondo.id, trainerId: trainer.id, stato: 'ATTIVA' } });

    for (const senza of [{}, { destinatarioId: '' }, { destinatarioId: null }, { priorita: '' }]) {
      const risposta = await comePT('POST', '/pt/annunci', corpo(senza));
      assert.equal(risposta.stato, 201, JSON.stringify(senza));
      assert.deepEqual([risposta.corpo.dati.destinatarioId, risposta.corpo.dati.priorita], [null, 'normale']);
    }
    assert.equal(await notifiche(), 8);

    const uno = await comePT('POST', '/pt/annunci', corpo({ destinatarioId: String(cliente.id), priorita: 'urgente' }));
    assert.equal(uno.stato, 201);
    assert.deepEqual([uno.corpo.dati.destinatarioId, uno.corpo.dati.priorita], [cliente.id, 'urgente']);
    assert.equal(await notifiche(), 9);
  });
});

describe('the texts of the validation', () => {
  it('every key of the schema exists in both languages', () => {
    const sorgente = readFileSync(new URL('../../src/validators/pt.schema.js', import.meta.url), 'utf8');
    const chiavi = [...new Set([...sorgente.matchAll(/'(ptSchema\.\w+)'/g)].map(m => m[1]))];
    assert.ok(chiavi.length >= 20, `only ${chiavi.length} keys found`);
    for (const lingua of ['en', 'it']) {
      const testi = testiDi(lingua);
      assert.deepEqual(chiavi.filter(k => !testi[k]), [], lingua);
      const inutili = Object.keys(testi).filter(k => k.startsWith('ptSchema.') && !chiavi.includes(k));
      assert.deepEqual(inutili, [], `${lingua}: keys nobody uses`);
    }
  });
});
