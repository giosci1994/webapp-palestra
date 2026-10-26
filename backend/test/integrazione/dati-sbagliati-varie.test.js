// Wrong data sent to the AI assistant, the exercise suggestions and the body
// measurements: a client error in the user's language (never a 500), nothing
// saved, and the valid requests of the app still work as before.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, giorniFa } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ nome: 'Marta', altezzaCm: 180 });
});

const come = (metodo, percorso, corpo, { chi = utente, lingua = 'it' } = {}) =>
  server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo, lingua });

describe('AI assistant', () => {
  // The assistant allows 5 requests a minute per user (and the ids start again
  // from 1 in every test): one test, a different user for each group
  it('wrong data is a 400, before the key of the assistant is needed', async () => {
    const chiedi = (corpo, { chi = utente, lingua = 'it' } = {}) => come('POST', '/assistente/chiedi', corpo, { chi, lingua });

    // A message that is not text
    const oggetto = await chiedi({ messaggio: { x: 1 } });
    assert.equal(oggetto.stato, 400);
    assert.equal(oggetto.corpo.messaggio, 'Il messaggio deve essere un testo');
    const numero = await chiedi({ messaggio: -5 }, { lingua: 'en' });
    assert.equal(numero.stato, 400);
    assert.equal(numero.corpo.messaggio, 'The message must be text');
    assert.equal((await chiedi({ messaggio: ['a'] })).stato, 400);

    // A conversation that is not a number
    const conversazione = await chiedi({ messaggio: 'Ciao', conversazioneAiId: 'abc' });
    assert.equal(conversazione.stato, 400);
    assert.equal(conversazione.corpo.messaggio, 'La conversazione non è valida');
    const inglese = await chiedi({ messaggio: 'Ciao', conversazioneAiId: { x: 1 } }, { lingua: 'en' });
    assert.equal(inglese.stato, 400);
    assert.equal(inglese.corpo.messaggio, 'The conversation is not valid');

    // An id that is not a positive integer
    const secondo = await creaUtente();
    for (const conversazioneAiId of [-5, 1.5, ['a'], true, 99999999999]) {
      const risposta = await chiedi({ messaggio: 'Ciao', conversazioneAiId }, { chi: secondo });
      assert.equal(risposta.stato, 400, JSON.stringify(conversazioneAiId));
    }

    // An empty or missing message keeps its own message
    const terzo = await creaUtente();
    for (const corpo of [{}, { messaggio: '' }, { messaggio: '   ' }, { messaggio: null }]) {
      const risposta = await chiedi(corpo, { chi: terzo });
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      assert.equal(risposta.corpo.messaggio, 'Il messaggio non può essere vuoto');
    }
    // The database cannot store a NUL character
    assert.equal((await chiedi({ messaggio: 'Ci\u0000ao' }, { chi: terzo })).stato, 400);

    // A valid request gets as far as the key of the assistant, which the tests do not have
    const quarto = await creaUtente();
    for (const conversazioneAiId of [null, undefined]) {
      const valida = await chiedi({ messaggio: 'Ciao', conversazioneAiId }, { chi: quarto });
      assert.equal(valida.stato, 503, JSON.stringify(conversazioneAiId));
      assert.equal(valida.corpo.codice, 'AI_NON_CONFIGURATA');
    }

    assert.equal(await prisma.conversazioneAI.count(), 0);
    assert.equal(await prisma.messaggioAI.count(), 0);
  });
});

describe('suggesting an exercise, with wrong data', () => {
  const suggerisci = (corpo, lingua = 'it') => come('POST', '/suggerimenti-esercizi', corpo, { lingua });

  it('a field that is not text is a 400, in the language of the user', async () => {
    const base = { nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei' };
    for (const valore of [{ x: 1 }, -5, 99999, ['a'], true, 'a\u0000b']) {
      for (const campo of ['nome', 'gruppoMuscoloPrimario', 'gruppoMuscoloSecondario', 'attrezzaturaSuggerita', 'descrizione']) {
        const risposta = await suggerisci({ ...base, [campo]: valore });
        assert.equal(risposta.stato, 400, `${campo} ${JSON.stringify(valore)}`);
        assert.equal(risposta.corpo.messaggio, 'Nome, gruppi muscolari, attrezzatura e descrizione devono essere testi');
      }
    }
    const inglese = await suggerisci({ nome: { x: 1 }, gruppoMuscoloPrimario: 'Glutei' }, 'en');
    assert.equal(inglese.stato, 400);
    assert.equal(inglese.corpo.messaggio, 'Name, muscle groups, equipment and description must be text');
    assert.equal(await prisma.suggerimentoEsercizio.count(), 0);
  });

  it('texts that are too long are a 400', async () => {
    const lungo = await suggerisci({ nome: 'a'.repeat(151), gruppoMuscoloPrimario: 'Glutei' });
    assert.equal(lungo.stato, 400);
    assert.equal(lungo.corpo.messaggio, 'Nome, gruppi muscolari e attrezzatura non possono superare 150 caratteri');

    const descrizione = await suggerisci({ nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei', descrizione: 'a'.repeat(2001) }, 'en');
    assert.equal(descrizione.stato, 400);
    assert.equal(descrizione.corpo.messaggio, "The description can't be longer than 2000 characters");
    assert.equal(await prisma.suggerimentoEsercizio.count(), 0);
  });

  it('what the app sends still works: empty and null optional fields, texts at the limit', async () => {
    const dalForm = await suggerisci({
      nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei', gruppoMuscoloSecondario: '', attrezzaturaSuggerita: '', descrizione: ''
    });
    assert.equal(dalForm.stato, 201);
    assert.equal(dalForm.corpo.dati.gruppoMuscoloSecondario, null);
    assert.equal(dalForm.corpo.dati.descrizione, null);

    const nulli = await suggerisci({
      nome: 'Curl', gruppoMuscoloPrimario: 'Bicipiti', gruppoMuscoloSecondario: null, attrezzaturaSuggerita: null, descrizione: null
    });
    assert.equal(nulli.stato, 201);

    const alLimite = await suggerisci({ nome: 'a'.repeat(150), gruppoMuscoloPrimario: 'Petto', descrizione: 'b'.repeat(2000) });
    assert.equal(alLimite.stato, 201);
    assert.equal(await prisma.suggerimentoEsercizio.count(), 3);
  });

  it('a missing or empty name or group keeps its own message', async () => {
    for (const corpo of [{}, { nome: null, gruppoMuscoloPrimario: 'Glutei' }, { nome: 'Hip thrust', gruppoMuscoloPrimario: '  ' }]) {
      const risposta = await suggerisci(corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      assert.equal(risposta.corpo.messaggio, 'Nome e gruppo muscolare primario sono obbligatori');
    }
  });
});

describe('body measurements, with wrong data', () => {
  const misura = (corpo, opzioni) => come('POST', '/misurazioni', corpo, opzioni);
  const quante = () => prisma.misurazioneCorporea.count();

  it('a date that is not a date is a 400, in the language of the user', async () => {
    for (const data of ['abc', { x: 1 }, -5, 99999, ['a'], '5', '1800-01-01', true]) {
      const risposta = await misura({ data, peso: 80 });
      assert.equal(risposta.stato, 400, JSON.stringify(data));
      assert.equal(risposta.corpo.messaggio, 'La data non è valida');
    }
    const inglese = await misura({ data: 'abc' }, { lingua: 'en' });
    assert.equal(inglese.stato, 400);
    assert.equal(inglese.corpo.messaggio, 'The date is not valid');
    assert.equal(await quante(), 0);
  });

  it('a date in the future is a 400', async () => {
    const domani = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const risposta = await misura({ data: domani, peso: 80 });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'La data non può essere nel futuro');
    assert.equal(await quante(), 0);
  });

  it('a number that is not a number, or out of its limits, is a 400 that names the field', async () => {
    const campi = [
      'peso', 'bmi', 'grassoCorporeoPct', 'muscoloScheletricoPct', 'massaMagraKg', 'grassoSottocutaneoPct',
      'grassoViscerale', 'acquaPct', 'massaMuscolareKg', 'massaOsseaKg', 'proteinePct', 'bmr', 'etaMetabolica'
    ];
    for (const campo of campi) {
      for (const valore of [{ x: 1 }, ['a'], true]) {
        const risposta = await misura({ [campo]: valore });
        assert.equal(risposta.stato, 400, `${campo} ${JSON.stringify(valore)}`);
        assert.match(risposta.corpo.messaggio, /deve essere un numero$/);
      }
      for (const valore of [-5, 99999, '-5', '99999', '9'.repeat(400)]) {
        const risposta = await misura({ [campo]: valore });
        assert.equal(risposta.stato, 400, `${campo} ${JSON.stringify(valore)}`);
        assert.match(risposta.corpo.messaggio, /deve essere compreso tra 0 e \d+$/);
      }
    }
    assert.equal((await misura({ peso: -5 })).corpo.messaggio, 'Peso deve essere compreso tra 0 e 1000');
    assert.equal((await misura({ bmr: { x: 1 } })).corpo.messaggio, 'Metabolismo basale (BMR) deve essere un numero');
    const inglese = await misura({ peso: 99999 }, { lingua: 'en' });
    assert.equal(inglese.corpo.messaggio, 'Weight must be between 0 and 1000');
    assert.equal(await quante(), 0);
  });

  it('notes that are not text, or too long, are a 400', async () => {
    for (const note of [{ x: 1 }, -5, 99999, ['a'], true, 'a\u0000b']) {
      const risposta = await misura({ peso: 80, note });
      assert.equal(risposta.stato, 400, JSON.stringify(note));
      assert.equal(risposta.corpo.messaggio, 'Le note devono essere un testo');
    }
    const lunghe = await misura({ peso: 80, note: 'a'.repeat(2001) }, { lingua: 'en' });
    assert.equal(lunghe.stato, 400);
    assert.equal(lunghe.corpo.messaggio, "The notes can't be longer than 2000 characters");
    assert.equal(await quante(), 0);
  });

  it('what the app sends still works: empty fields as null or "", text numbers, dates as ISO or day', async () => {
    // The form of the body composition page: every field a text, empty ones ''
    const dalForm = await misura({
      peso: '80.5', grassoCorporeoPct: '', massaMuscolareKg: '', muscoloScheletricoPct: '', acquaPct: '', massaMagraKg: '',
      grassoSottocutaneoPct: '', grassoViscerale: '7', massaOsseaKg: '', proteinePct: '', bmr: '1800', etaMetabolica: ''
    });
    assert.equal(dalForm.stato, 201);
    assert.equal(dalForm.corpo.dati.peso, 80.5);
    assert.equal(dalForm.corpo.dati.grassoViscerale, 7);
    assert.equal(dalForm.corpo.dati.bmr, 1800);
    assert.equal(dalForm.corpo.dati.etaMetabolica, null);
    assert.equal(dalForm.corpo.dati.bmi, 24.8);

    const nulli = await misura({ data: null, peso: null, bmi: null, grassoCorporeoPct: null, bmr: null, note: null });
    assert.equal(nulli.stato, 201);
    assert.equal(nulli.corpo.dati.peso, null);
    assert.equal(nulli.corpo.dati.note, null);

    const giorno = await misura({ data: '2026-03-01', peso: 79, note: '' });
    assert.equal(giorno.stato, 201);
    assert.equal(giorno.corpo.dati.data, '2026-03-01T00:00:00.000Z');
    assert.equal(giorno.corpo.dati.note, null);

    const iso = await misura({ data: giorniFa(2).toISOString(), peso: 1000, grassoCorporeoPct: 0, bmr: 20000 });
    assert.equal(iso.stato, 201);
    assert.equal(iso.corpo.dati.peso, 1000);
    assert.equal(iso.corpo.dati.grassoCorporeoPct, 0);

    // Text that is not a number is saved empty, as it always was
    const testo = await misura({ peso: 80, acquaPct: 'tanta' });
    assert.equal(testo.stato, 201);
    assert.equal(testo.corpo.dati.acquaPct, null);

    assert.equal(await quante(), 5);
  });

  it("the same checks when the personal trainer adds a client's measurement", async () => {
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await prisma.iscrizionePT.create({ data: { utenteId: utente.id, trainerId: trainer.id, stato: 'ATTIVA' } });
    const perIlCliente = (corpo, lingua = 'it') => come('POST', `/misurazioni/cliente/${utente.id}`, corpo, { chi: trainer, lingua });

    const data = await perIlCliente({ data: 'abc' });
    assert.equal(data.stato, 400);
    assert.equal(data.corpo.messaggio, 'La data non è valida');
    const numero = await perIlCliente({ peso: { x: 1 } }, 'en');
    assert.equal(numero.stato, 400);
    assert.equal(numero.corpo.messaggio, 'Weight must be a number');
    assert.equal((await perIlCliente({ note: ['a'] })).stato, 400);
    assert.equal(await quante(), 0);

    const buona = await perIlCliente({ peso: '81', grassoCorporeoPct: '', data: null });
    assert.equal(buona.stato, 201);
    assert.equal(buona.corpo.dati.inseritaDaPTId, trainer.id);
    assert.equal(buona.corpo.dati.peso, 81);
  });
});
