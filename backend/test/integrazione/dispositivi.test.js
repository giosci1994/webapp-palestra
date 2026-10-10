// Dispositivi collegati: ogni login apre una sessione (una famiglia di refresh
// token) che l'utente vede, puo' chiudere da un altro dispositivo, e che si
// chiude col logout o cambiando password. Una sessione chiusa smette subito di
// funzionare, anche col suo access token.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente } from '../supporto/dati.js';
import { improntaToken } from '../../src/utils/token.js';

const PASSWORD = 'Password123';
const TELEFONO = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const COMPUTER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ password: PASSWORD });
});

const refreshTokenDa = risposta => risposta.cookieRicevuti
  .find(c => c.startsWith('refreshToken='))?.split(';')[0].slice('refreshToken='.length);

/** Un login da un dispositivo: il suo access token e il suo refresh token */
async function accedi(userAgent, chi = utente) {
  const risposta = await server.richiesta('POST', '/auth/login', {
    userAgent, corpo: { email: chi.email, password: PASSWORD }
  });
  assert.equal(risposta.stato, 200);
  return { accesso: risposta.corpo.dati.accessToken, refresh: refreshTokenDa(risposta) };
}

const rinnova = token => server.richiesta('POST', '/auth/refresh', { cookie: `refreshToken=${token}` });
const elenco = da => server.richiesta('GET', '/auth/sessioni', { token: da.accesso });
/** Il dispositivo funziona ancora? Una rotta qualsiasi con il suo access token */
const funziona = async da => (await server.richiesta('GET', '/sessioni', { token: da.accesso })).stato === 200;

describe('dispositivi collegati', () => {
  it('ogni login e\' un dispositivo, col nome dallo User-Agent; quello della richiesta viene per primo', async () => {
    await accedi(TELEFONO);
    const computer = await accedi(COMPUTER);

    const risposta = await elenco(computer);
    assert.equal(risposta.stato, 200);
    assert.deepEqual(
      risposta.corpo.dati.map(s => [s.dispositivo, s.corrente]),
      [['Safari · Mac', true], ['Chrome · Android', false]]
    );
  });

  it('i rinnovi restano nella stessa sessione: stesso dispositivo, stessa ora di login', async () => {
    const telefono = await accedi(TELEFONO);
    const [prima] = (await elenco(telefono)).corpo.dati;

    const rinnovo = await rinnova(telefono.refresh);
    const dopo = (await elenco({ accesso: rinnovo.corpo.dati.accessToken })).corpo.dati;
    assert.equal(dopo.length, 1);
    assert.equal(dopo[0].famiglia, prima.famiglia);
    assert.equal(dopo[0].dispositivo, 'Chrome · Android');
    assert.equal(dopo[0].iniziataIl, prima.iniziataIl);
    assert.equal(dopo[0].corrente, true);
  });

  it('scollegare un dispositivo lo ferma subito, anche col suo access token; gli altri restano', async () => {
    const telefono = await accedi(TELEFONO);
    const computer = await accedi(COMPUTER);
    const famigliaTelefono = (await elenco(computer)).corpo.dati.find(s => !s.corrente).famiglia;

    const risposta = await server.richiesta('DELETE', `/auth/sessioni/${famigliaTelefono}`, { token: computer.accesso });
    assert.equal(risposta.stato, 200);

    assert.equal(await funziona(telefono), false, "l'access token del telefono non vale piu'");
    const rinnovo = await rinnova(telefono.refresh);
    assert.equal(rinnovo.stato, 401);
    assert.equal(rinnovo.corpo.messaggio, 'Refresh token non valido');
    // Non e' scattato l'allarme furto: il computer funziona e rinnova
    assert.equal(await funziona(computer), true);
    assert.equal((await rinnova(computer.refresh)).stato, 200);
  });

  it('"esci da tutti gli altri" lascia solo il dispositivo da cui lo chiedi', async () => {
    const telefono = await accedi(TELEFONO);
    const tablet = await accedi(TELEFONO);
    const computer = await accedi(COMPUTER);

    const risposta = await server.richiesta('POST', '/auth/sessioni/chiudi-altre', { token: computer.accesso });
    assert.equal(risposta.stato, 200);

    assert.equal(await funziona(telefono), false);
    assert.equal(await funziona(tablet), false);
    assert.equal(await funziona(computer), true);
    assert.deepEqual((await elenco(computer)).corpo.dati.map(s => s.dispositivo), ['Safari · Mac']);
  });

  it('non si possono chiudere le sessioni di un altro utente', async () => {
    const altro = await creaUtente({ password: PASSWORD });
    const suo = await accedi(TELEFONO, altro);
    const [sessioneAltrui] = (await elenco(suo)).corpo.dati;
    const mio = await accedi(COMPUTER);

    const risposta = await server.richiesta('DELETE', `/auth/sessioni/${sessioneAltrui.famiglia}`, { token: mio.accesso });
    assert.equal(risposta.stato, 404);
    assert.equal(await funziona(suo), true);
  });

  it("cambiare password scollega gli altri dispositivi, non quello da cui la cambi", async () => {
    const telefono = await accedi(TELEFONO);
    const computer = await accedi(COMPUTER);

    const risposta = await server.richiesta('POST', '/utenti/cambia-password', {
      token: computer.accesso, corpo: { vecchiaPassword: PASSWORD, nuovaPassword: 'NuovaPassword1' }
    });
    assert.equal(risposta.stato, 200);

    assert.equal(await funziona(telefono), false);
    assert.equal((await rinnova(telefono.refresh)).stato, 401);
    assert.equal(await funziona(computer), true);
    assert.equal((await rinnova(computer.refresh)).stato, 200);
  });

  it('il logout chiude la sessione di questo dispositivo e basta', async () => {
    const telefono = await accedi(TELEFONO);
    const computer = await accedi(COMPUTER);

    const uscita = await server.richiesta('POST', '/auth/logout', { cookie: `refreshToken=${telefono.refresh}` });
    assert.equal(uscita.stato, 200);

    assert.equal(await funziona(telefono), false);
    assert.equal((await rinnova(telefono.refresh)).stato, 401);
    assert.equal(await funziona(computer), true);
    assert.equal(await prisma.refreshToken.count({ where: { token: improntaToken(telefono.refresh) } }), 0);
  });

  it('se scatta l\'allarme furto, ogni access token dell\'utente smette subito di valere', async () => {
    const telefono = await accedi(TELEFONO);
    const vecchio = telefono.refresh;
    await rinnova(vecchio);
    await prisma.refreshToken.update({
      where: { token: improntaToken(vecchio) }, data: { revocoEffettivoDopo: new Date(Date.now() - 1000) }
    });

    assert.equal((await rinnova(vecchio)).stato, 401);
    assert.equal(await funziona(telefono), false);
  });

  it('eliminando l\'account il cookie del refresh token viene davvero cancellato', async () => {
    const telefono = await accedi(TELEFONO);
    const risposta = await server.richiesta('DELETE', '/utenti/account', {
      token: telefono.accesso, corpo: { password: PASSWORD, conferma: 'ELIMINA' }
    });
    assert.equal(risposta.stato, 200);
    // Stesso path con cui e' stato impostato, altrimenti il browser lo tiene
    const cookie = risposta.cookieRicevuti.find(c => c.startsWith('refreshToken='));
    assert.match(cookie, /^refreshToken=;/);
    assert.match(cookie, /Path=\/api\/v1\/auth/);
  });
});
