// Passkey: aggiungerne una dal profilo (con la password), entrare senza
// password, eliminarla. Le risposte del dispositivo le produce un
// autenticatore software (supporto/passkey.js) e passano per la verifica vera.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente } from '../supporto/dati.js';
import { creaAutenticatore } from '../supporto/passkey.js';
import { configurazionePasskey } from '../../src/services/passkey.service.js';

const PASSWORD = 'Password123';
const TELEFONO = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const config = configurazionePasskey();

let server;
let utente;
let accesso;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ password: PASSWORD });
  accesso = await entraConPassword(utente);
});

async function entraConPassword(chi) {
  const risposta = await server.richiesta('POST', '/auth/login', { corpo: { email: chi.email, password: PASSWORD } });
  assert.equal(risposta.stato, 200);
  return risposta.corpo.dati.accessToken;
}

/** Aggiunge una passkey all'utente col suo access token; restituisce l'autenticatore */
async function aggiungiPasskey(token = accesso, autenticatore = creaAutenticatore(config)) {
  const opzioni = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { token, corpo: { password: PASSWORD } });
  assert.equal(opzioni.stato, 200);
  const { id, opzioni: sfida } = opzioni.corpo.dati;
  const verifica = await server.richiesta('POST', '/auth/passkey/registrazione/verifica', {
    token, userAgent: TELEFONO, corpo: { id, risposta: autenticatore.registra(sfida) }
  });
  assert.equal(verifica.stato, 201, JSON.stringify(verifica.corpo));
  return autenticatore;
}

/** Il giro completo di un accesso con passkey */
async function entraConPasskey(autenticatore, opzioniFirma = {}) {
  const opzioni = await server.richiesta('POST', '/auth/passkey/accesso/opzioni');
  assert.equal(opzioni.stato, 200);
  const { id, opzioni: sfida } = opzioni.corpo.dati;
  return server.richiesta('POST', '/auth/passkey/accesso/verifica', {
    userAgent: TELEFONO, corpo: { id, risposta: autenticatore.firma(sfida, opzioniFirma) }
  });
}

describe('aggiungere una passkey', () => {
  it('serve la password: la sessione da sola non basta', async () => {
    const senza = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { token: accesso, corpo: {} });
    assert.equal(senza.stato, 403);
    const sbagliata = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', {
      token: accesso, corpo: { password: 'Sbagliata123' }
    });
    assert.equal(sbagliata.stato, 403);
    assert.equal(sbagliata.corpo.messaggio, 'Password non corretta');
  });

  it('serve il login', async () => {
    assert.equal((await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { corpo: { password: PASSWORD } })).stato, 401);
    assert.equal((await server.richiesta('GET', '/auth/passkey')).stato, 401);
  });

  it('una volta aggiunta compare nel profilo, col dispositivo da cui e\' nata', async () => {
    await aggiungiPasskey();

    const elenco = await server.richiesta('GET', '/auth/passkey', { token: accesso });
    assert.equal(elenco.stato, 200);
    assert.deepEqual(elenco.corpo.dati.map(p => [p.nome, p.ultimoUso]), [['Chrome · Android', null]]);
    // Nel database la chiave pubblica, non quella privata (che non lascia mai il dispositivo)
    const [salvata] = await prisma.passkey.findMany({ where: { utenteId: utente.id } });
    assert.ok(salvata.chiavePubblica.length > 50);
  });

  it('le opzioni escludono le passkey gia\' registrate, per non duplicarle', async () => {
    const autenticatore = await aggiungiPasskey();
    const opzioni = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { token: accesso, corpo: { password: PASSWORD } });
    assert.deepEqual(opzioni.corpo.dati.opzioni.excludeCredentials.map(c => c.id), [autenticatore.id]);
  });

  it('una risposta nata per un altro sito viene rifiutata', async () => {
    const opzioni = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { token: accesso, corpo: { password: PASSWORD } });
    const { id, opzioni: sfida } = opzioni.corpo.dati;
    const verifica = await server.richiesta('POST', '/auth/passkey/registrazione/verifica', {
      token: accesso, corpo: { id, risposta: creaAutenticatore(config).registra(sfida, { origine: 'https://sito-falso.test' }) }
    });
    assert.equal(verifica.stato, 400);
    assert.equal(await prisma.passkey.count(), 0);
  });

  it('la sfida di un altro utente non vale', async () => {
    const altro = await creaUtente({ password: PASSWORD });
    const accessoAltro = await entraConPassword(altro);
    const opzioni = await server.richiesta('POST', '/auth/passkey/registrazione/opzioni', { token: accesso, corpo: { password: PASSWORD } });
    const { id, opzioni: sfida } = opzioni.corpo.dati;

    const verifica = await server.richiesta('POST', '/auth/passkey/registrazione/verifica', {
      token: accessoAltro, corpo: { id, risposta: creaAutenticatore(config).registra(sfida) }
    });
    assert.equal(verifica.stato, 400);
  });
});

describe('entrare con una passkey', () => {
  it('apre una sessione come la password: access token, cookie e dispositivo', async () => {
    const autenticatore = await aggiungiPasskey();

    const risposta = await entraConPasskey(autenticatore);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.utente.id, utente.id);
    assert.ok(risposta.cookieRicevuti.some(c => c.startsWith('refreshToken=') && /HttpOnly/.test(c)));
    const protetta = await server.richiesta('GET', '/sessioni', { token: risposta.corpo.dati.accessToken });
    assert.equal(protetta.stato, 200);

    const [passkey] = (await server.richiesta('GET', '/auth/passkey', { token: accesso })).corpo.dati;
    assert.ok(passkey.ultimoUso, "l'ultimo uso e' registrato");
  });

  it('"Ricorda dispositivo" vale anche qui', async () => {
    const autenticatore = await aggiungiPasskey();
    const opzioni = await server.richiesta('POST', '/auth/passkey/accesso/opzioni');
    const { id, opzioni: sfida } = opzioni.corpo.dati;
    const risposta = await server.richiesta('POST', '/auth/passkey/accesso/verifica', {
      corpo: { id, risposta: autenticatore.firma(sfida), ricordaDispositivo: true }
    });
    assert.match(risposta.cookieRicevuti.find(c => c.startsWith('refreshToken=')), /Max-Age=2592000/);
  });

  it('una passkey sconosciuta e una firma per un altro sito danno lo stesso messaggio', async () => {
    const registrata = await aggiungiPasskey();
    const sconosciuta = await entraConPasskey(creaAutenticatore(config));
    const altroSito = await entraConPasskey(registrata, { origine: 'https://sito-falso.test' });

    for (const risposta of [sconosciuta, altroSito]) {
      assert.equal(risposta.stato, 401);
      assert.match(risposta.corpo.messaggio, /^Passkey non riconosciuta/);
    }
  });

  it('la stessa sfida non si usa due volte', async () => {
    const autenticatore = await aggiungiPasskey();
    const opzioni = await server.richiesta('POST', '/auth/passkey/accesso/opzioni');
    const { id, opzioni: sfida } = opzioni.corpo.dati;
    const corpo = { id, risposta: autenticatore.firma(sfida) };

    assert.equal((await server.richiesta('POST', '/auth/passkey/accesso/verifica', { corpo })).stato, 200);
    const replay = await server.richiesta('POST', '/auth/passkey/accesso/verifica', { corpo });
    assert.equal(replay.stato, 400);
    assert.equal(replay.corpo.messaggio, 'Richiesta scaduta: riprova');
  });

  it('un contatore che torna indietro vuol dire passkey clonata: rifiutata', async () => {
    const autenticatore = await aggiungiPasskey();
    assert.equal((await entraConPasskey(autenticatore, { contatore: 10 })).stato, 200);

    const clone = await entraConPasskey(autenticatore, { contatore: 5 });
    assert.equal(clone.stato, 401);
  });

  it('un account sospeso non entra nemmeno con la passkey', async () => {
    const autenticatore = await aggiungiPasskey();
    await prisma.utente.update({ where: { id: utente.id }, data: { stato: 'BANNATO' } });

    const risposta = await entraConPasskey(autenticatore);
    assert.equal(risposta.stato, 401);
    assert.equal(risposta.corpo.messaggio, 'Il tuo account è stato sospeso');
  });
});

describe('eliminare una passkey', () => {
  it('dopo non apre piu\' niente', async () => {
    const autenticatore = await aggiungiPasskey();
    const [passkey] = (await server.richiesta('GET', '/auth/passkey', { token: accesso })).corpo.dati;

    const elimina = await server.richiesta('DELETE', `/auth/passkey/${passkey.id}`, { token: accesso });
    assert.equal(elimina.stato, 200);
    assert.equal((await entraConPasskey(autenticatore)).stato, 401);
  });

  it('non si eliminano le passkey degli altri', async () => {
    const altro = await creaUtente({ password: PASSWORD });
    await aggiungiPasskey(await entraConPassword(altro));
    const [passkeyAltrui] = await prisma.passkey.findMany();

    const risposta = await server.richiesta('DELETE', `/auth/passkey/${passkeyAltrui.id}`, { token: accesso });
    assert.equal(risposta.stato, 404);
    assert.equal(await prisma.passkey.count(), 1);
  });
});
