// The texts the services build (dashboard advice, errors of the chat and of the
// AI assistant, reminders, the end-of-rest push, the chat socket) come in the
// language of the request, or of the person who receives them.
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, creaEsercizio, creaScheda, creaSessione, giorniFa } from '../supporto/dati.js';
import { giornoLocale } from '../../src/utils/date.js';
import { inviaPromemoriaAllenamenti } from '../../src/services/notifiche.service.js';
import { programmaFineRecupero } from '../../src/services/push.service.js';
import { gestoreChatMessaggi } from '../../src/socket/gestori/chat.gestore.js';

let server;
let utente;
const attendi = ms => new Promise(risolvi => setTimeout(risolvi, ms));

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
});

const chiedi = (metodo, percorso, lingua, corpo) =>
  server.richiesta(metodo, percorso, { token: tokenPer(utente), lingua, corpo });

describe('the dashboard advice', () => {
  const consiglio = async lingua => (await chiedi('GET', '/statistiche/consiglio', lingua)).corpo.dati.testo;

  it('names the groups and conjugates the verbs in the language of the request', async () => {
    const panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const scheda = await creaScheda(utente, [panca]);
    assert.equal(await consiglio('it'), 'Per cominciare: una scheda per Petto.');
    assert.equal(await consiglio('en'), 'To start: a plan for Chest.');

    // Chest is singular: "Petto riposa" / "Chest has rested"
    await creaSessione(utente, scheda, { inizio: giorniFa(5), serie: [{ esercizio: panca, peso: 80, rep: 8 }] });
    assert.equal(await consiglio('it'), 'Petto riposa da 5 giorni.');
    assert.equal(await consiglio('en'), 'Chest has rested for 5 days.');
  });

  it('lists two groups with the plural verb', async () => {
    const panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const lento = await creaEsercizio({ nome: 'Lento avanti', gruppoMuscoloPrimario: 'Spalle' });
    const scheda = await creaScheda(utente, [panca, lento]);
    assert.equal(await consiglio('it'), 'Per cominciare: una scheda per Petto e Spalle.');
    assert.equal(await consiglio('en'), 'To start: a plan for Chest and Shoulders.');

    await creaSessione(utente, scheda, {
      inizio: giorniFa(5), serie: [{ esercizio: panca, peso: 80, rep: 8 }, { esercizio: lento, peso: 40, rep: 8 }]
    });
    assert.equal(await consiglio('it'), 'Petto e Spalle riposano da 5 giorni.');
    assert.equal(await consiglio('en'), 'Chest and Shoulders have rested for 5 days.');
  });

  it('says to rest, naming the tired muscles with the right verb', async () => {
    const panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const scheda = await creaScheda(utente, [panca]);
    await creaSessione(utente, scheda, { inizio: giorniFa(0.2), serie: [{ esercizio: panca, peso: 80, rep: 8 }] });
    assert.equal(await consiglio('it'), 'Petto è ancora in recupero: oggi riposa.');
    assert.equal(await consiglio('en'), 'Chest is still recovering: rest today.');
  });

  it('says to rest when every plan would load a tired muscle', async () => {
    const curl = await creaEsercizio({ nome: 'Curl polso', gruppoMuscoloPrimario: 'Avambracci' });
    const scheda = await creaScheda(utente, [curl]);
    await creaSessione(utente, scheda, { inizio: giorniFa(0.2), serie: [{ esercizio: curl, peso: 20, rep: 12 }] });
    assert.equal(await consiglio('it'), 'Ogni scheda caricherebbe muscoli ancora in recupero: oggi riposa.');
    assert.equal(await consiglio('en'), 'Every plan would load muscles that are still recovering: rest today.');
  });

  it('tells what the calendar says, today or on a coming day', async () => {
    const panca = await creaEsercizio({ nome: 'Panca piana', gruppoMuscoloPrimario: 'Petto' });
    const scheda = await creaScheda(utente, [panca]);
    await creaSessione(utente, scheda, { inizio: giorniFa(5), serie: [{ esercizio: panca, peso: 80, rep: 8 }] });
    const giorno = giorni => new Date(giornoLocale(new Date()).getTime() + giorni * 86400000);
    const pianifica = giorni => prisma.allenamentoPianificato.create({ data: { utenteId: utente.id, schedaId: scheda.id, data: giorno(giorni) } });

    const domani = await pianifica(1);
    assert.equal(await consiglio('it'), 'Petto riposa da 5 giorni. In programma domani.');
    assert.equal(await consiglio('en'), 'Chest has rested for 5 days. Scheduled for tomorrow.');

    await prisma.allenamentoPianificato.delete({ where: { id: domani.id } });
    await pianifica(4);
    const giornoSettimana = { it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
    const nome = lingua => giornoSettimana[lingua][giorno(4).getUTCDay()];
    assert.equal(await consiglio('it'), `Petto riposa da 5 giorni. In programma ${nome('it')}.`);
    assert.equal(await consiglio('en'), `Chest has rested for 5 days. Scheduled for ${nome('en')}.`);

    await pianifica(0);
    assert.equal(await consiglio('it'), 'In programma oggi. Petto riposa da 5 giorni.');
    assert.equal(await consiglio('en'), 'Scheduled for today. Chest has rested for 5 days.');
  });
});

describe('errors of the services', () => {
  it('a contact request to yourself, in the language of the request', async () => {
    const corpo = { destinatarioId: utente.id };
    const it = await chiedi('POST', '/chat/contatti/richiesta', 'it', corpo);
    const en = await chiedi('POST', '/chat/contatti/richiesta', 'en', corpo);
    assert.deepEqual([it.stato, it.corpo.messaggio], [400, 'Non puoi inviare una richiesta a te stesso']);
    assert.deepEqual([en.stato, en.corpo.messaggio], [400, "You can't send a request to yourself"]);
  });

  it('the AI assistant without a key keeps its code and speaks the language of the request', async () => {
    const it = await chiedi('POST', '/assistente/chiedi', 'it', { messaggio: 'Ciao' });
    const en = await chiedi('POST', '/assistente/chiedi', 'en', { messaggio: 'Hi' });
    assert.deepEqual([it.stato, it.corpo.codice], [503, 'AI_NON_CONFIGURATA']);
    assert.deepEqual([en.stato, en.corpo.codice], [503, 'AI_NON_CONFIGURATA']);
    assert.match(it.corpo.messaggio, /^API Key di Google Gemini non configurata/);
    assert.match(en.corpo.messaggio, /^Google Gemini API key not configured/);
  });
});

describe('workout reminder, on a timer: in the language of the person who receives it', () => {
  it('each user gets the title in their own language, with the plural', async () => {
    const adesso = new Date();
    const oggi = new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate()));
    const inglese = await creaUtente({ lingua: 'en' });
    const italiano = await creaUtente({ lingua: 'it' });
    for (const [chi, schede] of [[inglese, 2], [italiano, 1]]) {
      for (let i = 1; i <= schede; i++) {
        const scheda = await creaScheda(chi, [], { titolo: `Scheda ${i}` });
        await prisma.allenamentoPianificato.create({ data: { utenteId: chi.id, schedaId: scheda.id, data: oggi } });
      }
    }
    assert.equal(await inviaPromemoriaAllenamenti(null), 2);
    const titolo = async chi => (await prisma.allenamentoNotifica.findFirst({ where: { utenteId: chi.id } })).titolo;
    assert.equal(await titolo(inglese), 'You have 2 workouts today');
    assert.equal(await titolo(italiano), 'Oggi ti aspetta un allenamento');
  });
});

describe('push of the end of the rest', () => {
  it('goes in the language the user chose in Profile, not the one of the request that started it', async () => {
    const chiavi = webpush.generateVAPIDKeys();
    process.env.VAPID_CHIAVE_PUBBLICA = chiavi.publicKey;
    process.env.VAPID_CHIAVE_PRIVATA = chiavi.privateKey;
    const invii = mock.method(webpush, 'sendNotification', async () => ({ statusCode: 201 }));
    try {
      const inglese = await creaUtente({ lingua: 'en' });
      await prisma.iscrizionePush.create({
        data: { utenteId: inglese.id, endpoint: 'https://fcm.googleapis.com/fcm/send/lingua', p256dh: 'chiave', auth: 'segreto' }
      });
      programmaFineRecupero(inglese.id, 1, 'Bench press · set 2');
      programmaFineRecupero(inglese.id, 1, null);
      await attendi(1300);
      assert.equal(invii.mock.callCount(), 1); // the second one replaced the first
      assert.deepEqual(
        [JSON.parse(invii.mock.calls[0].arguments[1]).titolo, JSON.parse(invii.mock.calls[0].arguments[1]).messaggio],
        ['⏱️ Rest over', 'Your turn: the next set']
      );
    } finally {
      invii.mock.restore();
    }
  });
});

describe('chat socket', () => {
  /** A socket with just what the chat handler uses; the events are fired by hand */
  function socketFinto(chi) {
    const eventi = {};
    const socket = { utente: { utenteId: chi.id }, on: (nome, funzione) => { eventi[nome] = funzione; }, join() {}, leave() {}, to: () => ({ emit() {} }) };
    gestoreChatMessaggi({ to: () => ({ emit() {} }) }, socket, new Map());
    return (nome, dati) => new Promise(risolvi => eventi[nome](dati, risolvi));
  }

  it('the errors go back to the sender in their own language', async () => {
    const inglese = await creaUtente({ lingua: 'en' });
    const italiano = await creaUtente({ lingua: 'it' });
    for (const [chi, vuoto, estraneo] of [
      [inglese, 'Invalid message data', 'You are not part of this conversation'],
      [italiano, 'Dati messaggio non validi', 'Non fai parte di questa conversazione']
    ]) {
      const invia = socketFinto(chi);
      assert.equal((await invia('chat:invia_messaggio', { conversazioneId: 1, contenuto: '  ' })).errore, vuoto);
      assert.equal((await invia('chat:invia_messaggio', { conversazioneId: 999999, contenuto: 'Hello' })).errore, estraneo);
    }
  });
});
