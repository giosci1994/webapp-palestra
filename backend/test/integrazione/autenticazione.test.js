// Login, rinnovo del refresh token e accesso alle rotte protette, attraverso
// le rotte vere e un database vero.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, GIORNO } from '../supporto/dati.js';
import { improntaToken } from '../../src/utils/token.js';

const PASSWORD = 'Password123';
let server;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(() => svuotaDatabase());

const login = (email, corpo = {}) =>
  server.richiesta('POST', '/auth/login', { corpo: { email, password: PASSWORD, ...corpo } });
const rinnova = token => server.richiesta('POST', '/auth/refresh', { cookie: `refreshToken=${token}` });

/** Il cookie del refresh token, cosi' come lo imposta la risposta */
const cookieRefresh = risposta => risposta.cookieRicevuti.find(c => c.startsWith('refreshToken='));
const refreshTokenDa = risposta => cookieRefresh(risposta)?.split(';')[0].slice('refreshToken='.length);

describe('login', () => {
  it("con le credenziali giuste da' un access token valido e il refresh token in un cookie HttpOnly", async () => {
    const utente = await creaUtente({ password: PASSWORD });

    const risposta = await login(utente.email);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.utente.id, utente.id);

    const cookie = cookieRefresh(risposta);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/v1\/auth/);
    const token = refreshTokenDa(risposta);
    const salvato = await prisma.refreshToken.findUnique({ where: { token: improntaToken(token) } });
    assert.equal(salvato.utenteId, utente.id);
    assert.equal(await prisma.refreshToken.count({ where: { token } }), 0, 'nel database solo l\'impronta');

    const protetta = await server.richiesta('GET', '/sessioni', { token: risposta.corpo.dati.accessToken });
    assert.equal(protetta.stato, 200);
  });

  it("password sbagliata ed email sconosciuta danno lo stesso messaggio: non si scopre chi e' iscritto", async () => {
    const utente = await creaUtente({ password: PASSWORD });

    const sbagliata = await login(utente.email, { password: 'Sbagliata123' });
    const sconosciuta = await login('nessuno@test.local');
    for (const risposta of [sbagliata, sconosciuta]) {
      assert.equal(risposta.stato, 401);
      assert.equal(risposta.corpo.messaggio, 'Credenziali non valide');
    }
  });

  it('un account sospeso o in attesa di approvazione non entra', async () => {
    const sospeso = await creaUtente({ password: PASSWORD, stato: 'BANNATO' });
    const inAttesa = await creaUtente({ password: PASSWORD, stato: 'IN_ATTESA' });

    const primo = await login(sospeso.email);
    assert.equal(primo.stato, 401);
    assert.equal(primo.corpo.messaggio, 'Il tuo account è stato sospeso');

    const secondo = await login(inAttesa.email);
    assert.equal(secondo.stato, 401);
    assert.match(secondo.corpo.messaggio, /in attesa di approvazione/);
  });

  it("con l'email ancora da verificare non entra", async () => {
    const utente = await creaUtente({ password: PASSWORD, emailVerificata: false });

    const risposta = await login(utente.email);
    assert.equal(risposta.stato, 401);
    assert.match(risposta.corpo.messaggio, /^Verifica la tua email/);
  });

  it('"Ricorda dispositivo" fa durare la sessione 30 giorni invece di 7', async () => {
    const utente = await creaUtente({ password: PASSWORD });

    const normale = await login(utente.email);
    assert.match(cookieRefresh(normale), /Max-Age=604800/);

    const ricordato = await login(utente.email, { ricordaDispositivo: true });
    assert.match(cookieRefresh(ricordato), /Max-Age=2592000/);
    const salvato = await prisma.refreshToken.findUnique({ where: { token: improntaToken(refreshTokenDa(ricordato)) } });
    assert.equal(salvato.durataGiorni, 30);
  });

  it('dopo 20 tentativi dallo stesso indirizzo si ferma per 15 minuti, gli altri indirizzi no', async () => {
    const ip = '192.0.2.7';
    // Un'email diversa a ogni tentativo: qui conta l'indirizzo, non l'account
    let n = 0;
    const tentativo = indirizzo => server.richiesta('POST', '/auth/login', {
      ip: indirizzo, corpo: { email: `nessuno${++n}@test.local`, password: 'Sbagliata123' }
    });

    for (let i = 0; i < 20; i++) {
      assert.equal((await tentativo(ip)).stato, 401);
    }
    const bloccato = await tentativo(ip);
    assert.equal(bloccato.stato, 429);
    assert.equal(bloccato.corpo.codice, 'TROPPE_RICHIESTE_AUTH');

    assert.equal((await tentativo('192.0.2.8')).stato, 401);
  });
});

describe('rinnovo del refresh token', () => {
  it('ruota il token: il nuovo funziona, il vecchio vale ancora solo 40 secondi', async () => {
    const utente = await creaUtente({ password: PASSWORD });
    const vecchio = refreshTokenDa(await login(utente.email));

    const risposta = await rinnova(vecchio);
    assert.equal(risposta.stato, 200);
    assert.ok(risposta.corpo.dati.accessToken);
    const nuovo = refreshTokenDa(risposta);
    assert.notEqual(nuovo, vecchio);

    const salvatoVecchio = await prisma.refreshToken.findUnique({ where: { token: improntaToken(vecchio) } });
    assert.equal(salvatoVecchio.revocato, true);
    const grazia = salvatoVecchio.revocoEffettivoDopo.getTime() - Date.now();
    assert.ok(grazia > 30 * 1000 && grazia <= 40 * 1000, `grazia di ${grazia} ms`);
    const salvatoNuovo = await prisma.refreshToken.findUnique({ where: { token: improntaToken(nuovo) } });
    assert.equal(salvatoNuovo.revocato, false);
  });

  it('entro i 40 secondi il vecchio token restituisce il sostituto, senza crearne altri', async () => {
    // Il telefono rinnova, la risposta si perde per strada e lui riprova col token di prima
    const utente = await creaUtente({ password: PASSWORD });
    const vecchio = refreshTokenDa(await login(utente.email));
    const sostituto = refreshTokenDa(await rinnova(vecchio));

    const riprova = await rinnova(vecchio);
    assert.equal(riprova.stato, 200);
    assert.equal(refreshTokenDa(riprova), sostituto);
    assert.equal(await prisma.refreshToken.count({ where: { utenteId: utente.id } }), 2);
  });

  it("riusare un token oltre la grazia fa pensare a un furto: si chiudono tutte le sessioni dell'utente", async () => {
    const utente = await creaUtente({ password: PASSWORD });
    const vecchio = refreshTokenDa(await login(utente.email));
    const sostituto = refreshTokenDa(await rinnova(vecchio));
    await prisma.refreshToken.update({
      where: { token: improntaToken(vecchio) },
      data: { revocoEffettivoDopo: new Date(Date.now() - 1000) }
    });

    const riuso = await rinnova(vecchio);
    assert.equal(riuso.stato, 401);
    assert.equal(riuso.corpo.messaggio, 'Token di sicurezza compromesso, effettua nuovamente il login');

    assert.equal((await rinnova(sostituto)).stato, 401);
    assert.equal(await prisma.refreshToken.count({ where: { utenteId: utente.id, revocato: false } }), 0);
  });

  it('dopo il logout il token non rinnova piu\' e il cookie viene cancellato', async () => {
    const utente = await creaUtente({ password: PASSWORD });
    const token = refreshTokenDa(await login(utente.email));

    const uscita = await server.richiesta('POST', '/auth/logout', { cookie: `refreshToken=${token}` });
    assert.equal(uscita.stato, 200);
    assert.match(cookieRefresh(uscita), /^refreshToken=;/);

    assert.equal((await rinnova(token)).stato, 401);
  });

  it('un token scaduto non rinnova', async () => {
    const utente = await creaUtente();
    await prisma.refreshToken.create({
      data: { token: improntaToken('scaduto'), utenteId: utente.id, scadenza: new Date(Date.now() - GIORNO), famiglia: 'f-scaduta' }
    });

    const risposta = await rinnova('scaduto');
    assert.equal(risposta.stato, 401);
    assert.equal(risposta.corpo.messaggio, 'Refresh token scaduto');
  });

  it('senza token risponde 401', async () => {
    const risposta = await server.richiesta('POST', '/auth/refresh');
    assert.equal(risposta.stato, 401);
    assert.equal(risposta.corpo.messaggio, 'Refresh token mancante');
  });

  it("un account sospeso dopo il login non rinnova e non usa piu' nemmeno l'access token", async () => {
    const utente = await creaUtente({ password: PASSWORD });
    const accesso = await login(utente.email);
    await prisma.utente.update({ where: { id: utente.id }, data: { stato: 'BANNATO' } });

    const rinnovo = await rinnova(refreshTokenDa(accesso));
    assert.equal(rinnovo.stato, 401);
    assert.equal(rinnovo.corpo.messaggio, 'Account non attivo');

    const protetta = await server.richiesta('GET', '/sessioni', { token: accesso.corpo.dati.accessToken });
    assert.equal(protetta.stato, 401);
    assert.equal(protetta.corpo.messaggio, 'Il tuo account è stato sospeso');
  });
});

describe('rotte protette', () => {
  it('senza access token rispondono 401', async () => {
    const risposta = await server.richiesta('GET', '/sessioni');
    assert.equal(risposta.stato, 401);
    assert.equal(risposta.corpo.messaggio, 'Token di accesso mancante');
  });

  it('rifiutano un token firmato con un altro segreto, uno scaduto e quello di un utente cancellato', async () => {
    const utente = await creaUtente();
    const payload = { utenteId: utente.id, email: utente.email, ruolo: utente.ruolo };
    const casi = [
      [jwt.sign(payload, 'un-altro-segreto'), 'Token di accesso non valido'],
      [jwt.sign(payload, process.env.JWT_SEGRETO_ACCESS, { expiresIn: -10 }), 'Token di accesso scaduto'],
      [tokenPer({ ...utente, id: utente.id + 1000 }), 'Utente non trovato']
    ];
    for (const [token, messaggio] of casi) {
      const risposta = await server.richiesta('GET', '/sessioni', { token });
      assert.equal(risposta.stato, 401, messaggio);
      assert.equal(risposta.corpo.messaggio, messaggio);
    }
  });
});

describe('blocco per account dopo troppe password sbagliate', () => {
  const sbaglia = email => login(email, { password: 'Sbagliata123' });

  it("alla quinta password sbagliata l'account si ferma, anche per chi poi la azzecca", async () => {
    const utente = await creaUtente({ password: PASSWORD });
    for (let i = 0; i < 4; i++) assert.equal((await sbaglia(utente.email)).stato, 401);

    const quinta = await sbaglia(utente.email);
    assert.equal(quinta.stato, 401, 'la quinta risponde ancora "credenziali non valide"');

    const giusta = await login(utente.email);
    assert.equal(giusta.stato, 429);
    assert.equal(giusta.corpo.messaggio, 'Troppi tentativi sbagliati per questo account: riprova tra 1 minuto');
  });

  it("vale anche per un'email che non esiste: il blocco non rivela chi e' iscritto", async () => {
    for (let i = 0; i < 5; i++) await sbaglia('fantasma@test.local');
    const risposta = await sbaglia('fantasma@test.local');
    assert.equal(risposta.stato, 429);
  });

  it('gli altri account non ne risentono', async () => {
    const bersaglio = await creaUtente({ password: PASSWORD });
    const altro = await creaUtente({ password: PASSWORD });
    for (let i = 0; i < 5; i++) await sbaglia(bersaglio.email);

    assert.equal((await login(altro.email)).stato, 200);
  });

  it('un accesso riuscito azzera il conto degli errori', async () => {
    const utente = await creaUtente({ password: PASSWORD });
    for (let i = 0; i < 4; i++) await sbaglia(utente.email);
    assert.equal((await login(utente.email)).stato, 200);

    for (let i = 0; i < 4; i++) await sbaglia(utente.email);
    assert.equal((await login(utente.email)).stato, 200);
  });
});

describe('token di verifica email e di reset password', () => {
  const unOra = () => new Date(Date.now() + 60 * 60 * 1000);

  it("il link di verifica funziona col token in chiaro, mentre nel database c'e' l'impronta", async () => {
    const utente = await creaUtente({
      emailVerificata: false, tokenVerificaEmail: improntaToken('token-verifica'), tokenVerificaScadenza: unOra()
    });

    assert.equal((await server.richiesta('GET', '/auth/verifica-email?token=improntaqualsiasi')).stato, 400);
    const risposta = await server.richiesta('GET', '/auth/verifica-email?token=token-verifica');
    assert.equal(risposta.stato, 200);
    const dopo = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.equal(dopo.emailVerificata, true);
  });

  it("il reset cambia la password, chiude le sessioni e sblocca l'account", async () => {
    const utente = await creaUtente({
      password: PASSWORD, tokenResetPassword: improntaToken('token-reset'), tokenResetScadenza: unOra()
    });
    const sessione = refreshTokenDa(await login(utente.email));
    for (let i = 0; i < 5; i++) await login(utente.email, { password: 'Sbagliata123' });

    // Chi conosce solo l'impronta (per esempio da un backup) non puo' usarla
    const conImpronta = await server.richiesta('POST', '/auth/reimposta-password', {
      corpo: { token: improntaToken('token-reset'), password: 'NuovaPassword1' }
    });
    assert.equal(conImpronta.stato, 400);

    const risposta = await server.richiesta('POST', '/auth/reimposta-password', {
      corpo: { token: 'token-reset', password: 'NuovaPassword1' }
    });
    assert.equal(risposta.stato, 200);
    assert.equal((await rinnova(sessione)).stato, 401, 'le sessioni aperte sono chiuse');
    assert.equal((await login(utente.email, { password: 'NuovaPassword1' })).stato, 200, 'e il blocco e\' tolto');
  });
});

describe('conversione dei token gia\' emessi (migrazione 20261010_token_come_impronta)', () => {
  const istruzioni = readFileSync(
    new URL('../../prisma/migrations/20261010_token_come_impronta/migration.sql', import.meta.url), 'utf8'
  ).split('\n').filter(riga => riga.startsWith('UPDATE '));

  it('chi era collegato resta collegato, e i link gia\' spediti funzionano ancora', async () => {
    // Come sono oggi in produzione: token in chiaro nel database
    const utente = await creaUtente({
      emailVerificata: false, tokenVerificaEmail: 'verifica-in-chiaro', tokenVerificaScadenza: new Date(Date.now() + GIORNO)
    });
    await prisma.refreshToken.create({
      data: { token: 'refresh-in-chiaro', utenteId: utente.id, scadenza: new Date(Date.now() + GIORNO), famiglia: 'f-vecchia' }
    });

    assert.equal(istruzioni.length, 3);
    for (const istruzione of istruzioni) await prisma.$executeRawUnsafe(istruzione);

    assert.equal(await prisma.refreshToken.count({ where: { token: 'refresh-in-chiaro' } }), 0);
    assert.equal((await rinnova('refresh-in-chiaro')).stato, 200);
    assert.equal((await server.richiesta('GET', '/auth/verifica-email?token=verifica-in-chiaro')).stato, 200);
  });
});
