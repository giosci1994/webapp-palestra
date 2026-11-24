// The bot's shared secret is compared in constant time (segretiUguali)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { segretiUguali } from '../../src/middleware/bot.auth.js';

describe('segretiUguali', () => {
  it('accepts only the same secret', () => {
    assert.equal(segretiUguali('segreto-del-bot', 'segreto-del-bot'), true);
    assert.equal(segretiUguali('segreto-del-boT', 'segreto-del-bot'), false);
  });

  it('refuses different lengths without throwing', () => {
    assert.equal(segretiUguali('corto', 'segreto-del-bot'), false);
    assert.equal(segretiUguali('segreto-del-bot-e-altro', 'segreto-del-bot'), false);
  });

  it('refuses a missing header or a secret not configured', () => {
    assert.equal(segretiUguali(undefined, 'segreto-del-bot'), false);
    assert.equal(segretiUguali(['segreto-del-bot'], 'segreto-del-bot'), false);
    assert.equal(segretiUguali('', ''), false);
    assert.equal(segretiUguali('qualcosa', undefined), false);
  });
});
