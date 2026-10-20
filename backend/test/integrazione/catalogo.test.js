// The catalogue: exercises with their filters, gyms, crowd levels and the
// best times to train, equipment.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaEsercizio, tokenPer, MINUTO } from '../supporto/dati.js';
import { FUSO_ORARIO, orarioLocale } from '../../src/utils/date.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
});

const leggi = (percorso, opzioni = {}) => server.richiesta('GET', percorso, { token: tokenPer(utente), ...opzioni });
const creaPalestra = (dati = {}) => prisma.palestra.create({ data: { nomeCatena: 'FitClub', citta: 'Copenaghen', indirizzo: 'Via 1', ...dati } });

describe('exercise list', () => {
  let bilanciere;
  let panca;
  beforeEach(async () => {
    bilanciere = await prisma.attrezzatura.create({ data: { nome: 'Bilanciere', categoria: 'PESI_LIBERI' } });
    panca = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana', attrezzaturaRichiestaId: bilanciere.id, difficulty: 'Intermedio' });
    await creaEsercizio({ nome: 'Push-up', bodyRegion: 'Parte Superiore' });
    await creaEsercizio({ nome: 'Back Squat', nomeIt: 'Squat', gruppoMuscoloPrimario: 'Quadricipiti', mechanics: 'Composto' });
    await creaEsercizio({ nome: 'Croci ai cavi', mechanics: 'Isolamento' });
  });
  const nomi = risposta => risposta.corpo.dati.map(e => e.nomeIt || e.nome);

  it('needs to be signed in', async () => {
    assert.equal((await server.richiesta('GET', '/esercizi')).stato, 401);
  });

  it('by group, then by the name shown, with the equipment', async () => {
    const risposta = await leggi('/esercizi');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(nomi(risposta), ['Croci ai cavi', 'Panca piana', 'Push-up', 'Squat']);
    const conAttrezzo = risposta.corpo.dati.find(e => e.id === panca.id);
    assert.deepEqual(conAttrezzo.attrezzatura, { id: bilanciere.id, nome: 'Bilanciere', categoria: 'PESI_LIBERI' });
  });

  it('the search looks at both names, ignoring case', async () => {
    assert.deepEqual(nomi(await leggi('/esercizi?ricerca=panca')), ['Panca piana']);
    assert.deepEqual(nomi(await leggi('/esercizi?ricerca=BENCH')), ['Panca piana']);
    assert.deepEqual(nomi(await leggi('/esercizi?ricerca=squat')), ['Squat']);
    assert.deepEqual(nomi(await leggi('/esercizi?ricerca=nessuno')), []);
  });

  it('the filters, alone and together', async () => {
    assert.deepEqual(nomi(await leggi('/esercizi?gruppo=Petto')), ['Croci ai cavi', 'Panca piana', 'Push-up']);
    assert.deepEqual(nomi(await leggi(`/esercizi?attrezzaturaId=${bilanciere.id}`)), ['Panca piana']);
    assert.deepEqual(nomi(await leggi('/esercizi?bodyRegion=Parte%20Superiore')), ['Push-up']);
    assert.deepEqual(nomi(await leggi('/esercizi?difficulty=Intermedio')), ['Panca piana']);
    assert.deepEqual(nomi(await leggi('/esercizi?mechanics=Isolamento')), ['Croci ai cavi']);
    assert.deepEqual(nomi(await leggi('/esercizi?gruppo=Petto&mechanics=Composto')), []);
  });
});

describe('gyms', () => {
  it('anyone can read them, by country, city and name, with their equipment', async () => {
    const bike = await prisma.attrezzatura.create({ data: { nome: 'Bike', categoria: 'CARDIO' } });
    const roma = await creaPalestra({ nomeCatena: 'Zeta', citta: 'Roma' });
    await creaPalestra({ nomeCatena: 'Alfa', citta: 'Roma' });
    await creaPalestra({ nomeCatena: 'Beta', citta: 'Aarhus', nazione: 'Danimarca' });
    await prisma.palestraAttrezzatura.create({ data: { palestraId: roma.id, attrezzaturaId: bike.id } });

    const risposta = await server.richiesta('GET', '/palestre');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.map(p => p.nomeCatena), ['Beta', 'Alfa', 'Zeta']);
    const conAttrezzi = risposta.corpo.dati.find(p => p.id === roma.id);
    assert.deepEqual(conAttrezzi.attrezzature.map(a => a.attrezzatura), [{ id: bike.id, nome: 'Bike', categoria: 'CARDIO' }]);
  });

  it('equipment needs to be signed in, and comes by category, then name', async () => {
    assert.equal((await server.richiesta('GET', '/attrezzature')).stato, 401);
    await prisma.attrezzatura.createMany({ data: [
      { nome: 'Leg press', categoria: 'MACCHINE' }, { nome: 'Tapis roulant', categoria: 'CARDIO' },
      { nome: 'Bilanciere', categoria: 'PESI_LIBERI' }, { nome: 'Bike', categoria: 'CARDIO' }
    ] });
    const risposta = await leggi('/attrezzature');
    assert.deepEqual(risposta.corpo.dati.map(a => a.nome), ['Bike', 'Tapis roulant', 'Bilanciere', 'Leg press']);
  });
});

describe('crowd level now', () => {
  let palestra;
  beforeEach(async () => { palestra = await creaPalestra(); });

  /** The same level at every hour of the week: the answer does not depend on when the test runs */
  const settimana = (livello, altro = {}) => prisma.afluenzaPalestra.createMany({
    data: Array.from({ length: 7 * 24 }, (_, i) => ({
      palestraId: palestra.id, giornoSettimana: Math.floor(i / 24), ora: i % 24, livelloPercentuale: livello, ...altro
    }))
  });
  const affluenza = (opzioni) => server.richiesta('GET', `/palestre/${palestra.id}/affluenza`, opzioni);

  it('anyone can read it; the label and colour follow the level', async () => {
    for (const [livello, testo, colore] of [[20, 'Poco affollata', 'verde'], [50, 'Mediamente affollata', 'giallo'], [80, 'Molto affollata', 'rosso']]) {
      await prisma.afluenzaPalestra.deleteMany();
      await settimana(livello);
      const { stato, corpo } = await affluenza();
      assert.equal(stato, 200);
      assert.deepEqual([corpo.dati.livelloTesto, corpo.dati.livelloColore, corpo.dati.livelloPercentuale], [testo, colore, livello]);
      assert.equal(corpo.dati.graficoGiornata.length, 24);
    }
  });

  it('a live reading counts only if it is recent', async () => {
    await settimana(20, { liveLivello: 90, liveDescrizione: 'Più affollata del solito' });
    const fresca = (await affluenza()).corpo.dati;
    assert.equal(fresca.liveLivello, 90);
    assert.equal(fresca.liveDescrizione, 'Più affollata del solito');
    assert.equal(fresca.livelloColore, 'rosso');
    assert.ok(fresca.graficoGiornata.every(o => o.live === 90 && o.livello === 20));

    await prisma.afluenzaPalestra.updateMany({ data: { aggiornatoIl: new Date(Date.now() - 2 * 60 * MINUTO) } });
    const vecchia = (await affluenza()).corpo.dati;
    assert.equal(vecchia.liveLivello, null);
    assert.equal(vecchia.livelloColore, 'verde');
    assert.ok(vecchia.graficoGiornata.every(o => o.live === null));
  });

  it("it is the gym's day and hour, whatever the user's time zone", async () => {
    await settimana(20);
    const prima = orarioLocale(new Date(), FUSO_ORARIO);
    const { dati } = (await affluenza({ token: tokenPer(utente), fuso: 'Pacific/Auckland' })).corpo;
    const dopo = orarioLocale(new Date(), FUSO_ORARIO);
    assert.ok([prima, dopo].some(o => o.ora === dati.oraCorrente && o.giornoSettimana === dati.giornoSettimana));
  });

  it('without data it says so', async () => {
    const { dati } = (await affluenza()).corpo;
    assert.equal(dati.livelloTesto, 'Nessun dato');
    assert.equal(dati.livelloPercentuale, null);
    assert.deepEqual(dati.graficoGiornata, []);
  });
});

describe('best times to train', () => {
  let palestra;
  beforeEach(async () => {
    palestra = await creaPalestra();
    // 50% at every hour, except a few quiet moments
    const tranquille = { '2-7': 5, '4-8': 10, '2-20': 12, '0-3': 0, '6-23': 1 };
    await prisma.afluenzaPalestra.createMany({
      data: Array.from({ length: 7 * 24 }, (_, i) => {
        const [giornoSettimana, ora] = [Math.floor(i / 24), i % 24];
        return { palestraId: palestra.id, giornoSettimana, ora, livelloPercentuale: tranquille[`${giornoSettimana}-${ora}`] ?? 50 };
      })
    });
  });
  const migliori = query => server.richiesta('GET', `/palestre/${palestra.id}/affluenza/migliori-orari${query}`);

  it('from 6 to 22 by default: the quietest hours of the week, of each day, and the quietest day', async () => {
    const { stato, corpo } = await migliori('');
    assert.equal(stato, 200);
    const dati = corpo.dati;
    assert.equal(dati.disponibile, true);
    assert.deepEqual(dati.fascia, { da: 6, a: 22 });
    assert.equal(dati.rilevazioni, 7 * 17);
    assert.equal(dati.mediaGenerale, 49);
    assert.deepEqual(dati.migliori, [
      { giornoSettimana: 2, ora: 7, livello: 5 }, { giornoSettimana: 4, ora: 8, livello: 10 },
      { giornoSettimana: 2, ora: 20, livello: 12 }, { giornoSettimana: 0, ora: 6, livello: 50 },
      { giornoSettimana: 0, ora: 7, livello: 50 }
    ]);
    assert.equal(dati.perGiorno.length, 7);
    assert.deepEqual(dati.perGiorno[2], {
      giornoSettimana: 2, media: 45, migliori: [{ ora: 7, livello: 5 }, { ora: 20, livello: 12 }, { ora: 6, livello: 50 }]
    });
    assert.equal(dati.giornoPiuTranquillo, 2);
  });

  it('the window can be chosen, but not upside down', async () => {
    assert.deepEqual((await migliori('?da=1&a=5')).corpo.dati.migliori[0], { giornoSettimana: 0, ora: 3, livello: 0 });
    assert.deepEqual((await migliori('?da=20&a=23')).corpo.dati.migliori[0], { giornoSettimana: 6, ora: 23, livello: 1 });

    const rovesciata = await migliori('?da=20&a=8');
    assert.equal(rovesciata.stato, 400);
    assert.equal(rovesciata.corpo.errore, 'Fascia oraria rovesciata');
  });

  it('a gym without readings', async () => {
    const vuota = await creaPalestra();
    const { dati } = (await server.richiesta('GET', `/palestre/${vuota.id}/affluenza/migliori-orari`)).corpo;
    assert.deepEqual(dati, { disponibile: false, fascia: { da: 6, a: 22 }, perGiorno: [], migliori: [] });
  });
});
