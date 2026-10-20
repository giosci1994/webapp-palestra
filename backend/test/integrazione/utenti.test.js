// The /utenti routes not covered elsewhere: searching people, the onboarding
// wizard, the Telegram link, the trainers to choose from, your enrolment with
// a trainer, deleting your own account and the admin's user management.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer } from '../supporto/server.js';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente, creaScheda, tokenPer, MINUTO, GIORNO } from '../supporto/dati.js';

let server;
let utente;

before(async () => { server = await avviaServer(); });
after(() => server.chiudi());
beforeEach(async () => {
  await svuotaDatabase();
  utente = await creaUtente({ nome: 'Giulia' });
});

const chiedi = (metodo, percorso, corpo, chi = utente) => server.richiesta(metodo, percorso, { token: tokenPer(chi), corpo });
const notificheDi = chi => prisma.allenamentoNotifica.findMany({ where: { utenteId: chi.id } });

describe('searching people', () => {
  it('by name or email, active ones only, never yourself, at most 10', async () => {
    await creaUtente({ nome: 'Marco Rossi' });
    await creaUtente({ nome: 'Anna', email: 'marco.fan@test.local' });
    await creaUtente({ nome: 'Marco Bannato', stato: 'BANNATO' });
    await prisma.utente.update({ where: { id: utente.id }, data: { nome: 'Marco Io' } });

    const risposta = await chiedi('GET', '/utenti/cerca?q=MARCO');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.map(u => u.nome).sort(), ['Anna', 'Marco Rossi']);
    assert.deepEqual(Object.keys(risposta.corpo.dati[0]).sort(), ['id', 'nome', 'ruolo']);

    for (let i = 0; i < 12; i++) await creaUtente({ nome: `Marco ${i}` });
    assert.equal((await chiedi('GET', '/utenti/cerca?q=marco')).corpo.dati.length, 10);
  });

  it('fewer than two letters find nobody', async () => {
    await creaUtente({ nome: 'Marco' });
    assert.deepEqual((await chiedi('GET', '/utenti/cerca?q=m')).corpo.dati, []);
    assert.deepEqual((await chiedi('GET', '/utenti/cerca')).corpo.dati, []);
  });
});

describe('onboarding wizard', () => {
  it('saves the profile, the consents and the visibility choices, and marks it complete', async () => {
    const risposta = await chiedi('PATCH', '/utenti/completa-profilo', {
      dataNascita: '1995-04-12', genere: 'F', pesoKg: '61.5', altezzaCm: '168', obiettivoFitness: 'Forza',
      preferenzeVisibilita: { peso: true }, gamificationAttiva: false, accettaToS: true, accettaPrivacy: true
    });
    assert.equal(risposta.stato, 200);
    const dati = risposta.corpo.dati;
    assert.equal(dati.profiloCompletato, true);
    assert.equal(dati.dataNascita, '1995-04-12T00:00:00.000Z');
    assert.deepEqual([dati.genere, dati.pesoKg, dati.altezzaCm, dati.obiettivoFitness], ['F', 61.5, 168, 'Forza']);
    assert.deepEqual(JSON.parse(dati.preferenzeVisibilita), { peso: true });
    assert.equal(dati.gamificationAttiva, false);
    assert.equal(dati.ruoloRichiesto, null);

    const salvato = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.ok(salvato.accettazioneToS && salvato.accettazionePrivacy);
  });

  it('a trainer\'s professional profile; asking to be a trainer reaches the admins', async () => {
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });
    const risposta = await chiedi('PATCH', '/utenti/completa-profilo', {
      tipoAccount: 'PERSONAL_TRAINER', bio: 'Coach', specializzazioni: ['Forza', 'Mobilità'],
      anniEsperienza: '5', certificazioni: 'ISSA', contattoPubblico: '@coach', tariffaIndicativa: '40 €/h'
    });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.dati.ruoloRichiesto, 'PERSONAL_TRAINER');

    const salvato = await prisma.utente.findUnique({ where: { id: utente.id } });
    assert.equal(salvato.ruolo, 'UTENTE');
    assert.deepEqual(JSON.parse(salvato.specializzazioni), ['Forza', 'Mobilità']);
    assert.deepEqual([salvato.bio, salvato.anniEsperienza, salvato.certificazioni, salvato.contattoPubblico, salvato.tariffaIndicativa],
      ['Coach', 5, 'ISSA', '@coach', '40 €/h']);
    const [notifica] = await notificheDi(admin);
    assert.equal(notifica.percorso, '/admin/utenti');
    assert.match(notifica.messaggio, /Giulia/);
  });

  it('someone who is already a trainer asks nothing', async () => {
    const admin = await creaUtente({ ruolo: 'SUPERADMIN' });
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    const risposta = await chiedi('PATCH', '/utenti/completa-profilo', { tipoAccount: 'PERSONAL_TRAINER' }, trainer);
    assert.equal(risposta.corpo.dati.ruoloRichiesto, null);
    assert.deepEqual(await notificheDi(admin), []);
  });
});

describe('Telegram link from Profile', () => {
  it('a code valid for 10 minutes, the state of the link, and unlinking', async () => {
    const codice = await chiedi('POST', '/utenti/telegram/genera-codice');
    assert.equal(codice.stato, 200);
    const { dati } = codice.corpo;
    assert.match(dati.codice, /^[0-9A-F]{8}$/);
    const minuti = (new Date(dati.scadenza).getTime() - Date.now()) / MINUTO;
    assert.ok(minuti > 9 && minuti <= 10, String(minuti));
    assert.equal(dati.deepLink, dati.username ? `https://t.me/${dati.username}?start=${dati.codice}` : null);

    // A new code replaces the old one
    const nuovo = (await chiedi('POST', '/utenti/telegram/genera-codice')).corpo.dati.codice;
    assert.equal(await prisma.collegamentoTelegram.count(), 1);
    assert.equal((await prisma.collegamentoTelegram.findFirst()).codice, nuovo);

    assert.deepEqual((await chiedi('GET', '/utenti/telegram/stato')).corpo.dati, { collegato: false, collegatoIl: null });
    const collegatoIl = new Date();
    await prisma.collegamentoTelegram.update({ where: { utenteId: utente.id }, data: { telegramChatId: 123n, collegatoIl } });
    assert.deepEqual((await chiedi('GET', '/utenti/telegram/stato')).corpo.dati, { collegato: true, collegatoIl: collegatoIl.toISOString() });

    const scollega = await chiedi('DELETE', '/utenti/telegram');
    assert.equal(scollega.stato, 200);
    assert.equal(scollega.corpo.messaggio, 'Telegram scollegato');
    assert.equal(await prisma.collegamentoTelegram.count(), 0);
    assert.equal((await chiedi('DELETE', '/utenti/telegram')).stato, 200);
  });
});

describe('trainers to choose from', () => {
  let trainer;
  beforeEach(async () => {
    trainer = await creaUtente({
      ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna', bio: 'Forza', specializzazioni: '["Forza"]',
      anniEsperienza: 8, certificazioni: 'ISSA', contattoPubblico: '@anna', tariffaIndicativa: '40 €/h'
    });
    await creaUtente({ ruolo: 'PERSONAL_TRAINER', stato: 'BANNATO' });
    const cliente = await creaUtente();
    const exCliente = await creaUtente();
    await prisma.iscrizionePT.createMany({ data: [
      { utenteId: cliente.id, trainerId: trainer.id, stato: 'ATTIVA' },
      { utenteId: exCliente.id, trainerId: trainer.id, stato: 'TERMINATA' }
    ] });
    await creaScheda(trainer, [], { titolo: 'Pubblica', visibilita: 'GLOBALE' });
    await creaScheda(trainer, [], { titolo: 'Privata' });
  });

  it('the list has the active trainers, with their active clients and plans', async () => {
    const risposta = await chiedi('GET', '/utenti/personal-trainers');
    assert.equal(risposta.stato, 200);
    assert.deepEqual(risposta.corpo.dati.map(t => t.id), [trainer.id]);
    assert.deepEqual(risposta.corpo.dati[0]._count, { clientiComePT: 1, schedeCreate: 2 });
    assert.equal(risposta.corpo.dati[0].email, undefined);
  });

  it('the profile of a trainer, with the plans shared with everyone', async () => {
    const risposta = await chiedi('GET', `/utenti/personal-trainers/${trainer.id}`);
    assert.equal(risposta.stato, 200);
    const p = risposta.corpo.dati;
    assert.deepEqual([p.nome, p.anniEsperienza, p.certificazioni, p.contattoPubblico, p.tariffaIndicativa],
      ['Coach Anna', 8, 'ISSA', '@anna', '40 €/h']);
    assert.deepEqual(p.schede.map(s => s.titolo), ['Pubblica']);
    assert.equal(p.email, undefined);
  });

  it('someone who is not an active trainer is not found', async () => {
    const bannato = await prisma.utente.findFirst({ where: { stato: 'BANNATO' } });
    for (const id of [utente.id, bannato.id, 99999]) {
      const risposta = await chiedi('GET', `/utenti/personal-trainers/${id}`);
      assert.equal(risposta.stato, 404);
      assert.equal(risposta.corpo.messaggio, 'Personal Trainer non trovato');
    }
  });
});

describe('your enrolment with a trainer', () => {
  let trainer;
  beforeEach(async () => {
    trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER', nome: 'Coach Anna' });
  });
  const iscrizione = stato => prisma.iscrizionePT.create({ data: { utenteId: utente.id, trainerId: trainer.id, stato } });
  const appuntamento = (dataOra, dati = {}) => prisma.appuntamentoPT.create({
    data: { trainerId: trainer.id, clienteId: utente.id, titolo: 'Sessione', dataOra, ...dati }
  });

  it('without one: nothing to show, nothing to cancel', async () => {
    assert.equal((await chiedi('GET', '/utenti/mio-pt')).corpo.dati, null);
    assert.equal((await chiedi('GET', '/utenti/mio-pt/dashboard')).corpo.dati, null);
    const cancella = await chiedi('DELETE', '/utenti/iscrizione-pt');
    assert.equal(cancella.stato, 404);
    assert.equal(cancella.corpo.messaggio, 'Nessuna iscrizione attiva');
  });

  it('while it waits: the trainer, no appointments, no dashboard yet', async () => {
    await iscrizione('IN_ATTESA');
    await appuntamento(new Date(Date.now() + GIORNO));
    const { dati } = (await chiedi('GET', '/utenti/mio-pt')).corpo;
    assert.equal(dati.stato, 'IN_ATTESA');
    assert.equal(dati.trainer.nome, 'Coach Anna');
    assert.deepEqual(dati.prossimiAppuntamenti, []);
    assert.equal((await chiedi('GET', '/utenti/mio-pt/dashboard')).corpo.dati, null);
  });

  it('when active: the next five appointments still to do', async () => {
    await iscrizione('ATTIVA');
    for (let i = 7; i >= 1; i--) await appuntamento(new Date(Date.now() + i * GIORNO), { titolo: `Tra ${i}` });
    await appuntamento(new Date(Date.now() + GIORNO / 2), { completato: true });
    await appuntamento(new Date(Date.now() - GIORNO));

    const { dati } = (await chiedi('GET', '/utenti/mio-pt')).corpo;
    assert.deepEqual(dati.prossimiAppuntamenti.map(a => a.titolo), ['Tra 1', 'Tra 2', 'Tra 3', 'Tra 4', 'Tra 5']);
    assert.equal(dati.trainer._count.clientiComePT, 1);
  });

  it('the dashboard: announcements, future appointments and the counts', async () => {
    await iscrizione('ATTIVA');
    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    await prisma.annuncioPT.createMany({ data: [
      { trainerId: trainer.id, titolo: 'Chiuso lunedì', contenuto: 'Festa' },
      { trainerId: altroTrainer.id, titolo: 'Altro', contenuto: 'No' }
    ] });
    await appuntamento(new Date(Date.now() + GIORNO));
    await appuntamento(new Date(Date.now() - GIORNO), { completato: true });

    const { dati } = (await chiedi('GET', '/utenti/mio-pt/dashboard')).corpo;
    assert.equal(dati.trainer.id, trainer.id);
    assert.equal(dati.giorniIscritto, 0);
    assert.deepEqual(dati.annunci.map(a => a.titolo), ['Chiuso lunedì']);
    assert.equal(dati.appuntamenti.length, 1);
    assert.deepEqual(dati.statistiche, { appuntamentiCompletati: 1, schedeAssegnate: 0, appuntamentiFuturi: 1 });
  });

  it('cancelled, it ends, and a new request can be sent', async () => {
    await iscrizione('ATTIVA');
    const cancella = await chiedi('DELETE', '/utenti/iscrizione-pt');
    assert.equal(cancella.stato, 200);
    assert.equal(cancella.corpo.messaggio, 'Iscrizione terminata');
    const salvata = await prisma.iscrizionePT.findFirst({ where: { utenteId: utente.id } });
    assert.equal(salvata.stato, 'TERMINATA');
    assert.ok(salvata.dataRisposta);
    assert.equal((await chiedi('GET', '/utenti/mio-pt')).corpo.dati, null);

    const altroTrainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    assert.equal((await chiedi('POST', '/utenti/iscrizione-pt', { trainerId: altroTrainer.id })).stato, 201);
  });
});

describe('deleting your own account', () => {
  const PASSWORD = 'password-sicura-123';
  let io;
  beforeEach(async () => { io = await creaUtente({ password: PASSWORD }); });
  const elimina = (corpo, chi = io) => chiedi('DELETE', '/utenti/account', corpo, chi);

  it('needs the confirmation and the right password', async () => {
    for (const [corpo, stato, messaggio] of [
      [{ password: PASSWORD }, 400, 'Conferma mancante'],
      [{ conferma: 'elimina', password: PASSWORD }, 400, 'Conferma mancante'],
      [{ conferma: 'ELIMINA' }, 400, "Password richiesta per confermare l'eliminazione"],
      [{ conferma: 'ELIMINA', password: 'sbagliata' }, 403, 'Password non corretta']
    ]) {
      const risposta = await elimina(corpo);
      assert.deepEqual([risposta.stato, risposta.corpo.messaggio], [stato, messaggio], JSON.stringify(corpo));
    }
    assert.ok(await prisma.utente.findUnique({ where: { id: io.id } }));
  });

  it('the last admin cannot leave; with another admin they can', async () => {
    await prisma.utente.update({ where: { id: io.id }, data: { ruolo: 'SUPERADMIN' } });
    const adminIo = { ...io, ruolo: 'SUPERADMIN' };
    const unico = await elimina({ conferma: 'ELIMINA', password: PASSWORD }, adminIo);
    assert.equal(unico.stato, 403);
    assert.equal(unico.corpo.messaggio, "Sei l'unico amministratore: nominane un altro prima di eliminare l'account");

    await creaUtente({ ruolo: 'SUPERADMIN' });
    assert.equal((await elimina({ conferma: 'ELIMINA', password: PASSWORD }, adminIo)).stato, 200);
    assert.equal(await prisma.utente.findUnique({ where: { id: io.id } }), null);
  });

  it('with both, the account is gone', async () => {
    const risposta = await elimina({ conferma: 'ELIMINA', password: PASSWORD });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Account eliminato definitivamente');
    assert.equal(await prisma.utente.findUnique({ where: { id: io.id } }), null);
  });
});

describe('managing users, for the admin', () => {
  let admin;
  beforeEach(async () => { admin = await creaUtente({ ruolo: 'SUPERADMIN' }); });
  const comeAdmin = (metodo, percorso, corpo) => chiedi(metodo, percorso, corpo, admin);

  it('only the admin', async () => {
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });
    for (const [metodo, percorso] of [
      ['GET', '/utenti'], ['PATCH', `/utenti/${trainer.id}/approva`], ['PATCH', `/utenti/${trainer.id}/banna`],
      ['PATCH', `/utenti/${trainer.id}/ruolo`], ['DELETE', `/utenti/${trainer.id}`]
    ]) {
      const corpo = metodo === 'PATCH' ? { ruolo: 'SUPERADMIN' } : undefined;
      assert.equal((await chiedi(metodo, percorso, corpo, utente)).stato, 403, `${metodo} ${percorso}`);
      assert.equal((await chiedi(metodo, percorso, corpo, trainer)).stato, 403, `${metodo} ${percorso}`);
    }
    assert.equal((await prisma.utente.findUnique({ where: { id: trainer.id } })).ruolo, 'PERSONAL_TRAINER');
  });

  it('the list, newest first, by page and with filters', async () => {
    await prisma.utente.update({ where: { id: utente.id }, data: { dataRegistrazione: new Date(Date.now() - 3 * GIORNO) } });
    await prisma.utente.update({ where: { id: admin.id }, data: { dataRegistrazione: new Date(Date.now() - 2 * GIORNO) } });
    const attesa = await creaUtente({ stato: 'IN_ATTESA', dataRegistrazione: new Date(Date.now() - GIORNO) });
    const trainer = await creaUtente({ ruolo: 'PERSONAL_TRAINER' });

    const prima = (await comeAdmin('GET', '/utenti?pagina=1&limite=3')).corpo.dati;
    assert.deepEqual(prima.utenti.map(u => u.id), [trainer.id, attesa.id, admin.id]);
    assert.deepEqual(prima.paginazione, { pagina: 1, limite: 3, totale: 4, pagine: 2 });
    assert.equal(prima.utenti[0].passwordHash, undefined);
    assert.deepEqual((await comeAdmin('GET', '/utenti?pagina=2&limite=3')).corpo.dati.utenti.map(u => u.id), [utente.id]);

    assert.deepEqual((await comeAdmin('GET', '/utenti?stato=IN_ATTESA')).corpo.dati.utenti.map(u => u.id), [attesa.id]);
    assert.deepEqual((await comeAdmin('GET', '/utenti?ruolo=PERSONAL_TRAINER')).corpo.dati.utenti.map(u => u.id), [trainer.id]);
    assert.equal((await comeAdmin('GET', '/utenti')).corpo.dati.paginazione.limite, 20);
  });

  it('approving: a waiting or banned user becomes active; an active one cannot be approved', async () => {
    const attesa = await creaUtente({ stato: 'IN_ATTESA' });
    const bannato = await creaUtente({ stato: 'BANNATO' });
    for (const chi of [attesa, bannato]) {
      const risposta = await comeAdmin('PATCH', `/utenti/${chi.id}/approva`);
      assert.equal(risposta.stato, 200);
      assert.equal(risposta.corpo.messaggio, 'Utente approvato');
      assert.equal(risposta.corpo.dati.stato, 'ATTIVO');
    }
    const attivo = await comeAdmin('PATCH', `/utenti/${utente.id}/approva`);
    assert.equal(attivo.stato, 403);
    assert.equal(attivo.corpo.messaggio, 'Impossibile approvare un utente in stato: ATTIVO');
    assert.equal((await comeAdmin('PATCH', '/utenti/99999/approva')).stato, 404);
  });

  it('banning closes every session of the user; never an admin, never yourself', async () => {
    const PASSWORD = 'password-sicura-123';
    const vittima = await creaUtente({ password: PASSWORD });
    const accesso = await server.richiesta('POST', '/auth/login', { corpo: { email: vittima.email, password: PASSWORD } });
    const cookie = accesso.cookieRicevuti.find(c => c.startsWith('refreshToken=')).split(';')[0];

    const risposta = await comeAdmin('PATCH', `/utenti/${vittima.id}/banna`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Utente bannato');
    assert.equal(risposta.corpo.dati.stato, 'BANNATO');
    assert.equal((await server.richiesta('POST', '/auth/refresh', { cookie })).stato, 401);
    assert.equal((await server.richiesta('GET', '/utenti/profilo', { token: accesso.corpo.dati.accessToken })).stato, 401);

    const altroAdmin = await creaUtente({ ruolo: 'SUPERADMIN' });
    const suAdmin = await comeAdmin('PATCH', `/utenti/${altroAdmin.id}/banna`);
    assert.deepEqual([suAdmin.stato, suAdmin.corpo.messaggio], [403, 'Non puoi bannare un SuperAdmin']);
    const suSeStesso = await comeAdmin('PATCH', `/utenti/${admin.id}/banna`);
    assert.deepEqual([suSeStesso.stato, suSeStesso.corpo.messaggio], [400, 'Non puoi eseguire questa azione sul tuo stesso account']);
  });

  it('changing the role, not your own', async () => {
    const risposta = await comeAdmin('PATCH', `/utenti/${utente.id}/ruolo`, { ruolo: 'PERSONAL_TRAINER' });
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Ruolo aggiornato');
    assert.equal(risposta.corpo.dati.ruolo, 'PERSONAL_TRAINER');
    assert.equal((await comeAdmin('PATCH', `/utenti/${admin.id}/ruolo`, { ruolo: 'UTENTE' })).stato, 400);
    assert.equal((await prisma.utente.findUnique({ where: { id: admin.id } })).ruolo, 'SUPERADMIN');
    assert.equal((await comeAdmin('PATCH', '/utenti/99999/ruolo', { ruolo: 'UTENTE' })).stato, 404);
  });

  it('deleting a user; never an admin, never yourself', async () => {
    const risposta = await comeAdmin('DELETE', `/utenti/${utente.id}`);
    assert.equal(risposta.stato, 200);
    assert.equal(risposta.corpo.messaggio, 'Utente eliminato definitivamente');
    assert.equal(await prisma.utente.findUnique({ where: { id: utente.id } }), null);

    const altroAdmin = await creaUtente({ ruolo: 'SUPERADMIN' });
    assert.equal((await comeAdmin('DELETE', `/utenti/${altroAdmin.id}`)).stato, 403);
    assert.equal((await comeAdmin('DELETE', `/utenti/${admin.id}`)).stato, 400);
    assert.equal((await comeAdmin('DELETE', '/utenti/99999')).stato, 404);
  });
});
