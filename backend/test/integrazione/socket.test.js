// The WebSocket: the handshake does the same checks as the REST API (an
// active user, an open session), and events with missing or wrong data
// cannot stop the server.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import jwt from 'jsonwebtoken';
import { prisma, svuotaDatabase } from '../supporto/database.js';
import { creaUtente } from '../supporto/dati.js';
import { autenticaSocket } from '../../src/socket/indice.js';
import { proteggiGestori } from '../../src/socket/protezione.js';
import { gestoreChatMessaggi } from '../../src/socket/gestori/chat.gestore.js';
import { gestoreNotifiche } from '../../src/socket/gestori/notifiche.gestore.js';
import { gestorePresenza, annunciaPresenza, contattiDi } from '../../src/socket/gestori/presenza.gestore.js';
import { registraIo, scollegaSessioni } from '../../src/socket/sessioni.js';
import { logoutUtente, chiudiSessione, chiudiAltreSessioni } from '../../src/services/autenticazione.service.js';
import { bannaUtente } from '../../src/services/utenti.service.js';
import { eliminaAccount } from '../../src/services/eliminazioneAccount.service.js';
import { nuovoToken, improntaToken } from '../../src/utils/token.js';

after(() => prisma.$disconnect());
beforeEach(() => svuotaDatabase());

const firma = (utente, famiglia) => jwt.sign(
  { utenteId: utente.id, email: utente.email, ruolo: utente.ruolo, ...(famiglia && { famiglia }) },
  process.env.JWT_SEGRETO_ACCESS,
  { expiresIn: '15m' }
);

const apriSessione = (utente, famiglia, revocato = false) => prisma.refreshToken.create({
  data: { token: `impronta-${famiglia}`, utenteId: utente.id, famiglia, revocato, scadenza: new Date(Date.now() + 86400000) }
});

/** Runs the handshake middleware: undefined when it lets the socket in, the error otherwise */
async function handshake(token) {
  const socket = { handshake: { auth: token ? { token } : {}, headers: { 'accept-language': 'it' } } };
  const esito = await new Promise(risolvi => autenticaSocket(socket, risolvi));
  return { errore: esito, socket };
}

describe('WebSocket handshake', () => {
  it('lets in an active user with an open session', async () => {
    const utente = await creaUtente();
    await apriSessione(utente, 'f1');
    const { errore, socket } = await handshake(firma(utente, 'f1'));
    assert.equal(errore, undefined);
    assert.equal(socket.utente.utenteId, utente.id);
  });

  it('refuses a missing or forged token', async () => {
    assert.ok((await handshake(null)).errore instanceof Error);
    const falso = jwt.sign({ utenteId: 1 }, 'un-altro-segreto');
    assert.ok((await handshake(falso)).errore instanceof Error);
  });

  it('refuses a closed session', async () => {
    const utente = await creaUtente();
    await apriSessione(utente, 'chiusa', true);
    const { errore } = await handshake(firma(utente, 'chiusa'));
    assert.ok(errore instanceof Error);
  });

  it('refuses a banned or deleted user', async () => {
    const bannato = await creaUtente({ stato: 'BANNATO' });
    assert.ok((await handshake(firma(bannato))).errore instanceof Error);
    const sparito = await creaUtente();
    const token = firma(sparito);
    await prisma.utente.delete({ where: { id: sparito.id } });
    assert.ok((await handshake(token)).errore instanceof Error);
  });
});

/** A socket stand-in: the handlers are registered on it as on a real one */
function finintoSocket(utenteId, { protetto = true, connessi = new Map() } = {}) {
  const socket = new EventEmitter();
  socket.utente = { utenteId };
  socket.rooms = new Set();
  socket.inviati = [];
  socket.join = stanza => socket.rooms.add(stanza);
  socket.leave = stanza => socket.rooms.delete(stanza);
  socket.to = stanza => ({ emit: (evento, dati) => socket.inviati.push({ stanza, evento, dati }) });
  const io = { to: () => ({ emit: () => {} }) };
  if (protetto) proteggiGestori(socket);
  gestoreChatMessaggi(io, socket, new Map());
  gestoreNotifiche(io, socket, new Map());
  gestorePresenza(io, socket, connessi);
  return socket;
}

describe('WebSocket events with bad data', () => {
  const EVENTI = [
    'chat:invia_messaggio', 'chat:entra_conversazione', 'chat:esci_conversazione',
    'chat:sta_scrivendo', 'chat:smesso_scrivere', 'notifica:letta', 'presenza:richiedi'
  ];

  it('no event crashes without data, with null or with a string', async () => {
    const utente = await creaUtente();
    // Without the safety net: the handlers themselves must hold
    const socket = finintoSocket(utente.id, { protetto: false });
    for (const evento of EVENTI) {
      for (const dati of [undefined, null, 'testo', 42]) {
        assert.doesNotThrow(() => socket.emit(evento, dati), `${evento} con ${dati}`);
      }
    }
    // The async handlers finish without unhandled rejections
    await new Promise(risolvi => setTimeout(risolvi, 200));
    assert.deepEqual(socket.inviati, []);
  });

  it('a handler that throws is logged, not raised', async () => {
    const socket = new EventEmitter();
    proteggiGestori(socket);
    socket.on('rotto', () => { throw new Error('rotto'); });
    socket.on('rotto-async', async () => { throw new Error('rotto'); });
    assert.doesNotThrow(() => socket.emit('rotto'));
    assert.doesNotThrow(() => socket.emit('rotto-async'));
  });

  it('typing reaches only a conversation the user has joined', async () => {
    const utente = await creaUtente();
    const altro = await creaUtente();
    const conversazione = await prisma.conversazione.create({
      data: { partecipanti: { create: [{ utenteId: utente.id }, { utenteId: altro.id }] } }
    });
    const estranea = await prisma.conversazione.create({
      data: { partecipanti: { create: [{ utenteId: altro.id }] } }
    });
    const socket = finintoSocket(utente.id);

    socket.emit('chat:sta_scrivendo', { conversazioneId: estranea.id });
    socket.emit('chat:entra_conversazione', { conversazioneId: estranea.id });
    await new Promise(risolvi => setTimeout(risolvi, 100));
    socket.emit('chat:sta_scrivendo', { conversazioneId: estranea.id });
    assert.deepEqual(socket.inviati, []);

    socket.emit('chat:entra_conversazione', { conversazioneId: conversazione.id });
    await new Promise(risolvi => setTimeout(risolvi, 100));
    socket.emit('chat:sta_scrivendo', { conversazioneId: conversazione.id });
    socket.emit('chat:smesso_scrivere', { conversazioneId: conversazione.id });
    assert.deepEqual(socket.inviati.map(i => i.evento), ['chat:sta_scrivendo', 'chat:smesso_scrivere']);
    assert.equal(socket.inviati[0].stanza, `conversazione:${conversazione.id}`);
  });
});

const attendi = ms => new Promise(risolvi => setTimeout(risolvi, ms));

/** Two users who share a conversation, and a third who shares none with them */
async function dueContattiEUnEstraneo() {
  const anna = await creaUtente();
  const bruno = await creaUtente();
  const estraneo = await creaUtente();
  await prisma.conversazione.create({
    data: { partecipanti: { create: [{ utenteId: anna.id }, { utenteId: bruno.id }] } }
  });
  // A conversation of the stranger with nobody else does not make anyone a contact
  await prisma.conversazione.create({ data: { partecipanti: { create: [{ utenteId: estraneo.id }] } } });
  return { anna, bruno, estraneo };
}

describe('presence only between people who share a conversation', () => {
  it('the contacts of a user are the other participants of their conversations', async () => {
    const { anna, bruno, estraneo } = await dueContattiEUnEstraneo();
    assert.deepEqual(await contattiDi(anna.id), [bruno.id]);
    assert.deepEqual(await contattiDi(estraneo.id), []);
  });

  it('going online or offline reaches only the contacts, with the state at the time it leaves', async () => {
    const { anna, bruno } = await dueContattiEUnEstraneo();
    const inviati = [];
    const io = { to: stanze => ({ emit: (evento, dati) => inviati.push({ stanze, evento, dati }) }) };
    const connessi = new Map([[anna.id, new Set(['s1'])]]);

    await annunciaPresenza(io, anna.id, connessi);
    connessi.delete(anna.id);
    await annunciaPresenza(io, anna.id, connessi);
    assert.deepEqual(inviati, [
      { stanze: [`utente:${bruno.id}`], evento: 'presenza:cambio', dati: { utenteId: anna.id, online: true } },
      { stanze: [`utente:${bruno.id}`], evento: 'presenza:cambio', dati: { utenteId: anna.id, online: false } }
    ]);
  });

  it('a stranger asking for the presence of a user gets no answer; a contact does', async () => {
    const { anna, bruno, estraneo } = await dueContattiEUnEstraneo();
    const connessi = new Map([[anna.id, new Set(['s1'])]]);

    const curioso = finintoSocket(estraneo.id, { connessi });
    const rispostePerCurioso = [];
    curioso.on('presenza:cambio', dati => rispostePerCurioso.push(dati));
    curioso.emit('presenza:richiedi', { utenteId: anna.id });

    const contatto = finintoSocket(bruno.id, { connessi });
    const rispostePerContatto = [];
    contatto.on('presenza:cambio', dati => rispostePerContatto.push(dati));
    contatto.emit('presenza:richiedi', { utenteId: anna.id });
    contatto.emit('presenza:richiedi', { utenteId: String(anna.id) });

    await attendi(200);
    assert.deepEqual(rispostePerCurioso, []);
    assert.deepEqual(rispostePerContatto, [{ utenteId: anna.id, online: true, ultimoAccesso: null }]);
  });
});

/**
 * A Socket.io server stand-in with the rooms and sockets scollegaSessioni
 * reads: each socket joins utente:<id>, as on a real connection.
 */
function finintoIo() {
  const stanze = new Map();
  const sockets = new Map();
  const collega = (utenteId, famiglia) => {
    const socket = { id: `s${sockets.size + 1}`, utente: { utenteId, famiglia }, scollegato: false };
    socket.disconnect = () => { socket.scollegato = true; };
    sockets.set(socket.id, socket);
    const stanza = `utente:${utenteId}`;
    if (!stanze.has(stanza)) stanze.set(stanza, new Set());
    stanze.get(stanza).add(socket.id);
    return socket;
  };
  return { io: { sockets: { adapter: { rooms: stanze }, sockets } }, collega };
}

describe('closing a session disconnects its sockets', () => {
  let io;
  let collega;
  beforeEach(() => {
    ({ io, collega } = finintoIo());
    registraIo(io);
  });
  after(() => registraIo(null));

  it('logout: only the sockets of that session', async () => {
    const utente = await creaUtente();
    const token = nuovoToken();
    await prisma.refreshToken.create({
      data: { token: improntaToken(token), utenteId: utente.id, famiglia: 'telefono', scadenza: new Date(Date.now() + 86400000) }
    });
    const telefono = collega(utente.id, 'telefono');
    const computer = collega(utente.id, 'computer');
    const altri = collega((await creaUtente()).id, 'telefono');

    await logoutUtente(token);
    assert.deepEqual([telefono.scollegato, computer.scollegato, altri.scollegato], [true, false, false]);
  });

  it('closing another device, and closing all the others', async () => {
    const utente = await creaUtente();
    for (const famiglia of ['telefono', 'computer', 'tablet']) await apriSessione(utente, famiglia);
    const telefono = collega(utente.id, 'telefono');
    const computer = collega(utente.id, 'computer');
    const tablet = collega(utente.id, 'tablet');

    await chiudiSessione(utente.id, 'computer');
    assert.deepEqual([telefono.scollegato, computer.scollegato, tablet.scollegato], [false, true, false]);

    await chiudiAltreSessioni(utente.id, 'telefono');
    assert.deepEqual([telefono.scollegato, tablet.scollegato], [false, true]);
  });

  it('a ban and a deleted account: all the sockets of the user', async () => {
    const bannato = await creaUtente();
    const primo = collega(bannato.id, 'a');
    const secondo = collega(bannato.id);
    await bannaUtente(bannato.id);
    assert.deepEqual([primo.scollegato, secondo.scollegato], [true, true]);

    const eliminato = await creaUtente();
    const suo = collega(eliminato.id, 'b');
    await eliminaAccount(eliminato.id);
    assert.equal(suo.scollegato, true);
  });

  it('without a server it does nothing', () => {
    registraIo(null);
    assert.equal(scollegaSessioni(1), 0);
  });
});
