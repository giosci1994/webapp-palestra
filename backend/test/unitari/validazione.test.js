// The validation middleware (valida) with zod 4: the answer stays the one of zod 3
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { valida } from '../../src/middleware/validazione.js';
import { conLingua, t } from '../../src/i18n/index.js';
import { schemaLogin, schemaRegistrazione } from '../../src/validators/autenticazione.schema.js';
import { schemaRispostaContatto } from '../../src/validators/chat.schema.js';

/** An address on a reserved test domain */
const indirizzo = nome => `${nome}@palestra.test`;

/** Runs valida on a body: the error passed to next, or the body it left */
function prova(schema, corpo) {
  const req = { body: corpo };
  let errore;
  conLingua('en', () => valida({ body: schema })(req, {}, e => { errore = e; }));
  return errore ? { messaggio: errore.message, dettagli: errore.dettagli } : { corpo: req.body };
}

describe('valida', () => {
  it('a missing field gets our message', () => {
    const esito = prova(schemaLogin, { password: 'x' });
    assert.equal(esito.messaggio, conLingua('en', () => t('autenticazioneSchema.emailObbligatoria')));
    assert.deepEqual(esito.dettagli.map(d => d.campo), ['email']);
  });

  it('a list where a text goes is one issue, "not a text": no length check on top', () => {
    const esito = prova(schemaLogin, { email: indirizzo('anna'), password: [] });
    assert.equal(esito.messaggio, conLingua('en', () => t('errori.validazione')));
    assert.deepEqual(esito.dettagli.map(d => d.campo), ['password']);

    const registrazione = prova(schemaRegistrazione, { email: indirizzo('anna'), password: ['a'], nome: 'Anna' });
    assert.deepEqual(registrazione.dettagli.map(d => d.campo), ['password']);
  });

  it('the email is checked, then lower-cased and trimmed', () => {
    assert.deepEqual(prova(schemaLogin, { email: indirizzo('Anna').toUpperCase(), password: 'x' }).corpo, { email: indirizzo('anna'), password: 'x' });
    assert.equal(prova(schemaLogin, { email: 'non-una-email', password: 'x' }).messaggio, conLingua('en', () => t('autenticazioneSchema.emailNonValida')));
  });

  it('an enum: missing, wrong type and a wrong value', () => {
    const chiave = c => conLingua('en', () => t(c));
    assert.equal(prova(schemaRispostaContatto, {}).messaggio, chiave('chatSchema.statoRispostaObbligatorio'));
    assert.equal(prova(schemaRispostaContatto, { stato: 5 }).messaggio, chiave('chatSchema.statoRispostaNonValido'));
    assert.equal(prova(schemaRispostaContatto, { stato: 'FORSE' }).messaggio, chiave('errori.validazione'));
    assert.deepEqual(prova(schemaRispostaContatto, { stato: 'ACCETTATA' }).corpo, { stato: 'ACCETTATA' });
  });
});
