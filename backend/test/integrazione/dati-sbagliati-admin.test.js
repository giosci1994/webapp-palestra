// The admin area sent wrong data: a text where a number goes, an object where
// a text goes, a category that does not exist, an exercise still in use. The
// answer is a client error in the user's language, nothing is saved, and the
// same requests with right data work as before.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, creaScheda, creaSessione, creaRecord, tokenPer } from '../supporto/dati.js';

// The banner is a file of the repository: the test puts it back as it was
const FILE_BANNER = path.resolve('prisma/dati/banner.json');
const bannerOriginale = fs.readFileSync(FILE_BANNER, 'utf8');

let server;
let admin;

before(async () => { server = await avviaServer(); });
after(async () => {
  fs.writeFileSync(FILE_BANNER, bannerOriginale, 'utf8');
  await server.chiudi();
});
beforeEach(async () => {
  await svuotaDatabase();
  admin = await creaUtente({ ruolo: 'SUPERADMIN' });
});

const comeAdmin = (metodo, percorso, corpo, lingua) => server.richiesta(metodo, percorso, { token: tokenPer(admin), corpo, lingua });

/** The answer is a 400 about the given field, in Italian */
function assertCampoNonValido(risposta, campo, nota = campo) {
  assert.equal(risposta.stato, 400, nota);
  assert.equal(risposta.corpo.messaggio, 'Dati della richiesta non validi', nota);
  assert.ok(risposta.corpo.dettagli.some(d => d.campo === campo), `${nota}: ${JSON.stringify(risposta.corpo.dettagli)}`);
}

describe('gyms', () => {
  const valida = { nomeCatena: 'FitClub', citta: 'Roma', indirizzo: 'Via 1' };

  it('creating: a wrong field is a 400 in the right language and nothing is saved', async () => {
    for (const [campo, valore] of [
      ['nomeCatena', { x: 1 }], ['nomeCatena', 99999], ['citta', ['a']], ['indirizzo', -5], ['nazione', { x: 1 }],
      ['googlePlaceId', 5], ['nomeCatena', ''], ['citta', '   '], ['nomeCatena', 'x'.repeat(500)]
    ]) {
      assertCampoNonValido(await comeAdmin('POST', '/admin/palestre', { ...valida, [campo]: valore }), campo, `${campo} = ${JSON.stringify(valore).slice(0, 20)}`);
    }
    const mancante = await comeAdmin('POST', '/admin/palestre', { citta: 'Roma', indirizzo: 'Via 1' });
    assertCampoNonValido(mancante, 'nomeCatena');
    assert.equal(mancante.corpo.dettagli[0].messaggio, 'Campo obbligatorio');

    const inglese = await comeAdmin('POST', '/admin/palestre', { ...valida, nomeCatena: { x: 1 } }, 'en');
    assert.equal(inglese.stato, 400);
    assert.equal(inglese.corpo.messaggio, 'Invalid request data');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'This field must be a text');

    assert.equal((await comeAdmin('POST', '/admin/palestre', [])).stato, 400);
    assert.equal(await prisma.palestra.count(), 0);
  });

  it('creating with null or empty optional fields works as before', async () => {
    const risposta = await comeAdmin('POST', '/admin/palestre', { ...valida, nazione: '', googlePlaceId: null });
    assert.equal(risposta.stato, 201);
    assert.deepEqual([risposta.corpo.dati.nazione, risposta.corpo.dati.googlePlaceId], ['Italia', null]);
  });

  it('updating: a wrong field is a 400 and the gym stays as it was', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/palestre', { ...valida, googlePlaceId: 'ChIJ1' })).corpo;
    for (const [campo, valore] of [
      ['nomeCatena', { x: 1 }], ['nomeCatena', null], ['nomeCatena', ''], ['citta', 99999], ['indirizzo', ['a']],
      ['nazione', -5], ['nazione', null], ['googlePlaceId', { x: 1 }]
    ]) {
      assertCampoNonValido(await comeAdmin('PUT', `/admin/palestre/${dati.id}`, { [campo]: valore }), campo, `${campo} = ${JSON.stringify(valore)}`);
    }
    const salvata = await prisma.palestra.findUnique({ where: { id: dati.id } });
    assert.deepEqual([salvata.nomeCatena, salvata.citta, salvata.indirizzo, salvata.nazione, salvata.googlePlaceId], ['FitClub', 'Roma', 'Via 1', 'Italia', 'ChIJ1']);
  });

  it('updating with right data works as before: the form, a clear, a missing gym', async () => {
    const { dati } = (await comeAdmin('POST', '/admin/palestre', { ...valida, googlePlaceId: 'ChIJ1' })).corpo;
    const modulo = await comeAdmin('PUT', `/admin/palestre/${dati.id}`, {
      nomeCatena: 'Altra', citta: 'Milano', indirizzo: 'Via 2', nazione: 'Svizzera', googlePlaceId: ''
    });
    assert.equal(modulo.stato, 200);
    assert.deepEqual(
      [modulo.corpo.dati.nomeCatena, modulo.corpo.dati.citta, modulo.corpo.dati.indirizzo, modulo.corpo.dati.nazione, modulo.corpo.dati.googlePlaceId],
      ['Altra', 'Milano', 'Via 2', 'Svizzera', null]
    );
    assert.equal((await comeAdmin('PUT', `/admin/palestre/${dati.id}`, { googlePlaceId: null })).stato, 200);
    assert.equal((await comeAdmin('PUT', `/admin/palestre/${dati.id}`, {})).stato, 200);
    assert.equal((await comeAdmin('PUT', '/admin/palestre/99999', { citta: 'X' })).stato, 404);
  });
});

describe('deleting an exercise', () => {
  it('in a plan: 409 saying so, in both languages, and the exercise stays', async () => {
    const esercizio = await creaEsercizio();
    const altro = await creaEsercizio();
    await creaScheda(admin, [esercizio, altro]);
    await creaScheda(admin, [esercizio]);

    const risposta = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`);
    assert.equal(risposta.stato, 409);
    assert.equal(risposta.corpo.messaggio, 'Questo esercizio è in uso e non può essere eliminato: è presente in 2 schede.');

    const inglese = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`, undefined, 'en');
    assert.equal(inglese.stato, 409);
    assert.equal(inglese.corpo.messaggio, 'This exercise is in use and cannot be deleted: it appears in 2 workout plans.');
    assert.equal(await prisma.esercizio.count(), 2);
  });

  it('in a logged workout or a personal record: 409, with every place where it is used', async () => {
    const esercizio = await creaEsercizio();
    const altro = await creaEsercizio();
    const scheda = await creaScheda(admin, [altro]);
    await creaSessione(admin, scheda, { serie: [{ esercizio, peso: 50, rep: 10 }, { esercizio, peso: 55, rep: 8 }] });

    const soloSerie = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`);
    assert.equal(soloSerie.stato, 409);
    assert.match(soloSerie.corpo.messaggio, /è presente in 2 serie registrate\.$/);

    await creaRecord(admin, esercizio, 55);
    await prisma.esercizioScheda.create({ data: { schedaId: scheda.id, esercizioId: esercizio.id, serieTarget: 3, repTarget: '8', ordineEsecuzione: 2 } });
    const tutto = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`, undefined, 'en');
    assert.equal(tutto.stato, 409);
    assert.equal(tutto.corpo.messaggio, 'This exercise is in use and cannot be deleted: it appears in 1 workout plan, 2 logged sets and 1 personal record.');
    assert.equal(await prisma.esercizio.count(), 2);
  });

  it('not used any more, or only a favourite or a suggestion: it is deleted as before', async () => {
    const esercizio = await creaEsercizio();
    await prisma.esercizioPreferito.create({ data: { utenteId: admin.id, esercizioId: esercizio.id } });
    const suggerimento = await prisma.suggerimentoEsercizio.create({
      data: { utenteId: admin.id, nome: 'S', gruppoMuscoloPrimario: 'Petto', stato: 'APPROVATO', esercizioCreato: esercizio.id }
    });
    const risposta = await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Esercizio eliminato');
    assert.equal(await prisma.esercizio.count(), 0);
    assert.equal((await prisma.suggerimentoEsercizio.findUnique({ where: { id: suggerimento.id } })).esercizioCreato, null);
    assert.equal((await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`)).stato, 404);
  });

  it('after the plan is gone it can be deleted', async () => {
    const esercizio = await creaEsercizio();
    const scheda = await creaScheda(admin, [esercizio]);
    assert.equal((await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`)).stato, 409);
    await prisma.schedaAllenamento.delete({ where: { id: scheda.id } });
    assert.equal((await comeAdmin('DELETE', `/admin/esercizi/${esercizio.id}`)).stato, 200);
  });
});

describe('equipment', () => {
  it('a category that does not exist, a missing name or a wrong type is a 400 and nothing is saved', async () => {
    for (const [campo, valore] of [
      ['categoria', 'abc'], ['categoria', { x: 1 }], ['categoria', 5], ['categoria', null], ['categoria', 'cardio'],
      ['nome', { x: 1 }], ['nome', 99999], ['nome', ''], ['muscoliBersaglio', { x: 1 }], ['muscoliBersaglio', ['a']]
    ]) {
      const corpo = { nome: 'Leg press', categoria: 'MACCHINE', [campo]: valore };
      assertCampoNonValido(await comeAdmin('POST', '/admin/attrezzature', corpo), campo, `${campo} = ${JSON.stringify(valore)}`);
    }
    const senzaCategoria = await comeAdmin('POST', '/admin/attrezzature', { nome: 'Leg press' }, 'en');
    assert.equal(senzaCategoria.stato, 400);
    assert.equal(senzaCategoria.corpo.dettagli[0].messaggio, 'Category is required and must be one of: CARDIO, PESI_LIBERI, MACCHINE, CAVI, FUNZIONALE');
    const inItaliano = await comeAdmin('POST', '/admin/attrezzature', { nome: 'Leg press', categoria: 'abc' });
    assert.equal(inItaliano.corpo.dettagli[0].messaggio, 'La categoria è obbligatoria e deve essere una tra: CARDIO, PESI_LIBERI, MACCHINE, CAVI, FUNZIONALE');
    assert.equal(await prisma.attrezzatura.count(), 0);
  });

  it('every category and an empty target muscles still work', async () => {
    for (const categoria of ['CARDIO', 'PESI_LIBERI', 'MACCHINE', 'CAVI', 'FUNZIONALE']) {
      const risposta = await comeAdmin('POST', '/admin/attrezzature', { nome: categoria, categoria, muscoliBersaglio: '' });
      assert.equal(risposta.stato, 201);
      assert.deepEqual([risposta.corpo.dati.categoria, risposta.corpo.dati.muscoliBersaglio], [categoria, null]);
    }
  });
});

describe('suggestions', () => {
  it('a status that does not exist in the filter is a 400', async () => {
    const utente = await creaUtente();
    await prisma.suggerimentoEsercizio.create({ data: { utenteId: utente.id, nome: 'S', gruppoMuscoloPrimario: 'Petto' } });
    for (const query of ['?stato=abc', '?stato=in_attesa', '?stato=IN_ATTESA&stato=RIFIUTATO', '?stato[x]=1']) {
      assertCampoNonValido(await comeAdmin('GET', `/admin/suggerimenti${query}`), 'stato', query);
    }
    const inglese = await comeAdmin('GET', '/admin/suggerimenti?stato=abc', undefined, 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'Status must be one of: IN_ATTESA, APPROVATO, RIFIUTATO');
  });

  it('with no status, an empty one or a right one, and other query parameters, it lists as before', async () => {
    const utente = await creaUtente();
    await prisma.suggerimentoEsercizio.create({ data: { utenteId: utente.id, nome: 'In attesa', gruppoMuscoloPrimario: 'Petto' } });
    await prisma.suggerimentoEsercizio.create({ data: { utenteId: utente.id, nome: 'Rifiutato', gruppoMuscoloPrimario: 'Petto', stato: 'RIFIUTATO' } });
    const nomi = async query => (await comeAdmin('GET', `/admin/suggerimenti${query}`)).corpo.dati.map(s => s.nome);
    assert.deepEqual(await nomi(''), ['In attesa', 'Rifiutato']);
    assert.deepEqual(await nomi('?stato='), ['In attesa', 'Rifiutato']);
    assert.deepEqual(await nomi('?pagina=abc'), ['In attesa', 'Rifiutato']);
    assert.deepEqual(await nomi('?stato=RIFIUTATO'), ['Rifiutato']);
  });

  describe('handling', () => {
    let suggerimento;
    beforeEach(async () => {
      const utente = await creaUtente();
      suggerimento = await prisma.suggerimentoEsercizio.create({
        data: { utenteId: utente.id, nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei', descrizione: 'Spinta' }
      });
    });
    const approva = corpo => comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/approva`, corpo);
    const statoSalvato = async () => (await prisma.suggerimentoEsercizio.findUnique({ where: { id: suggerimento.id } })).stato;

    it('approving with a wrong field is a 400: the suggestion is still waiting and no exercise is made', async () => {
      for (const [campo, valore] of [
        ['nome', { x: 1 }], ['nome', 99999], ['gruppoMuscoloPrimario', ['a']], ['gruppoMuscoloSecondario', -5],
        ['descrizione', { x: 1 }], ['linkVideo', 5], ['attrezzaturaRichiestaId', 'abc'], ['attrezzaturaRichiestaId', { x: 1 }],
        ['attrezzaturaRichiestaId', -5], ['attrezzaturaRichiestaId', 1.5], ['attrezzaturaRichiestaId', ['a']], ['attrezzaturaRichiestaId', 99999999999]
      ]) {
        assertCampoNonValido(await approva({ [campo]: valore }), campo, `${campo} = ${JSON.stringify(valore)}`);
      }
      assert.equal(await statoSalvato(), 'IN_ATTESA');
      assert.equal(await prisma.esercizio.count(), 0);
    });

    it('approving with an equipment that does not exist is a 400 and nothing is made', async () => {
      const risposta = await approva({ attrezzaturaRichiestaId: 99999 });
      assert.equal(risposta.stato, 400);
      assert.equal(risposta.corpo.messaggio, 'Attrezzatura non trovata');
      const inglese = await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/approva`, { attrezzaturaRichiestaId: '99999' }, 'en');
      assert.equal(inglese.corpo.messaggio, 'Equipment not found');
      assert.equal(await statoSalvato(), 'IN_ATTESA');
      assert.equal(await prisma.esercizio.count(), 0);
    });

    it('approving as the app does works: empty texts, null, the equipment as a text or a number', async () => {
      const attrezzatura = await prisma.attrezzatura.create({ data: { nome: 'Panca', categoria: 'PESI_LIBERI' } });
      const risposta = await approva({
        nome: 'Hip thrust', gruppoMuscoloPrimario: 'Glutei', gruppoMuscoloSecondario: null,
        attrezzaturaRichiestaId: String(attrezzatura.id), descrizione: 'Spinta', linkVideo: ''
      });
      assert.equal(risposta.stato, 200);
      assert.deepEqual(
        [risposta.corpo.dati.attrezzaturaRichiestaId, risposta.corpo.dati.gruppoMuscoloSecondario, risposta.corpo.dati.linkVideo],
        [attrezzatura.id, null, null]
      );
      assert.equal(await statoSalvato(), 'APPROVATO');

      const altro = await prisma.suggerimentoEsercizio.create({ data: { utenteId: suggerimento.utenteId, nome: 'Altro', gruppoMuscoloPrimario: 'Petto' } });
      const conNumero = await comeAdmin('PATCH', `/admin/suggerimenti/${altro.id}/approva`, { attrezzaturaRichiestaId: attrezzatura.id });
      assert.equal(conNumero.corpo.dati.attrezzaturaRichiestaId, attrezzatura.id);
      const senza = await prisma.suggerimentoEsercizio.create({ data: { utenteId: suggerimento.utenteId, nome: 'Senza', gruppoMuscoloPrimario: 'Petto' } });
      const nessuna = await comeAdmin('PATCH', `/admin/suggerimenti/${senza.id}/approva`, { attrezzaturaRichiestaId: '' });
      assert.equal(nessuna.corpo.dati.attrezzaturaRichiestaId, null);
    });

    it('rejecting with a reason that is not a text is a 400 and the suggestion keeps waiting', async () => {
      for (const valore of [{ x: 1 }, 5, ['a'], 'x'.repeat(2000)]) {
        assertCampoNonValido(await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/rifiuta`, { motivoRifiuto: valore }), 'motivoRifiuto');
      }
      assert.equal(await statoSalvato(), 'IN_ATTESA');
      const buono = await comeAdmin('PATCH', `/admin/suggerimenti/${suggerimento.id}/rifiuta`, { motivoRifiuto: '' });
      assert.equal(buono.stato, 200);
      assert.equal(await statoSalvato(), 'RIFIUTATO');
    });
  });
});

describe('banner', () => {
  it('a text that is not a text, or a flag that is not a flag, is a 400 and the file does not change', async () => {
    for (const corpo of [{ testo: { x: 1 } }, { testo: 99999 }, { testo: ['a'] }, { visibile: 'abc' }, { visibile: { x: 1 } }, { visibile: 5 }]) {
      assert.equal((await comeAdmin('PUT', '/admin/banner', corpo)).stato, 400, JSON.stringify(corpo));
    }
    assert.equal(fs.readFileSync(FILE_BANNER, 'utf8'), bannerOriginale);
  });

  it('the app\'s request works: a boolean and a text, even empty', async () => {
    assert.deepEqual((await comeAdmin('PUT', '/admin/banner', { visibile: true, testo: 'Chiusi' })).corpo.dati, { visibile: true, testo: 'Chiusi' });
    assert.deepEqual((await comeAdmin('PUT', '/admin/banner', { visibile: false, testo: '' })).corpo.dati, { visibile: false, testo: '' });
  });
});

describe('"what\'s new" stories', () => {
  const corpoValido = { titolo: 'Notifiche', sottotitolo: 'Sotto', punti: [{ icona: '⏱️', testo: 'Uno' }], ordine: 3 };

  it('creating: an order that is not a number is a 400 and nothing is saved', async () => {
    for (const ordine of ['abc', { x: 1 }, ['a'], 1.5, 99999999999, '9999999999']) {
      assertCampoNonValido(await comeAdmin('POST', '/admin/novita', { ...corpoValido, ordine }), 'ordine', JSON.stringify(ordine));
    }
    const inglese = await comeAdmin('POST', '/admin/novita', { ...corpoValido, ordine: 'abc' }, 'en');
    assert.equal(inglese.corpo.dettagli[0].messaggio, 'Order must be a whole number');
    assert.equal(await prisma.novita.count(), 0);
  });

  it('creating: any other wrong field is a 400 too', async () => {
    for (const [campo, valore] of [
      ['titolo', { x: 1 }], ['titolo', 99999], ['sottotitolo', ['a']], ['icona', { x: 1 }], ['ctaRotta', 5], ['coloreInizio', { x: 1 }],
      ['punti', 'abc'], ['punti', { x: 1 }], ['punti', 99999], ['punti', ['a']], ['punti', [{ testo: { x: 1 } }]], ['punti', '{"a":1}'],
      ['attiva', 'abc'], ['attiva', { x: 1 }], ['attiva', -5]
    ]) {
      assertCampoNonValido(await comeAdmin('POST', '/admin/novita', { ...corpoValido, [campo]: valore }), campo, `${campo} = ${JSON.stringify(valore)}`);
    }
    assert.equal(await prisma.novita.count(), 0);
  });

  it('creating: the title is still required, with its own message', async () => {
    for (const corpo of [{}, { titolo: '' }, { titolo: null }, { titolo: '   ' }]) {
      const risposta = await comeAdmin('POST', '/admin/novita', corpo);
      assert.equal(risposta.stato, 400, JSON.stringify(corpo));
      assert.equal(risposta.corpo.messaggio, 'Titolo obbligatorio');
    }
    assert.equal((await comeAdmin('POST', '/admin/novita', {}, 'en')).corpo.messaggio, 'Title is required');
  });

  it('creating as the app does works: an empty order, a numeric text, the points as a list or as JSON, nulls', async () => {
    const dellApp = await comeAdmin('POST', '/admin/novita', {
      titolo: 'Dell\'app', sottotitolo: '', icona: '✨', punti: [{ icona: '', testo: 'Uno' }], ctaTesto: '', ctaRotta: '',
      coloreInizio: '#8b5cf6', coloreFine: '#06b6d4', attiva: true, ordine: 0
    });
    assert.equal(dellApp.stato, 201);
    assert.deepEqual([dellApp.corpo.dati.sottotitolo, dellApp.corpo.dati.ctaRotta, dellApp.corpo.dati.ordine], [null, null, 0]);

    for (const [ordine, atteso] of [[null, 0], ['2', 2], ['-3', -3], [7, 7]]) {
      const risposta = await comeAdmin('POST', '/admin/novita', { titolo: `Ordine ${ordine}`, ordine, punti: null, sottotitolo: null });
      assert.equal(risposta.stato, 201, String(ordine));
      assert.equal(risposta.corpo.dati.ordine, atteso);
    }
    const comeTesto = await comeAdmin('POST', '/admin/novita', { titolo: 'JSON', punti: '[{"testo":"Uno"}]' });
    assert.equal(comeTesto.corpo.dati.punti, '[{"testo":"Uno"}]');
    const vuoti = await comeAdmin('POST', '/admin/novita', { titolo: 'Vuoti', punti: '' });
    assert.equal(vuoti.corpo.dati.punti, null);
  });

  describe('updating', () => {
    let novita;
    beforeEach(async () => {
      novita = (await comeAdmin('POST', '/admin/novita', corpoValido)).corpo.dati;
    });
    const modifica = corpo => comeAdmin('PUT', `/admin/novita/${novita.id}`, corpo);

    it('a wrong field is a 400 and the story stays as it was', async () => {
      for (const [campo, valore] of [
        ['titolo', { x: 1 }], ['titolo', null], ['titolo', ''], ['titolo', 99999], ['sottotitolo', { x: 1 }], ['icona', ['a']],
        ['ctaTesto', 5], ['coloreFine', { x: 1 }], ['punti', 'abc'], ['punti', { x: 1 }], ['punti', -5], ['punti', ['a']],
        ['attiva', 'abc'], ['attiva', { x: 1 }], ['attiva', 99999], ['ordine', 99999999999], ['ordine', '9999999999']
      ]) {
        assertCampoNonValido(await modifica({ [campo]: valore }), campo, `${campo} = ${JSON.stringify(valore)}`);
      }
      const salvata = await prisma.novita.findUnique({ where: { id: novita.id } });
      assert.deepEqual(
        [salvata.titolo, salvata.sottotitolo, salvata.attiva, salvata.ordine, JSON.parse(salvata.punti)],
        ['Notifiche', 'Sotto', true, 3, corpoValido.punti]
      );
      const inglese = await comeAdmin('PUT', `/admin/novita/${novita.id}`, { titolo: { x: 1 } }, 'en');
      assert.equal(inglese.corpo.messaggio, 'Invalid request data');
      assert.equal(inglese.corpo.dettagli[0].messaggio, 'This field must be a text');
    });

    it('right data works as before: the toggle, the whole form, a clear, a wrong order that becomes 0', async () => {
      const spenta = await modifica({ attiva: false });
      assert.equal(spenta.stato, 200);
      assert.deepEqual([spenta.corpo.dati.attiva, spenta.corpo.dati.titolo, spenta.corpo.dati.ordine], [false, 'Notifiche', 3]);

      const modulo = await modifica({
        titolo: 'Avvisi', sottotitolo: '', icona: '🔔', punti: [{ icona: '', testo: 'Due' }], ctaTesto: 'Vai', ctaRotta: '/profilo',
        coloreInizio: '#000000', coloreFine: '#ffffff', attiva: true, ordine: 5
      });
      assert.equal(modulo.stato, 200);
      const n = modulo.corpo.dati;
      assert.deepEqual([n.titolo, n.sottotitolo, n.ctaRotta, n.attiva, n.ordine, JSON.parse(n.punti)], ['Avvisi', null, '/profilo', true, 5, [{ icona: '', testo: 'Due' }]]);

      const pulita = await modifica({ sottotitolo: null, punti: null, ctaRotta: null });
      assert.deepEqual([pulita.corpo.dati.sottotitolo, pulita.corpo.dati.punti, pulita.corpo.dati.ctaRotta], [null, null, null]);

      // A garbled order has always become 0 on update
      assert.equal((await modifica({ ordine: 'x' })).corpo.dati.ordine, 0);
      assert.equal((await modifica({ ordine: { x: 1 } })).corpo.dati.ordine, 0);
      assert.equal((await modifica({ ordine: { toString: 1 } })).stato, 400);
      assert.equal((await modifica({ ordine: '4' })).corpo.dati.ordine, 4);
      assert.equal((await modifica({})).stato, 200);
      assert.equal((await comeAdmin('PUT', '/admin/novita/99999', { titolo: 'X' })).stato, 404);
    });
  });
});

describe('who gets in is unchanged', () => {
  it('a user is still refused before the data is looked at', async () => {
    const utente = await creaUtente();
    const risposta = await server.richiesta('POST', '/admin/palestre', { token: tokenPer(utente), corpo: { nomeCatena: { x: 1 } } });
    assert.equal(risposta.stato, 403);
  });
});
