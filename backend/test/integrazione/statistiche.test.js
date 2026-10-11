// Statistics: the activity grid of the last year.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, giorniFa } from '../supporto/dati.js';

let server;
let utente;
let panca;
let scheda;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
  panca = await creaEsercizio({ nome: 'Panca piana' });
  scheda = await creaScheda(utente, [panca]);
});

const attivita = async (chi = utente) => {
  const risposta = await server.richiesta('GET', '/statistiche/attivita-annuale', { token: tokenPer(chi) });
  assert.equal(risposta.stato, 200);
  return risposta.corpo.dati;
};
const serie = n => Array.from({ length: n }, () => ({ esercizio: panca, peso: 60, rep: 10 }));
/** Noon UTC n days ago: the same day in Denmark too */
const mezzogiorno = n => { const d = giorniFa(n); d.setUTCHours(12, 0, 0, 0); return d; };
const giornoDi = d => d.toISOString().slice(0, 10);

describe('attivita\' dell\'ultimo anno', () => {
  it('conta allenamenti e serie completate per giorno', async () => {
    const quelGiorno = mezzogiorno(10);
    await creaSessione(utente, scheda, { inizio: quelGiorno, serie: serie(3) });
    await creaSessione(utente, scheda, { inizio: new Date(quelGiorno.getTime() + 3600000), serie: serie(2) });
    await creaSessione(utente, scheda, { inizio: mezzogiorno(3), serie: serie(4) });

    assert.deepEqual(await attivita(), [
      { giorno: giornoDi(quelGiorno), allenamenti: 2, serie: 5 },
      { giorno: giornoDi(mezzogiorno(3)), allenamenti: 1, serie: 4 }
    ]);
  });

  it('il giorno e\' quello del calendario danese: le 23:30 UTC sono gia\' il giorno dopo', async () => {
    const sera = giorniFa(5);
    sera.setUTCHours(23, 30, 0, 0);
    await creaSessione(utente, scheda, { inizio: sera, serie: serie(1) });
    const dopo = new Date(sera.getTime() + 86400000);
    assert.deepEqual((await attivita()).map(g => g.giorno), [giornoDi(dopo)]);
  });

  it('esclude allenamenti in corso, serie saltate, altri utenti e quanto e\' piu\' vecchio di 53 settimane', async () => {
    await creaSessione(utente, scheda, { inizio: mezzogiorno(2), conclusa: false, serie: serie(2) });
    const conSaltata = await creaSessione(utente, scheda, { inizio: mezzogiorno(4), serie: serie(3) });
    await prisma.logSerie.update({ where: { id: conSaltata.logSerie[0].id }, data: { completato: false } });
    await creaSessione(await creaUtente(), scheda, { inizio: mezzogiorno(4), serie: serie(1) });
    await creaSessione(utente, scheda, { inizio: mezzogiorno(53 * 7 + 3), serie: serie(1) });

    assert.deepEqual(await attivita(), [{ giorno: giornoDi(mezzogiorno(4)), allenamenti: 1, serie: 2 }]);
  });

  it('riparte dall\'azzeramento delle statistiche', async () => {
    await creaSessione(utente, scheda, { inizio: mezzogiorno(20), serie: serie(1) });
    await creaSessione(utente, scheda, { inizio: mezzogiorno(2), serie: serie(1) });
    await prisma.utente.update({ where: { id: utente.id }, data: { dataResetStatistiche: giorniFa(10) } });
    assert.deepEqual((await attivita()).map(g => g.giorno), [giornoDi(mezzogiorno(2))]);
  });
});
