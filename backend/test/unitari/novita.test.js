// The "what's new" stories live in prisma/novita.json and are added when
// their version is released. A mistake in the file must stop the pull
// request, not the release.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { problemiStorie, righeDellaVersione, storiaInLingua } from '../../src/utils/novitaRilascio.js';

const storia = (campi = {}) => ({
  versione: '1.3.0',
  titolo: 'Una novita',
  sottotitolo: 'Due parole',
  icona: '🔔',
  punti: [{ icona: '⏱️', testo: 'Primo punto' }],
  ctaTesto: 'Provala',
  ctaRotta: '/profilo?tab=notifiche',
  coloreInizio: '#ec4899',
  coloreFine: '#9060fb',
  ...campi
});

describe('il file delle storie del repository', () => {
  it('e\' valido', () => {
    const storie = JSON.parse(readFileSync(new URL('../../prisma/novita.json', import.meta.url), 'utf8'));
    assert.deepEqual(problemiStorie(storie), []);
  });
});

describe('problemiStorie', () => {
  it('una storia completa, e una con il solo titolo, vanno bene', () => {
    assert.deepEqual(problemiStorie([storia(), { versione: '1.3.0', titolo: 'Solo il titolo' }]), []);
  });

  it('segnala versione, titolo, colori, rotta e punti sbagliati, con il titolo della storia', () => {
    const problemi = problemiStorie([
      storia({ versione: 'v1.3' }),
      storia({ titolo: '' }),
      storia({ titolo: 'Colori', coloreFine: 'viola' }),
      storia({ titolo: 'Rotta', ctaRotta: 'https://esempio.it' }),
      storia({ titolo: 'Punti', punti: [{ icona: '⏱️' }] })
    ]);
    assert.equal(problemi.length, 5);
    assert.match(problemi[0], /Storia 1 \(«Una novita»\): versione/);
    assert.match(problemi[1], /Storia 2: titolo mancante/);
    assert.match(problemi[2], /«Colori».*coloreFine/);
    assert.match(problemi[3], /«Rotta».*ctaRotta/);
    assert.match(problemi[4], /«Punti».*punti/);
  });

  it('due storie con lo stesso titolo non vanno: il titolo dice se c\'e\' gia\'', () => {
    assert.match(problemiStorie([storia(), storia({ versione: '1.4.0' })])[0], /titolo ripetuto/);
  });

  it('il file deve essere un elenco', () => {
    assert.equal(problemiStorie({ titolo: 'x' }).length, 1);
  });
});

describe('righeDellaVersione', () => {
  it('solo le storie della versione, pronte per la tabella', () => {
    const adesso = new Date('2026-10-11T10:00:00Z');
    const righe = righeDellaVersione([storia({ versione: '1.2.0', titolo: 'Vecchia' }), storia()], '1.3.0', adesso);
    assert.equal(righe.length, 1);
    assert.equal(righe[0].titolo, 'Una novita');
    assert.equal(righe[0].punti, JSON.stringify([{ icona: '⏱️', testo: 'Primo punto' }]));
    assert.equal(righe[0].ordine, 0);
    assert.equal(righe[0].attiva, true);
    assert.deepEqual(righe[0].creatoIl, adesso);
  });

  it('la prima del file e\' la piu\' recente, quindi la prima che si vede', () => {
    const righe = righeDellaVersione([storia({ titolo: 'Prima' }), storia({ titolo: 'Seconda' })], '1.3.0');
    assert.ok(righe[0].creatoIl > righe[1].creatoIl);
  });

  it('i campi assenti restano vuoti', () => {
    const [riga] = righeDellaVersione([{ versione: '1.3.0', titolo: 'Essenziale' }], '1.3.0');
    assert.equal(riga.punti, null);
    assert.equal(riga.ctaRotta, null);
  });
});

describe('stories in English', () => {
  const inglese = { titolo: 'News', sottotitolo: 'Sub', punti: [{ icona: '⏱️', testo: 'First point' }], ctaTesto: 'Go' };

  it('the English version must have a title and the same points as the story', () => {
    assert.deepEqual(problemiStorie([storia({ en: inglese })]), []);
    assert.equal(problemiStorie([storia({ en: { ...inglese, titolo: '' } })]).length, 1);
    assert.equal(problemiStorie([storia({ en: { ...inglese, punti: [] } })]).length, 1);
  });

  it('goes into the table with the story', () => {
    const [riga] = righeDellaVersione([storia({ en: inglese })], '1.3.0');
    assert.deepEqual(JSON.parse(riga.traduzioni), { en: inglese });
    assert.equal(righeDellaVersione([storia()], '1.3.0')[0].traduzioni, null);
  });

  it('the app gets the texts of its language, otherwise the base ones', () => {
    const [riga] = righeDellaVersione([storia({ en: inglese })], '1.3.0');
    const inEn = storiaInLingua(riga, 'en');
    assert.equal(inEn.titolo, 'News');
    assert.equal(inEn.punti, JSON.stringify(inglese.punti));
    assert.equal(inEn.ctaRotta, riga.ctaRotta);
    assert.equal('traduzioni' in inEn, false);
    assert.equal(storiaInLingua(riga, 'it').titolo, 'Una novita');
    assert.equal(storiaInLingua({ titolo: 'Solo base', traduzioni: null }, 'en').titolo, 'Solo base');
    assert.equal(storiaInLingua({ titolo: 'Rotta', traduzioni: '{non json' }, 'en').titolo, 'Rotta');
  });
});
