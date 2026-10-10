// GET /utenti/esportazione: tutti i dati dell'utente, nessun segreto, degli
// altri utenti solo il nome.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import {
  creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, creaRecord, giorniFa
} from '../supporto/dati.js';
import { giornoLocale } from '../../src/utils/date.js';

// Valori che non devono mai comparire nel file
const SEGRETI = ['hash-segreto', 'reset-segreto', 'verifica-segreta', 'refresh-segreto', 'codice-segreto'];

let server;
let utente;
let altro;
let trainer;
let panca;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());

/** Un utente con un po' di tutto, un altro utente con cui chatta e un PT */
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({
    nome: 'Giulia',
    pesoKg: 62,
    preferenzeVisibilita: JSON.stringify({ peso: false, record: true }),
    tokenResetPassword: 'reset-segreto',
    tokenVerificaEmail: 'verifica-segreta'
  });
  await prisma.utente.update({ where: { id: utente.id }, data: { passwordHash: 'hash-segreto' } });
  altro = await creaUtente({ nome: 'Marco', email: 'marco.privato@test.local' });
  trainer = await creaUtente({ nome: 'Coach Anna', ruolo: 'PERSONAL_TRAINER' });
  panca = await creaEsercizio({ nome: 'Bench Press', nomeIt: 'Panca piana' });

  const scheda = await creaScheda(utente, [panca], { titolo: 'Spinta' });
  const sessione = await creaSessione(utente, scheda, {
    inizio: giorniFa(2), serie: [{ esercizio: panca, peso: 50, rep: 8 }, { esercizio: panca, peso: 52.5, rep: 6 }]
  });
  await creaRecord(utente, panca, 52.5, sessione.dataInizio);
  await prisma.misurazioneCorporea.create({ data: { utenteId: utente.id, peso: 62, grassoCorporeoPct: 21.5 } });
  await prisma.allenamentoPianificato.create({
    data: { utenteId: utente.id, schedaId: scheda.id, data: giornoLocale(new Date()), creatoDaId: trainer.id }
  });
  await prisma.allenamentoNotifica.create({ data: { utenteId: utente.id, titolo: 'Oggi si spinge', messaggio: 'Scheda Spinta' } });
  await prisma.refreshToken.create({ data: { token: 'refresh-segreto', utenteId: utente.id, scadenza: giorniFa(-7) } });
  await prisma.collegamentoTelegram.create({
    data: { utenteId: utente.id, telegramChatId: 123456789012n, codice: 'codice-segreto', collegatoIl: giorniFa(30) }
  });

  await prisma.conversazione.create({
    data: {
      partecipanti: { create: [{ utenteId: utente.id }, { utenteId: altro.id }] },
      messaggi: {
        create: [
          { mittenteId: altro.id, contenuto: 'Ci vediamo in palestra?' },
          { mittenteId: utente.id, contenuto: 'Alle 18!' }
        ]
      }
    }
  });
  await prisma.conversazioneAI.create({
    data: {
      utenteId: utente.id, contesto: 'domanda_libera',
      messaggi: { create: [{ ruolo: 'utente', contenuto: 'Quante serie?' }, { ruolo: 'assistente', contenuto: 'Tre.' }] }
    }
  });
  await prisma.suggerimentoEsercizio.create({
    data: { utenteId: utente.id, nome: 'Hip thrust con elastico', gruppoMuscoloPrimario: 'Glutei' }
  });

  await prisma.iscrizionePT.create({
    data: { utenteId: utente.id, trainerId: trainer.id, stato: 'ATTIVA', messaggioRichiesta: 'Vorrei preparare una gara', notePT: 'nota privata del PT' }
  });
  await prisma.appuntamentoPT.create({
    data: { trainerId: trainer.id, clienteId: utente.id, titolo: 'Valutazione', dataOra: giorniFa(-3) }
  });
  await prisma.annuncioPT.create({
    data: { trainerId: trainer.id, destinatarioId: utente.id, titolo: 'Nuova scheda', contenuto: 'Da lunedi' }
  });

  // Dati di Marco che nel file di Giulia non devono comparire
  const schedaAltro = await creaScheda(altro, [panca], { titolo: 'Scheda di Marco' });
  await creaSessione(altro, schedaAltro, { serie: [{ esercizio: panca, peso: 100, rep: 5 }] });
  await prisma.misurazioneCorporea.create({ data: { utenteId: altro.id, peso: 90 } });
});

const esporta = chi => server.richiesta('GET', '/utenti/esportazione', { token: tokenPer(chi) });

describe('esportazione dei dati', () => {
  it('senza login risponde 401', async () => {
    assert.equal((await server.richiesta('GET', '/utenti/esportazione')).stato, 401);
  });

  it('arriva come file JSON da scaricare, che nessuno deve tenere in cache', async () => {
    const risposta = await esporta(utente);
    assert.equal(risposta.stato, 200);
    assert.match(risposta.intestazioni.get('content-type'), /^application\/json/);
    assert.match(risposta.intestazioni.get('content-disposition'), /^attachment; filename="gymmaster-dati-\d{4}-\d{2}-\d{2}\.json"$/);
    assert.equal(risposta.intestazioni.get('cache-control'), 'no-store');
    assert.equal(risposta.corpo.formato, 'gymmaster-esportazione-dati');
    assert.equal(risposta.corpo.versioneFormato, 1);
  });

  it('contiene profilo, schede, allenamenti, record, misurazioni e il resto', async () => {
    const { corpo: dati } = await esporta(utente);

    assert.equal(dati.profilo.nome, 'Giulia');
    assert.equal(dati.profilo.pesoKg, 62);
    assert.deepEqual(dati.profilo.preferenzeVisibilita, { peso: false, record: true });
    assert.equal(dati.profilo.telegram.chatId, '123456789012');

    assert.deepEqual(dati.schede.map(s => [s.titolo, s.esercizi[0].esercizio.nomeIt]), [['Spinta', 'Panca piana']]);
    assert.equal(dati.allenamenti.length, 1);
    assert.equal(dati.allenamenti[0].scheda, 'Spinta');
    assert.deepEqual(dati.allenamenti[0].serie.map(s => [s.pesoEffettivo, s.repEffettive]), [[50, 8], [52.5, 6]]);
    assert.deepEqual(dati.recordPersonali.map(r => [r.esercizio.nome, r.pesoMaxRaggiunto]), [['Bench Press', 52.5]]);
    assert.deepEqual(dati.misurazioni.map(m => [m.peso, m.grassoCorporeoPct]), [[62, 21.5]]);
    assert.deepEqual(dati.pianificazione.map(p => [p.scheda, p.programmatoDa]), [['Spinta', 'Coach Anna']]);
    assert.deepEqual(dati.notifiche.map(n => n.titolo), ['Oggi si spinge']);
    assert.deepEqual(dati.assistente[0].messaggi.map(m => m.contenuto), ['Quante serie?', 'Tre.']);
    assert.deepEqual(dati.suggerimentiEsercizi.map(s => s.nome), ['Hip thrust con elastico']);
  });

  it('nelle chat ci sono anche i messaggi ricevuti, ma degli altri solo il nome', async () => {
    const risposta = await esporta(utente);
    const [chat] = risposta.corpo.chat;

    assert.deepEqual(chat.partecipanti.sort(), ['Giulia', 'Marco']);
    assert.deepEqual(
      chat.messaggi.map(m => [m.mittente, m.tuo, m.contenuto]),
      [['Marco', false, 'Ci vediamo in palestra?'], ['Giulia', true, 'Alle 18!']]
    );
    assert.ok(!risposta.testo.includes('marco.privato@test.local'), "l'email di Marco non deve comparire");
  });

  it('nessun segreto e nessun dato degli altri utenti', async () => {
    const risposta = await esporta(utente);

    for (const segreto of [...SEGRETI, 'passwordHash']) {
      assert.ok(!risposta.testo.includes(segreto), `nel file c'e' ${segreto}`);
    }
    assert.ok(!risposta.testo.includes('Scheda di Marco'));
    assert.equal(risposta.corpo.misurazioni.length, 1);
    assert.equal(risposta.corpo.allenamenti.length, 1);
  });

  it('il rapporto col PT dal lato del cliente: senza le note private del PT', async () => {
    const { corpo: dati } = await esporta(utente);

    const [iscrizione] = dati.personalTrainer.iscrizioni;
    assert.equal(iscrizione.trainer, 'Coach Anna');
    assert.equal(iscrizione.messaggioRichiesta, 'Vorrei preparare una gara');
    assert.ok(!('notePT' in iscrizione));
    assert.deepEqual(dati.personalTrainer.appuntamenti.map(a => [a.titolo, a.trainer]), [['Valutazione', 'Coach Anna']]);
    assert.deepEqual(dati.personalTrainer.annunciRicevuti.map(a => a.titolo), ['Nuova scheda']);
    assert.deepEqual(dati.comePersonalTrainer.clienti, []);
  });

  it('il PT ritrova nel suo file clienti, appuntamenti, annunci e le proprie note', async () => {
    const { corpo: dati } = await esporta(trainer);

    assert.deepEqual(dati.comePersonalTrainer.clienti.map(c => [c.cliente, c.notePT]), [['Giulia', 'nota privata del PT']]);
    assert.deepEqual(dati.comePersonalTrainer.appuntamenti.map(a => a.cliente), ['Giulia']);
    assert.deepEqual(dati.comePersonalTrainer.annunci.map(a => a.destinatario), ['Giulia']);
    // Le schede e gli allenamenti di Giulia restano suoi
    assert.deepEqual(dati.schede, []);
    assert.deepEqual(dati.allenamenti, []);
  });
});
