// Deleting a set from the live workout (swipe left): DELETE
// /sessioni/:id/serie/:idClient. By the phone's key, idempotent, a working set
// with its drop sets, the following sets renumbered, volume and records
// realigned when the workout is already closed.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, creaRecord, MINUTO } from '../supporto/dati.js';

let server;
let utente;
let panca;
let rematore;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Panca piana' });
  rematore = await creaEsercizio({ nome: 'Rematore', gruppoMuscoloPrimario: 'Dorso' });
  scheda = await creaScheda(utente, [panca, rematore]);
});

const chiedi = (metodo, percorso, corpo, chi = utente) => server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo });
const id = n => `serie-prova-${String(n).padStart(4, '0')}`;
const elimina = (sessione, idClient, chi) => chiedi('DELETE', `/sessioni/${sessione.id}/serie/${idClient}`, undefined, chi);
/** The workout's sets as "esercizio:tipo:numero" in id order */
const righe = async sessione => (await prisma.logSerie.findMany({ where: { sessioneId: sessione.id }, orderBy: { id: 'asc' } }))
  .map(l => `${l.esercizioId === panca.id ? 'panca' : 'rematore'}:${l.tipo}:${l.serieNumero}${l.completato ? '' : ':saltata'}`);

/** Warm-up 1-2, working 1 (with a drop), 2 skipped, 3, and one rowing set */
const serieTipiche = () => [
  { esercizio: panca, peso: 40, rep: 10, tipo: 'RISCALDAMENTO', serieNumero: 1, idClient: id(1) },
  { esercizio: panca, peso: 60, rep: 5, tipo: 'RISCALDAMENTO', serieNumero: 2, idClient: id(2) },
  { esercizio: panca, peso: 80, rep: 8, serieNumero: 1, idClient: id(3) },
  { esercizio: panca, peso: 60, rep: 6, tipo: 'DROP', serieNumero: 1, idClient: id(4) },
  { esercizio: panca, peso: 0, rep: 0, serieNumero: 2, completato: false, idClient: id(5) },
  { esercizio: panca, peso: 85, rep: 6, serieNumero: 3, idClient: id(6) },
  { esercizio: rematore, peso: 50, rep: 10, serieNumero: 1, idClient: id(7) }
];
const aperta = () => creaSessione(utente, scheda, { inizio: new Date(Date.now() - 30 * MINUTO), conclusa: false, serie: serieTipiche() });

describe('eliminare una serie dall\'allenamento in corso', () => {
  it('una serie di lavoro se ne va con le sue drop e le successive scendono di un numero', async () => {
    const sessione = await aperta();
    const risposta = await elimina(sessione, id(3));
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.eliminata, true);
    assert.equal(risposta.corpo.dati.serie, 2);
    assert.deepEqual(await righe(sessione), [
      'panca:RISCALDAMENTO:1', 'panca:RISCALDAMENTO:2', 'panca:LAVORO:1:saltata', 'panca:LAVORO:2', 'rematore:LAVORO:1'
    ]);
  });

  it('un riscaldamento rinumera solo i riscaldamenti, una drop non sposta nulla', async () => {
    const sessione = await aperta();
    assert.equal((await elimina(sessione, id(1))).stato, 200);
    assert.equal((await elimina(sessione, id(4))).stato, 200);
    assert.deepEqual(await righe(sessione), [
      'panca:RISCALDAMENTO:1', 'panca:LAVORO:1', 'panca:LAVORO:2:saltata', 'panca:LAVORO:3', 'rematore:LAVORO:1'
    ]);
  });

  it('e\' idempotente: la seconda volta risponde 200 senza toccare nulla', async () => {
    const sessione = await aperta();
    await elimina(sessione, id(6));
    const prima = await righe(sessione);
    const ancora = await elimina(sessione, id(6));
    assert.equal(ancora.stato, 200);
    assert.equal(ancora.corpo.dati.eliminata, false);
    assert.deepEqual(await righe(sessione), prima);
  });

  it('arrivata subito dopo la serie, dalla stessa coda: prima la serie, poi la sua eliminazione', async () => {
    const sessione = await creaSessione(utente, scheda, { inizio: new Date(Date.now() - 10 * MINUTO), conclusa: false });
    const registrata = await chiedi('POST', `/sessioni/${sessione.id}/serie`, {
      esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 80, repEffettive: 8, idClient: id(9)
    });
    assert.equal(registrata.stato, 201);
    assert.equal((await elimina(sessione, id(9))).corpo.dati.eliminata, true);
    assert.deepEqual(await righe(sessione), []);
  });

  it('allenamento che non c\'e\' piu\': 404 (la coda lo legge come sparito)', async () => {
    const risposta = await chiedi('DELETE', `/sessioni/999999/serie/${id(1)}`);
    assert.equal(risposta.stato, 404);
  });

  it('chiave non valida: 400', async () => {
    const sessione = await aperta();
    assert.equal((await elimina(sessione, 'corta')).stato, 400);
    assert.equal((await elimina(sessione, 'con_trattino_basso!')).stato, 400);
  });

  it('le serie di un altro utente non si toccano: 403', async () => {
    const sessione = await aperta();
    const altro = await creaUtente();
    const risposta = await elimina(sessione, id(3), altro);
    assert.equal(risposta.stato, 403);
    assert.equal((await righe(sessione)).length, 7);
  });

  it('ad allenamento chiuso: volume ricalcolato e record riallineati', async () => {
    const sessione = await creaSessione(utente, scheda, {
      inizio: new Date(Date.now() - 90 * MINUTO),
      serie: [
        { esercizio: panca, peso: 80, rep: 8, serieNumero: 1, idClient: id(1) },
        { esercizio: panca, peso: 100, rep: 2, serieNumero: 2, idClient: id(2) }
      ]
    });
    await prisma.sessioneAllenamento.update({ where: { id: sessione.id }, data: { volumeTotaleKg: 80 * 8 + 100 * 2 } });
    await creaRecord(utente, panca, 100);

    const risposta = await elimina(sessione, id(2));
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.recordPersonali.map(r => r.pesoMaxRaggiunto), [80]);
    const dopo = await prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });
    assert.equal(dopo.volumeTotaleKg, 80 * 8);
    const record = await prisma.recordPersonale.findMany({ where: { utenteId: utente.id } });
    assert.deepEqual(record.map(r => r.pesoMaxRaggiunto), [80]);
  });

  it('ad allenamento aperto il volume resta da calcolare alla chiusura', async () => {
    const sessione = await aperta();
    await elimina(sessione, id(6));
    const dopo = await prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });
    assert.equal(dopo.volumeTotaleKg, null);
  });
});
