// The emails (address verification, password reset) are written in the
// language of the request that sends them. Resend is simulated.
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { conLingua } from '../../src/i18n/index.js';

// The service reads the key when it loads: set it first (each test file runs in its own process)
process.env.RESEND_API_KEY = 're_chiave_di_prova';
const { inviaEmailVerifica, inviaEmailReset } = await import('../../src/services/email.service.js');

const utente = { email: 'mario@test.local', nome: 'Mario' };
let inviata;

before(() => {
  mock.method(globalThis, 'fetch', async (indirizzo, opzioni) => {
    inviata = JSON.parse(opzioni.body);
    return { ok: true };
  });
});
after(() => mock.restoreAll());

describe('emails in the language of the request', () => {
  it('address verification', async () => {
    await conLingua('it', () => inviaEmailVerifica(utente, 'tok123'));
    assert.equal(inviata.subject, 'Verifica il tuo indirizzo email — GymMaster');
    assert.match(inviata.html, /Ciao Mario, conferma il tuo indirizzo email per attivare l'account\./);
    assert.match(inviata.html, /Verifica la mia email/);
    assert.match(inviata.html, /verifica-email\?token=tok123/);

    await conLingua('en', () => inviaEmailVerifica(utente, 'tok123'));
    assert.equal(inviata.subject, 'Verify your email address — GymMaster');
    assert.match(inviata.html, /Hi Mario, confirm your email address to activate your account\./);
    assert.match(inviata.html, /Verify my email/);
    assert.match(inviata.html, /If the button doesn't work, copy this link:/);
    assert.doesNotMatch(inviata.html, /Ciao|Verifica/);
  });

  it('password reset', async () => {
    await conLingua('it', () => inviaEmailReset(utente, 'tok456'));
    assert.equal(inviata.subject, 'Reimposta la tua password — GymMaster');
    assert.match(inviata.html, /la password resterà invariata/);

    await conLingua('en', () => inviaEmailReset(utente, 'tok456'));
    assert.equal(inviata.subject, 'Reset your password — GymMaster');
    assert.match(inviata.html, /Hi Mario, you asked to reset the password of your GymMaster account\./);
    assert.match(inviata.html, /your password will stay the same/);
    assert.doesNotMatch(inviata.html, /Ciao|Reimposta/);
  });
});
