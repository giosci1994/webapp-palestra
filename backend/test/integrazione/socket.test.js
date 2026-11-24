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
function finintoSocket(utenteId, { protetto = true } = {}) {
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
  return socket;
}

describe('WebSocket events with bad data', () => {
  const EVENTI = [
    'chat:invia_messaggio', 'chat:entra_conversazione', 'chat:esci_conversazione',
    'chat:sta_scrivendo', 'chat:smesso_scrivere', 'notifica:letta'
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
