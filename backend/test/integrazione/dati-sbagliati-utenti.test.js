// The user routes sent wrong data: a client error with a message in the user's
// language, nothing saved, and the same answer as ever to a valid request.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';
import { esisteChiave } from '../../src/i18n/index.js';

const PASSWORD = 'password-sicura-123';

let server;
let utente;
let admin;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ password: PASSWORD });
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
});

const chiedi = (metodo, percorso, corpo, { chi = utente, lingua } = {}) =>
  server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo, lingua });
const comeAdmin = (metodo, percorso, corpo, lingua) => chiedi(metodo, percorso, corpo, { chi: admin, lingua });
const daDb = () => prisma.utente.findUnique({ where: { id: utente.id } });

/** What the response says about the fields: [{ campo, messaggio }] */
const dettagli = risposta => (risposta.corpo.dettagli || []).map(({ campo, messaggio }) => ({ campo, messaggio }));

describe('changing the password', () => {
  it('a password that is not text is refused before it reaches the hashing', async () => {
    const prima = (await daDb()).passwordHash;
    for (const sbagliata of [{ x: 1 }, 99999, -5, ['a'], true]) {
      for (const corpo of [
        { vecchiaPassword: sbagliata, nuovaPassword: 'NuovaPassword1' },
        { vecchiaPassword: PASSWORD, nuovaPassword: sbagliata }
      ]) {
        const risposta = await chiedi('POST', '/utenti/cambia-password', corpo);
        assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      }
    }
    assert.equal((await daDb()).passwordHash, prima);
  });

  it('says so in the language of the request', async () => {
    const corpo = { vecchiaPassword: { x: 1 }, nuovaPassword: 'NuovaPassword1' };

    const italiano = await chiedi('POST', '/utenti/cambia-password', corpo);
    assert.equal(italiano.corpo.messaggio, 'Dati della richiesta non validi');
    assert.deepEqual(dettagli(italiano), [{ campo: 'vecchiaPassword', messaggio: 'Le password devono essere un testo' }]);

    const inglese = await chiedi('POST', '/utenti/cambia-password', corpo, { lingua: 'en' });
    assert.equal(inglese.corpo.messaggio, 'Invalid request data');
    assert.deepEqual(dettagli(inglese), [{ campo: 'vecchiaPassword', messaggio: 'The passwords must be text' }]);
  });

  it('a body that is a list is refused too', async () => {
    const risposta = await chiedi('POST', '/utenti/cambia-password', ['a'], { lingua: 'en' });
    assert.equal(risposta.stato, 400);
    assert.equal(dettagli(risposta)[0].messaggio, 'The request body must be a JSON object');
  });

  it('missing, empty or short passwords keep their own messages', async () => {
    for (const corpo of [{}, { vecchiaPassword: PASSWORD }, { vecchiaPassword: '', nuovaPassword: 'NuovaPassword1' }, { vecchiaPassword: null, nuovaPassword: 'NuovaPassword1' }]) {
      const risposta = await chiedi('POST', '/utenti/cambia-password', corpo);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [400, 'Vecchia password e nuova password sono obbligatorie'], JSON.stringify(corpo));
    }
    const corta = await chiedi('POST', '/utenti/cambia-password', { vecchiaPassword: PASSWORD, nuovaPassword: 'abc' });
    assert.deepEqual([corta.stato, corta.corpo.messaggio], [400, 'La nuova password deve avere almeno 8 caratteri']);
    const errata = await chiedi('POST', '/utenti/cambia-password', { vecchiaPassword: 'sbagliata-123', nuovaPassword: 'NuovaPassword1' });
    assert.deepEqual([errata.stato, errata.corpo.messaggio], [400, 'La password attuale non è corretta']);
  });

  it('a valid change still works', async () => {
    const risposta = await chiedi('POST', '/utenti/cambia-password', { vecchiaPassword: PASSWORD, nuovaPassword: 'NuovaPassword1' });
    assert.equal(risposta.stato, 200);
    const accesso = await server.richiesta('POST', '/auth/login', { corpo: { email: utente.email, password: 'NuovaPassword1' } });
    assert.equal(accesso.stato, 200);
  });
});

describe('the onboarding wizard', () => {
  it('a date of birth that is not a date is refused, and nothing is saved', async () => {
    for (const dataNascita of ['abc', '1995-13-45', '12/04/1995', '1850-01-01', '2999-01-01', 99999, { x: 1 }, ['a']]) {
      const risposta = await chiedi('PATCH', '/utenti/completa-profilo', { dataNascita, genere: 'F' });
      assert.equal(risposta.stato, 400, JSON.stringify(dataNascita));
    }
    const salvato = await daDb();
    assert.equal(salvato.profiloCompletato, false);
    assert.equal(salvato.dataNascita, null);
    assert.equal(salvato.genere, null);
  });

  it('says so in the language of the request', async () => {
    const italiano = await chiedi('PATCH', '/utenti/completa-profilo', { dataNascita: 'abc' });
    assert.deepEqual(dettagli(italiano), [{
      campo: 'dataNascita', messaggio: 'La data di nascita deve essere una data nel formato AAAA-MM-GG, dal 1900 a oggi'
    }]);
    const inglese = await chiedi('PATCH', '/utenti/completa-profilo', { pesoKg: 'abc', altezzaCm: -5 }, { lingua: 'en' });
    assert.deepEqual(dettagli(inglese), [
      { campo: 'pesoKg', messaggio: 'The weight must be a number of kilograms from 0 to 1000' },
      { campo: 'altezzaCm', messaggio: 'The height must be a number of centimetres from 0 to 300' }
    ]);
  });

  it('every field refuses what is not its kind of value', async () => {
    const sbagliati = {
      tipoAccount: ['abc', { x: 1 }, -5, ['a']],
      immagineProfilo: [{ x: 1 }, -5, ['a']],
      genere: [{ x: 1 }, -5, ['a']],
      pesoKg: ['abc', { x: 1 }, -5, 99999, ['a']],
      altezzaCm: ['abc', { x: 1 }, -5, 99999, ['a']],
      obiettivoFitness: [{ x: 1 }, -5, ['a']],
      preferenzeVisibilita: ['abc', { x: 1 }, -5, ['a']],
      gamificationAttiva: ['abc', { x: 1 }, -5, ['a'], null],
      accettaToS: ['abc', { x: 1 }, -5, ['a']],
      accettaPrivacy: ['abc', { x: 1 }, -5, ['a']],
      bio: [{ x: 1 }, -5, ['a'], 'a'.repeat(301)],
      specializzazioni: [{ x: 1 }, -5, [1], [{ x: 1 }]],
      anniEsperienza: ['abc', { x: 1 }, -5, 99999, ['a']],
      certificazioni: [{ x: 1 }, -5, ['a']],
      contattoPubblico: [{ x: 1 }, -5, ['a']],
      tariffaIndicativa: [{ x: 1 }, -5, ['a']]
    };
    for (const [campo, valori] of Object.entries(sbagliati)) {
      for (const valore of valori) {
        const risposta = await chiedi('PATCH', '/utenti/completa-profilo', { [campo]: valore });
        assert.equal(risposta.stato, 400, `${campo}: ${JSON.stringify(valore)}`);
        assert.equal(dettagli(risposta)[0].campo, campo);
      }
    }
    const salvato = await daDb();
    assert.equal(salvato.profiloCompletato, false);
    assert.equal(salvato.ruoloRichiesto, null);
  });

  it('what the app sends still works: empty fields, input texts, an ISO date', async () => {
    // The wizard sends "" for what the user left blank
    const vuoto = await chiedi('PATCH', '/utenti/completa-profilo', {
      tipoAccount: 'UTENTE', immagineProfilo: null, dataNascita: '', genere: '', pesoKg: '', altezzaCm: '',
      obiettivoFitness: '', bio: '', specializzazioni: [], anniEsperienza: '', certificazioni: '',
      contattoPubblico: '', tariffaIndicativa: '',
      preferenzeVisibilita: { palestra: true, peso: false }, gamificationAttiva: true, accettaToS: true, accettaPrivacy: true
    });
    assert.equal(vuoto.stato, 200);
    assert.equal(vuoto.corpo.dati.profiloCompletato, true);

    const pieno = await chiedi('PATCH', '/utenti/completa-profilo', {
      dataNascita: '1995-04-12T00:00:00.000Z', genere: 'M', pesoKg: 80, altezzaCm: '180.4', anniEsperienza: 7,
      specializzazioni: ['Forza', 'Mobilità']
    });
    assert.equal(pieno.stato, 200);
    assert.equal(pieno.corpo.dati.dataNascita, '1995-04-12T00:00:00.000Z');
    assert.deepEqual([pieno.corpo.dati.pesoKg, pieno.corpo.dati.altezzaCm], [80, 180]);
  });
});

describe('the profile', () => {
  it('wrong values are refused, and nothing is saved', async () => {
    const sbagliati = {
      nome: [{ x: 1 }, -5, ['a'], '', '   ', null, 'a'.repeat(101)],
      immagineProfilo: [{ x: 1 }, -5, ['a']],
      dataNascita: ['abc', '', { x: 1 }, -5, 99999, ['a']],
      pesoKg: ['abc', '', { x: 1 }, -5, 99999, ['a']],
      altezzaCm: ['abc', '', { x: 1 }, -5, 99999, ['a']],
      genere: [{ x: 1 }, -5, ['a']],
      bio: [{ x: 1 }, -5, ['a']],
      obiettivoFitness: [{ x: 1 }, -5, ['a']],
      preferenzeVisibilita: ['abc', '[]', 'null', { x: 1 }, -5, ['a']],
      gamificationAttiva: ['abc', { x: 1 }, -5, ['a'], null],
      palestraId: ['abc', { x: 1 }, -5, ['a'], 1.5]
    };
    for (const [campo, valori] of Object.entries(sbagliati)) {
      for (const valore of valori) {
        const risposta = await chiedi('PATCH', '/utenti/profilo', { [campo]: valore });
        assert.equal(risposta.stato, 400, `${campo}: ${JSON.stringify(valore)}`);
        assert.equal(dettagli(risposta)[0].campo, campo);
      }
    }
    const salvato = await daDb();
    assert.deepEqual([salvato.nome, salvato.dataNascita, salvato.pesoKg, salvato.palestraId], [utente.nome, null, null, null]);
  });

  it('a gym that does not exist is not found', async () => {
    const risposta = await chiedi('PATCH', '/utenti/profilo', { palestraId: 99999 });
    assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [404, 'Palestra non trovata']);
    const inglese = await chiedi('PATCH', '/utenti/profilo', { palestraId: '99999' }, { lingua: 'en' });
    assert.deepEqual([inglese.stato, inglese.corpo.messaggio], [404, 'Gym not found']);
    assert.equal((await daDb()).palestraId, null);
  });

  it('what the Profile page sends still works', async () => {
    const palestra = await prisma.palestra.create({ data: { nomeCatena: 'P', citta: 'C', indirizzo: 'I' } });
    const salva = dati => chiedi('PATCH', '/utenti/profilo', dati);

    const completo = await salva({
      nome: 'Giulia', bio: 'Ciao', dataNascita: '1995-04-12', pesoKg: '61.5', altezzaCm: '168', genere: 'F',
      obiettivoFitness: 'massa', palestraId: String(palestra.id),
      preferenzeVisibilita: JSON.stringify({ palestra: true, peso: false })
    });
    assert.equal(completo.stato, 200);
    assert.equal(completo.corpo.dati.dataNascita, '1995-04-12T00:00:00.000Z');
    assert.deepEqual([completo.corpo.dati.pesoKg, completo.corpo.dati.altezzaCm, completo.corpo.dati.palestra.id], [61.5, 168, palestra.id]);

    // Emptied fields: null, and "" for the texts and the gym
    const svuotato = await salva({ dataNascita: null, pesoKg: null, altezzaCm: null, genere: '', bio: '', obiettivoFitness: '', palestraId: '' });
    assert.equal(svuotato.stato, 200);
    const salvato = await daDb();
    assert.deepEqual([salvato.dataNascita, salvato.pesoKg, salvato.altezzaCm, salvato.palestraId, salvato.genere], [null, null, null, null, '']);

    // The numbers the page gets back from the server
    assert.equal((await salva({ pesoKg: 61.5, altezzaCm: 168, palestraId: palestra.id, gamificationAttiva: false })).stato, 200);
    // The fields the service checks keep their own answers
    assert.equal((await salva({ lingua: 'fr' })).stato, 400);
    assert.equal((await salva({ chatRetentionGiorni: 9999 })).stato, 400);
    assert.equal((await salva({ bio: 'a'.repeat(201) })).corpo.messaggio, 'La bio non può superare i 200 caratteri');
  });
});

describe('the admin\'s list of users', () => {
  it('a filter or a page that does not exist is refused', async () => {
    for (const query of [
      '?stato=abc', '?ruolo=abc', '?stato=ATTIVO&stato=BANNATO', '?stato[x]=1', '?pagina=abc', '?pagina=0', '?pagina=-5',
      '?pagina=1.5', '?pagina=99999999999', '?limite=abc', '?limite=0', '?limite=-5', '?limite=1001', '?limite=', '?limite[]=5'
    ]) {
      const risposta = await comeAdmin('GET', `/utenti${query}`);
      assert.equal(risposta.stato, 400, query);
    }
  });

  it('says so in the language of the request', async () => {
    const italiano = await comeAdmin('GET', '/utenti?stato=abc');
    assert.deepEqual(dettagli(italiano), [{ campo: 'stato', messaggio: 'Lo stato deve essere IN_ATTESA, ATTIVO o BANNATO' }]);
    const inglese = await comeAdmin('GET', '/utenti?limite=abc&ruolo=abc', undefined, 'en');
    assert.deepEqual(dettagli(inglese), [
      { campo: 'limite', messaggio: 'The page size must be a whole number from 1 to 1000' },
      { campo: 'ruolo', messaggio: 'The role must be one of UTENTE, PERSONAL_TRAINER or SUPERADMIN' }
    ]);
  });

  it('a user who is not the admin still gets 403, not a validation error', async () => {
    assert.equal((await chiedi('GET', '/utenti?stato=abc')).stato, 403);
  });

  it('valid and empty filters, pages and the defaults still work', async () => {
    const attesa = await creaUtente({ stato: 'IN_ATTESA' });
    assert.deepEqual((await comeAdmin('GET', '/utenti?stato=IN_ATTESA')).corpo.dati.utenti.map(u => u.id), [attesa.id]);
    assert.deepEqual((await comeAdmin('GET', '/utenti?ruolo=SUPERADMIN&limite=100')).corpo.dati.utenti.map(u => u.id), [admin.id]);

    // What the Users page sends with no filter chosen, and an empty filter
    const tutti = await comeAdmin('GET', '/utenti?limite=100&stato=&ruolo=');
    assert.equal(tutti.stato, 200);
    assert.equal(tutti.corpo.dati.paginazione.totale, 3);

    const predefinita = await comeAdmin('GET', '/utenti');
    assert.deepEqual(predefinita.corpo.dati.paginazione, { pagina: 1, limite: 20, totale: 3, pagine: 1 });
    // A page beyond the last one is just empty
    assert.deepEqual((await comeAdmin('GET', '/utenti?pagina=5&limite=3')).corpo.dati.utenti, []);
  });
});

describe('changing a role', () => {
  it('a role that does not exist is refused, and the role stays', async () => {
    for (const ruolo of ['abc', 'utente', '', { x: 1 }, -5, 99999, ['a'], null, undefined]) {
      const risposta = await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, ruolo === undefined ? {} : { ruolo });
      assert.equal(risposta.stato, 400, JSON.stringify(ruolo));
    }
    assert.equal((await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, ['a'])).stato, 400);
    assert.equal((await daDb()).ruolo, 'UTENTE');
  });

  it('says so in the language of the request', async () => {
    const italiano = await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, { ruolo: 'abc' });
    assert.deepEqual(dettagli(italiano), [{ campo: 'ruolo', messaggio: 'Il ruolo deve essere UTENTE, PERSONAL_TRAINER o SUPERADMIN' }]);
    const inglese = await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, { ruolo: 'abc' }, 'en');
    assert.deepEqual(dettagli(inglese), [{ campo: 'ruolo', messaggio: 'The role must be one of UTENTE, PERSONAL_TRAINER or SUPERADMIN' }]);
  });

  it('the other checks keep their order: not the admin, not yourself, not found', async () => {
    assert.equal((await chiedi('PATCH', `/utenti/${admin.id}/ruolo`, { ruolo: 'abc' })).stato, 403);
    assert.equal((await comeAdmin('PATCH', `/utenti/${admin.id}/ruolo`, { ruolo: 'abc' })).stato, 400);
    assert.equal((await comeAdmin('PATCH', '/utenti/99999/ruolo', { ruolo: 'UTENTE' })).stato, 404);
    const valido = await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, { ruolo: 'PERSONAL_TRAINER' });
    assert.deepEqual([valido.stato, valido.corpo.dati.ruolo], [200, 'PERSONAL_TRAINER']);
  });
});

describe('searching people', () => {
  it('a search that is not a single text is refused', async () => {
    for (const query of ['?q[]=ab&q[]=cd', '?q=ab&q=cd', '?q[x]=1']) {
      assert.equal((await chiedi('GET', `/utenti/cerca${query}`)).stato, 400, query);
    }
    const inglese = await chiedi('GET', '/utenti/cerca?q[]=ab&q[]=cd', undefined, { lingua: 'en' });
    assert.equal(dettagli(inglese)[0].messaggio, 'The search must be a single text');
  });

  it('a normal search still finds people', async () => {
    await creaUtente({ nome: 'Marco Rossi' });
    assert.deepEqual((await chiedi('GET', '/utenti/cerca?q=marco')).corpo.dati.map(u => u.nome), ['Marco Rossi']);
  });
});

describe('the texts of the schema', () => {
  it('every key it uses exists in both languages', () => {
    const sorgente = fs.readFileSync(new URL('../../src/validators/utenti.schema.js', import.meta.url), 'utf8');
    const chiavi = [...new Set(sorgente.match(/utentiSchema\.\w+/g))];
    assert.ok(chiavi.length > 20);
    assert.deepEqual(chiavi.filter(chiave => !esisteChiave(chiave)), []);
  });
});
