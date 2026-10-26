// How long the messages a user sends stay in the chat: chosen in Profile →
// Privacy (chatRetentionGiorni, 0 = forever), and what the cleanup job does
// with it.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, tokenPer, giorniFa } from '../supporto/dati.js';
import { pulisciMessaggiScaduti } from '../../src/services/chat.service.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente();
});

const aggiorna = (corpo, lingua) => server.richiesta('PATCH', '/utenti/profilo', { token: tokenPer(utente), corpo, lingua });
const salvata = async () => (await prisma.utente.findUnique({ where: { id: utente.id } })).chatRetentionGiorni;

describe('chat retention in the profile', () => {
  it('is 7 days for a new account, and comes with the profile', async () => {
    const profilo = await server.richiesta('GET', '/utenti/profilo', { token: tokenPer(utente) });
    assert.equal(profilo.corpo.dati.chatRetentionGiorni, 7);
  });

  it('is saved from Profile, 0 included (forever), and sent back', async () => {
    const trenta = await aggiorna({ chatRetentionGiorni: 30 });
    assert.equal(trenta.stato, 200);
    assert.equal(trenta.corpo.dati.chatRetentionGiorni, 30);
    assert.equal(await salvata(), 30);

    assert.equal((await aggiorna({ chatRetentionGiorni: 0 })).corpo.dati.chatRetentionGiorni, 0);
    assert.equal((await aggiorna({ chatRetentionGiorni: 365 })).corpo.dati.chatRetentionGiorni, 365);
  });

  it('anything but whole days from 0 to 365 is refused, and nothing changes', async () => {
    await aggiorna({ chatRetentionGiorni: 30 });
    for (const valore of [-1, 366, 2.5, '30', null]) {
      const risposta = await aggiorna({ chatRetentionGiorni: valore, nome: 'Cambiato' });
      assert.equal(risposta.stato, 400, `${JSON.stringify(valore)} should be refused`);
    }
    const dopo = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.deepEqual([dopo.chatRetentionGiorni, dopo.nome], [30, utente.nome]);
  });

  it('the refusal is in the language of the app', async () => {
    const italiano = await aggiorna({ chatRetentionGiorni: 1000 }, 'it');
    const inglese = await aggiorna({ chatRetentionGiorni: 1000 }, 'en');
    assert.equal(italiano.corpo.messaggio, 'La durata dei messaggi deve essere un numero intero di giorni da 0 (per sempre) a 365');
    assert.equal(inglese.corpo.messaggio, 'The chat retention must be a whole number of days from 0 (forever) to 365');
  });
});

describe('cleaning up the chat', () => {
  it("deletes each sender's messages older than their retention, and keeps everything for 0", async () => {
    const amico = await creaUtente();
    await prisma.utente.update({ where: { id: utente.id }, data: { chatRetentionGiorni: 30 } });
    await prisma.utente.update({ where: { id: amico.id }, data: { chatRetentionGiorni: 0 } });
    const conversazione = await prisma.conversazione.create({
      data: { partecipanti: { create: [{ utenteId: utente.id }, { utenteId: amico.id }] } }
    });
    const scrivi = (mittente, contenuto, giorni) => prisma.messaggio.create({
      data: { conversazioneId: conversazione.id, mittenteId: mittente.id, contenuto, inviatoIl: giorniFa(giorni) }
    });
    await scrivi(utente, 'vecchio', 40);
    await scrivi(utente, 'recente', 10);
    await scrivi(amico, 'vecchio per sempre', 400);

    assert.equal(await pulisciMessaggiScaduti(), 1);
    const rimasti = await prisma.messaggio.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(rimasti.map(m => m.contenuto), ['recente', 'vecchio per sempre']);
  });
});
