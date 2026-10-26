// The messages of sign-in, validation, roles, limits and the data export come
// in the language of the request: Italian and English.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ password: 'Password123' });
});

/** The same request in Italian and in English: [it, en] */
const inDueLingue = (metodo, percorso, opzioni) =>
  Promise.all(['it', 'en'].map(lingua => server.richiesta(metodo, percorso, { ...opzioni, lingua })));

describe('sign-in', () => {
  it('wrong credentials', async () => {
    const [it, en] = await inDueLingue('POST', '/auth/login', {
      corpo: { email: utente.email, password: 'Sbagliata123' }
    });
    assert.deepEqual([it.stato, it.corpo.messaggio], [401, 'Credenziali non valide']);
    assert.deepEqual([en.stato, en.corpo.messaggio], [401, 'Invalid credentials']);
  });

  it('the account status, with the code the app acts on kept as it is', async () => {
    const sospeso = await creaUtente({ password: 'Password123', stato: 'BANNATO' });
    const nonVerificato = await creaUtente({ password: 'Password123', emailVerificata: false });
    const [, enSospeso] = await inDueLingue('POST', '/auth/login', { corpo: { email: sospeso.email, password: 'Password123' } });
    const [itVerifica, enVerifica] = await inDueLingue('POST', '/auth/login', { corpo: { email: nonVerificato.email, password: 'Password123' } });
    assert.equal(enSospeso.corpo.messaggio, 'Your account has been suspended');
    assert.match(itVerifica.corpo.messaggio, /^Verifica la tua email/);
    assert.match(enVerifica.corpo.messaggio, /^Verify your email/);
    assert.equal(enVerifica.corpo.codice, 'EMAIL_NON_VERIFICATA');
  });

  it('the wait after too many wrong passwords says how many minutes, in the right plural', async () => {
    for (let i = 0; i < 5; i++) {
      await server.richiesta('POST', '/auth/login', { corpo: { email: utente.email, password: 'Sbagliata123' } });
    }
    const [it, en] = await inDueLingue('POST', '/auth/login', { corpo: { email: utente.email, password: 'Password123' } });
    assert.equal(it.corpo.messaggio, 'Troppi tentativi sbagliati per questo account: riprova tra 1 minuto');
    assert.equal(en.corpo.messaggio, 'Too many failed attempts for this account: try again in 1 minute');
  });

  it('a request without a token', async () => {
    const [it, en] = await inDueLingue('GET', '/sessioni');
    assert.equal(it.corpo.messaggio, 'Token di accesso mancante');
    assert.equal(en.corpo.messaggio, 'Access token missing');
  });
});

describe('validation', () => {
  it('the message of each field (schemas write keys, the middleware translates them), the first one as the main message', async () => {
    const [it, en] = await inDueLingue('POST', '/auth/login', { corpo: { email: 'non-una-email', password: 'x' } });
    assert.equal(it.corpo.messaggio, 'Formato email non valido');
    assert.equal(en.corpo.messaggio, 'Invalid email format');
    assert.deepEqual(it.corpo.dettagli.map(d => [d.campo, d.messaggio]), [['email', 'Formato email non valido']]);
    assert.deepEqual(en.corpo.dettagli.map(d => [d.campo, d.messaggio]), [['email', 'Invalid email format']]);
  });

  it('a field that is missing and a password that is too weak', async () => {
    const [it, en] = await inDueLingue('POST', '/auth/registrazione', { corpo: { email: 'a@test.local', password: 'debole' } });
    // The first message of each field
    const messaggi = r => Object.fromEntries(r.corpo.dettagli.map(d => [d.campo, d.messaggio]).reverse());
    assert.equal(messaggi(it).nome, 'Nome obbligatorio');
    assert.equal(messaggi(en).nome, 'Name is required');
    assert.equal(messaggi(it).password, 'La password deve avere almeno 8 caratteri');
    assert.equal(messaggi(en).password, 'The password must be at least 8 characters long');
  });

  it('an id in the address that is not a number', async () => {
    const [it, en] = await inDueLingue('GET', '/sessioni/abc', { token: tokenPer(utente) });
    assert.equal(it.stato, 400);
    assert.equal(it.corpo.messaggio, 'Parametro "id" non valido');
    assert.equal(en.corpo.messaggio, 'Invalid "id" parameter');
  });

  it('an app language that does not exist', async () => {
    const [it, en] = await inDueLingue('PATCH', '/utenti/profilo', { token: tokenPer(utente), corpo: { lingua: 'fr' } });
    assert.equal(it.corpo.messaggio, 'Lingua non supportata: usa en, it');
    assert.equal(en.corpo.messaggio, 'Unsupported language: use en, it');
  });
});

describe('roles and limits', () => {
  it('a route for administrators only', async () => {
    const [it, en] = await inDueLingue('GET', '/utenti', { token: tokenPer(utente) });
    assert.equal(it.stato, 403);
    assert.equal(it.corpo.messaggio, "Ruolo 'UTENTE' non autorizzato. Richiesto: SUPERADMIN");
    assert.equal(en.corpo.messaggio, "Role 'UTENTE' is not authorized. Required: SUPERADMIN");
  });

  it('the sign-in limit answers in the language of the request', async () => {
    const ip = '192.0.2.77';
    const tentativo = (i, lingua) => server.richiesta('POST', '/auth/login', {
      ip, lingua, corpo: { email: `nessuno${i}@test.local`, password: 'Sbagliata123' }
    });
    for (let i = 0; i < 20; i++) await tentativo(i, 'it');

    const [it, en] = await Promise.all([tentativo(20, 'it'), tentativo(21, 'en')]);
    assert.deepEqual([it.stato, it.corpo.codice], [429, 'TROPPE_RICHIESTE_AUTH']);
    assert.equal(it.corpo.messaggio, 'Troppi tentativi di autenticazione, riprova tra 15 minuti.');
    assert.equal(en.corpo.messaggio, 'Too many sign-in attempts, try again in 15 minutes.');
  });

  it('the Telegram bot routes without the secret', async () => {
    const [it, en] = await inDueLingue('POST', '/bot/messaggio', { corpo: { chatId: '1', testo: 'ciao' } });
    assert.equal(it.stato, 403);
    assert.equal(it.corpo.messaggio, 'Accesso bot non autorizzato');
    assert.equal(en.corpo.messaggio, 'Bot access not authorized');
  });
});

describe('data export', () => {
  it('the note at the top of the file is in the language of the request', async () => {
    const [it, en] = await inDueLingue('GET', '/utenti/esportazione', { token: tokenPer(utente) });
    assert.equal(it.corpo.nota, 'Tutti i dati che GymMaster conserva sul tuo account. Degli altri utenti compare solo il nome.');
    assert.equal(en.corpo.nota, 'All the data GymMaster keeps about your account. Of other users, only the name appears.');
  });
});
