// I mattoni della sicurezza dell'accesso: impronte e rotazione dei token,
// blocco per account dopo troppi errori, nome del dispositivo.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { nuovoToken, improntaToken, tokenSuccessivo } from '../../src/utils/token.js';
import {
  attesaPer, registraErrore, azzeraTentativi,
  TENTATIVI_LIBERI, BLOCCO_INIZIALE_MS, BLOCCO_MASSIMO_MS, DIMENTICA_DOPO_MS
} from '../../src/utils/tentativiAccesso.js';
import { descriviDispositivo } from '../../src/utils/dispositivo.js';

const MINUTO = 60 * 1000;

describe('token', () => {
  it('nuovoToken e\' casuale, esadecimale e della lunghezza chiesta', () => {
    assert.match(nuovoToken(), /^[0-9a-f]{64}$/);
    assert.match(nuovoToken(40), /^[0-9a-f]{80}$/);
    assert.notEqual(nuovoToken(), nuovoToken());
  });

  it("l'impronta e' lo SHA-256 esadecimale, come nella migrazione SQL", () => {
    const atteso = crypto.createHash('sha256').update('abc').digest('hex');
    assert.equal(improntaToken('abc'), atteso);
    assert.notEqual(improntaToken('abc'), 'abc');
  });

  it('il successivo di un token e\' sempre lo stesso, e cambia col segreto', () => {
    const segreto = process.env.JWT_SEGRETO_REFRESH;
    try {
      process.env.JWT_SEGRETO_REFRESH = 'primo-segreto';
      const successivo = tokenSuccessivo('abc');
      assert.equal(tokenSuccessivo('abc'), successivo);
      assert.notEqual(tokenSuccessivo('abd'), successivo);
      process.env.JWT_SEGRETO_REFRESH = 'secondo-segreto';
      assert.notEqual(tokenSuccessivo('abc'), successivo);
    } finally {
      process.env.JWT_SEGRETO_REFRESH = segreto;
    }
  });
});

describe('tentativi di accesso per account', () => {
  let email;
  let progressivo = 0;
  beforeEach(() => { email = `prova${++progressivo}@test.local`; });

  const sbaglia = (volte, adesso) => { for (let i = 0; i < volte; i++) registraErrore(email, adesso); };

  it(`i primi ${TENTATIVI_LIBERI - 1} errori non bloccano, il ${TENTATIVI_LIBERI}° blocca per un minuto`, () => {
    sbaglia(TENTATIVI_LIBERI - 1, 0);
    assert.equal(attesaPer(email, 0), 0);
    registraErrore(email, 0);
    assert.equal(attesaPer(email, 0), BLOCCO_INIZIALE_MS);
    assert.equal(attesaPer(email, BLOCCO_INIZIALE_MS), 0);
  });

  it("ogni errore successivo raddoppia l'attesa, fino al massimo", () => {
    sbaglia(TENTATIVI_LIBERI, 0);
    const attese = [];
    for (let t = 0; t < 6; t++) {
      registraErrore(email, 0);
      attese.push(attesaPer(email, 0) / MINUTO);
    }
    assert.deepEqual(attese, [2, 4, 8, 15, 15, 15]);
    assert.equal(BLOCCO_MASSIMO_MS, 15 * MINUTO);
  });

  it('un accesso riuscito azzera il conto', () => {
    sbaglia(TENTATIVI_LIBERI - 1, 0);
    azzeraTentativi(email);
    sbaglia(TENTATIVI_LIBERI - 1, 0);
    assert.equal(attesaPer(email, 0), 0);
  });

  it("dopo un'ora senza errori l'email viene dimenticata", () => {
    sbaglia(TENTATIVI_LIBERI - 1, 0);
    registraErrore(email, DIMENTICA_DOPO_MS + 1);
    assert.equal(attesaPer(email, DIMENTICA_DOPO_MS + 1), 0, 'riparte da un errore solo');
  });

  it('maiuscole e spazi non creano un conto a parte', () => {
    sbaglia(TENTATIVI_LIBERI, 0);
    assert.ok(attesaPer(`  ${email.toUpperCase()} `, 0) > 0);
  });

  it("un'email non blocca le altre", () => {
    sbaglia(TENTATIVI_LIBERI, 0);
    assert.equal(attesaPer('altra@test.local', 0), 0);
  });
});

describe('descriviDispositivo', () => {
  const casi = [
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1', 'Chrome · iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15', 'Safari · Mac'],
    ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox · Linux'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet · Android']
  ];

  for (const [userAgent, atteso] of casi) {
    it(atteso, () => assert.equal(descriviDispositivo(userAgent), atteso));
  }

  it('senza User-Agent, o con uno che non dice niente, nessun nome', () => {
    assert.equal(descriviDispositivo(undefined), null);
    assert.equal(descriviDispositivo('curl/8.5.0'), null);
  });
});
