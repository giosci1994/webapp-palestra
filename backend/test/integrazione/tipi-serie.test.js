// Serie di riscaldamento e drop (utils/tipiSerie.js): si registrano e si
// vedono, ma il riscaldamento resta fuori da volume, conteggi, record e
// progressione, e un drop conta solo nel volume.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, giorniFa, MINUTO } from '../supporto/dati.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
  scheda = await creaScheda(utente, [panca]);
});

const chiedi = (metodo, percorso, corpo) => server.richiesta(metodo, percorso, { token: tokenPer(utente), corpo });
/** Riscaldamento 40×10 e 60×5, poi 80×8 con un drop a 60×6, poi 80×7 */
const serieTipiche = () => [
  { esercizio: panca, peso: 40, rep: 10, tipo: 'RISCALDAMENTO', serieNumero: 1 },
  { esercizio: panca, peso: 60, rep: 5, tipo: 'RISCALDAMENTO', serieNumero: 2 },
  { esercizio: panca, peso: 80, rep: 8, serieNumero: 1 },
  { esercizio: panca, peso: 60, rep: 6, tipo: 'DROP', serieNumero: 1 },
  { esercizio: panca, peso: 80, rep: 7, serieNumero: 2 }
];
const VOLUME_TIPICO = 80 * 8 + 60 * 6 + 80 * 7;

describe('registrare serie di riscaldamento e drop', () => {
  it('il tipo arriva con la serie; senza tipo e\' di lavoro', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 20 * MINUTO), conclusa: false });
    for (const [tipo, atteso] of [['RISCALDAMENTO', 'RISCALDAMENTO'], ['DROP', 'DROP'], [undefined, 'LAVORO']]) {
      const risposta = await chiedi('POST', `/sessioni/${sessione.id}/serie`, {
        esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 50, repEffettive: 10, tipo
      });
      assert.equal(risposta.stato, 201);
      assert.equal(risposta.corpo.dati.tipo, atteso);
    }
  });

  it('rifiuta un tipo che non esiste', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 20 * MINUTO), conclusa: false });
    const risposta = await chiedi('POST', `/sessioni/${sessione.id}/serie`, {
      esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 50, repEffettive: 10, tipo: 'SUPERSERIE'
    });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'tipo di serie non valido');
  });
});

describe('alla chiusura', () => {
  it('il volume conta lavoro e drop, non il riscaldamento', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 40 * MINUTO), conclusa: false, serie: serieTipiche()
    });
    const risposta = await chiedi('PATCH', `/sessioni/${sessione.id}/completa`, {});
    assert.equal(risposta.corpo.dati.volumeTotaleKg, VOLUME_TIPICO);
  });

  it('i record vengono solo dalle serie di lavoro', async () => {
    // Un riscaldamento piu' pesante del lavoro non capita, ma se capita non e' un record
    const sessione = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 40 * MINUTO),
      conclusa: false,
      serie: [
        { esercizio: panca, peso: 100, rep: 1, tipo: 'RISCALDAMENTO', serieNumero: 1 },
        { esercizio: panca, peso: 80, rep: 8, serieNumero: 1 },
        { esercizio: panca, peso: 90, rep: 3, tipo: 'DROP', serieNumero: 1 }
      ]
    });
    const risposta = await chiedi('PATCH', `/sessioni/${sessione.id}/completa`, {});
    assert.deepEqual(risposta.corpo.recordPersonali.map(r => r.pesoMaxRaggiunto), [80]);
  });
});

describe('storico', () => {
  it('riscaldamento prima, ogni serie con i suoi drop, e il conto delle serie e\' quello di lavoro', async () => {
    // Registrate in un ordine qualsiasi: lo storico le rimette in fila
    const tipiche = serieTipiche();
    const ordineArrivo = [tipiche[2], tipiche[0], tipiche[4], tipiche[3], tipiche[1]];
    await creaSessione(utente, scheda, { inizio: giorniFa(1), serie: ordineArrivo });

    const risposta = await chiedi('GET', '/sessioni/storico');
    const [sessione] = risposta.corpo.dati.sessioni ?? risposta.corpo.dati;
    assert.equal(sessione.serieCompletate, 2);
    assert.deepEqual(
      sessione.esercizi[0].serie.map(s => `${s.tipo} ${s.serieNumero} ${s.pesoEffettivo}`),
      ['RISCALDAMENTO 1 40', 'RISCALDAMENTO 2 60', 'LAVORO 1 80', 'DROP 1 60', 'LAVORO 2 80']
    );
  });
});

describe("l'ultima volta e la progressione", () => {
  it('vedono solo le serie di lavoro', async () => {
    await creaSessione(utente, scheda, { inizio: giorniFa(2), serie: serieTipiche() });
    const risposta = await chiedi('GET', `/sessioni/ultimi-carichi?esercizi=${panca.id}`);
    assert.deepEqual(
      risposta.corpo.dati[panca.id].serie.map(s => [s.serieNumero, s.pesoEffettivo, s.repEffettive]),
      [[1, 80, 8], [2, 80, 7]]
    );
  });
});

describe('statistiche', () => {
  it('le serie per muscolo e i massimali contano solo il lavoro', async () => {
    await creaSessione(utente, scheda, { inizio: giorniFa(2), serie: serieTipiche() });
    const risposta = await chiedi('GET', '/statistiche/muscoli?giorni=30');
    const petto = risposta.corpo.dati.gruppi.find(g => g.nome === 'Petto');
    assert.equal(petto.seriePeriodo, 2);
    assert.equal(risposta.corpo.dati.esercizi[panca.id].serie, 2);
  });
});

describe('correggere il tipo dallo storico', () => {
  it('una serie segnata di lavoro che era un riscaldamento: volume, numeri e record si sistemano', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: giorniFa(1),
      serie: [{ esercizio: panca, peso: 60, rep: 10 }, { esercizio: panca, peso: 80, rep: 8 }, { esercizio: panca, peso: 80, rep: 8 }]
    });
    const [prima, seconda, terza] = sessione.logSerie;

    const risposta = await chiedi('PATCH', `/sessioni/${sessione.id}`, {
      serie: [{ id: prima.id, tipo: 'RISCALDAMENTO' }, { id: seconda.id }, { id: terza.id }]
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.volumeTotaleKg, 2 * 80 * 8);
    assert.deepEqual(
      risposta.corpo.dati.esercizi[0].serie.map(s => `${s.tipo} ${s.serieNumero}`),
      ['RISCALDAMENTO 1', 'LAVORO 1', 'LAVORO 2']
    );
  });

  it('un drop aggiunto dallo storico prende il numero della serie prima', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: giorniFa(1), serie: [{ esercizio: panca, peso: 80, rep: 8 }, { esercizio: panca, peso: 80, rep: 7 }]
    });
    const [prima, seconda] = sessione.logSerie;
    const risposta = await chiedi('PATCH', `/sessioni/${sessione.id}`, {
      serie: [
        { id: prima.id },
        { esercizioId: panca.id, tipo: 'DROP', pesoEffettivo: 60, repEffettive: 6 },
        { id: seconda.id }
      ]
    });
    assert.equal(risposta.stato, 200);
    assert.deepEqual(
      risposta.corpo.dati.esercizi[0].serie.map(s => `${s.tipo} ${s.serieNumero}`),
      ['LAVORO 1', 'DROP 1', 'LAVORO 2']
    );
    assert.equal(risposta.corpo.dati.volumeTotaleKg, 80 * 8 + 60 * 6 + 80 * 7);
  });

  it('rifiuta un tipo che non esiste', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: giorniFa(1), serie: [{ esercizio: panca, peso: 80, rep: 8 }] });
    const risposta = await chiedi('PATCH', `/sessioni/${sessione.id}`, {
      serie: [{ id: sessione.logSerie[0].id, tipo: 'BOH' }]
    });
    assert.equal(risposta.stato, 400);
    assert.equal(risposta.corpo.messaggio, 'Serie 1: tipo di serie non valido');
  });
});

describe('allenamento passato e scheda da un allenamento', () => {
  it("un allenamento passato porta i tipi: il volume salta il riscaldamento", async () => {
    const risposta = await chiedi('POST', '/sessioni/passata', {
      schedaId: scheda.id,
      dataInizio: giorniFa(1).toISOString(),
      durataMinuti: 45,
      serie: serieTipiche().map(({ esercizio, peso, rep, ...altro }) => ({
        esercizioId: esercizio.id, pesoEffettivo: peso, repEffettive: rep, ...altro
      }))
    });
    assert.equal(risposta.stato, 201);
    assert.equal(risposta.corpo.dati.volumeTotaleKg, VOLUME_TIPICO);
    const tipi = await prisma.logSerie.groupBy({ by: ['tipo'], where: { sessioneId: risposta.corpo.dati.id }, _count: true });
    assert.deepEqual(Object.fromEntries(tipi.map(t => [t.tipo, t._count])), { RISCALDAMENTO: 2, LAVORO: 2, DROP: 1 });
  });

  it('salvato come scheda, tiene le serie di lavoro', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: giorniFa(1), serie: serieTipiche() });
    const risposta = await chiedi('POST', `/sessioni/${sessione.id}/scheda`, {});
    assert.equal(risposta.stato, 201);
    const [esercizio] = await prisma.esercizioScheda.findMany({ where: { schedaId: risposta.corpo.dati.id } });
    assert.deepEqual([esercizio.serieTarget, esercizio.repTarget], [2, '7-8']);
  });
});
