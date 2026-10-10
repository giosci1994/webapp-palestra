// Allenamenti dimenticati aperti: chiusi all'ultima serie, da chi tocca
// "Termina" ore dopo o dal controllo periodico del server.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, MINUTO } from '../supporto/dati.js';
import { chiudiSessioniDimenticate } from '../../src/services/conclusioneSessione.service.js';
import { giornoLocale } from '../../src/utils/date.js';

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
  scheda = await creaScheda(utente, [panca], { titolo: 'Push A' });
});

const minutiFa = n => new Date(Date.now() - n * MINUTO);
/** Un allenamento aperto, cominciato `inizio` minuti fa, con le serie registrate a quei minuti fa */
const aperto = (inizio, ...serie) => creaSessione(utente, scheda, {
  inizio: minutiFa(inizio),
  conclusa: false,
  serie: serie.map(n => ({ esercizio: panca, peso: 80, rep: 8, registrataIl: n === null ? null : minutiFa(n) }))
});
const sessione = s => prisma.sessioneAllenamento.findUnique({ where: { id: s.id } });

describe('"Termina" ore dopo l\'ultima serie', () => {
  it('l\'allenamento finisce all\'ultima serie, e la risposta lo dice', async () => {
    const dimenticato = await aperto(600, 590, 570, 550);
    const risposta = await server.richiesta('PATCH', `/sessioni/${dimenticato.id}/completa`, { token: tokenPer(utente), corpo: {} });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dimenticata, true);
    assert.equal(risposta.corpo.dati.durataMinuti, 50);
    assert.equal(risposta.corpo.dati.volumeTotaleKg, 3 * 80 * 8);
  });

  it('subito dopo l\'ultima serie finisce adesso', async () => {
    const inCorso = await aperto(60, 50, 10);
    const risposta = await server.richiesta('PATCH', `/sessioni/${inCorso.id}/completa`, { token: tokenPer(utente), corpo: {} });
    assert.equal(risposta.corpo.dimenticata, false);
    assert.equal(risposta.corpo.dati.durataMinuti, 60);
  });

  it('le serie registrate durante l\'allenamento prendono l\'orario', async () => {
    const inCorso = await aperto(10);
    const prima = Date.now();
    await server.richiesta('POST', `/sessioni/${inCorso.id}/serie`, {
      token: tokenPer(utente), corpo: { esercizioId: panca.id, serieNumero: 1, pesoEffettivo: 60, repEffettive: 10 }
    });
    const [serie] = await prisma.logSerie.findMany({ where: { sessioneId: inCorso.id } });
    assert.ok(serie.registrataIl.getTime() >= prima - 1000);
  });
});

describe('controllo periodico degli allenamenti aperti', () => {
  it('chiude quelli fermi da ore all\'ultima serie, con calendario, record e una notifica', async () => {
    const piano = await prisma.allenamentoPianificato.create({
      data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(minutiFa(400)) }
    });
    const dimenticato = await aperto(400, 390, 360);

    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 1, eliminate: 0 });

    const chiuso = await sessione(dimenticato);
    assert.equal(chiuso.durataMinuti, 40);
    assert.equal(chiuso.volumeTotaleKg, 2 * 80 * 8);
    assert.equal((await prisma.allenamentoPianificato.findUnique({ where: { id: piano.id } })).sessioneId, dimenticato.id);
    assert.equal(await prisma.recordPersonale.count({ where: { utenteId: utente.id, pesoMaxRaggiunto: 80 } }), 1);
    const [notifica] = await prisma.allenamentoNotifica.findMany({ where: { utenteId: utente.id } });
    assert.equal(notifica.titolo, 'Allenamento chiuso');
    assert.match(notifica.messaggio, /«Push A».*all'ultima serie, alle \d{2}:\d{2}/);
    assert.equal(notifica.percorso, '/storico');
  });

  it('elimina quelli abbandonati senza nemmeno una serie', async () => {
    const vuoto = await aperto(300);
    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 0, eliminate: 1 });
    assert.equal(await sessione(vuoto), null);
  });

  it('lascia stare quelli in corso: appena cominciati, o con una serie recente', async () => {
    const appenaCominciato = await aperto(20);
    const lungo = await aperto(200, 180, 30);
    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 0, eliminate: 0 });
    assert.equal((await sessione(appenaCominciato)).dataFine, null);
    assert.equal((await sessione(lungo)).dataFine, null);
  });

  it('con serie senza orario (registrate prima) stima tre minuti a serie', async () => {
    const vecchio = await aperto(5000, null, null, null, null);
    await chiudiSessioniDimenticate(null);
    assert.equal((await sessione(vecchio)).durataMinuti, 12);
  });

  it('non tocca gli allenamenti gia\' conclusi', async () => {
    const concluso = await creaSessione(utente, scheda, { inizio: minutiFa(1000), durataMinuti: 60 });
    assert.deepEqual(await chiudiSessioniDimenticate(null), { chiuse: 0, eliminate: 0 });
    assert.equal((await sessione(concluso)).durataMinuti, 60);
  });
});
