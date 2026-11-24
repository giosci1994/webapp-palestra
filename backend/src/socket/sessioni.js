// ============================================
// GymMaster — Sockets of closed sessions
// ============================================
//
// The handshake checks the session once (autenticaSocket). When a session is
// closed later (logout, "sign out the other devices", a stolen session, a ban,
// a deleted account) its sockets are disconnected here, so they stop getting
// messages and presence. The services call these functions; inizializzaSocket
// registers the server. Without a server (scripts, unit tests) they do nothing.

let io = null;

/** @param {import('socket.io').Server|null} server */
export function registraIo(server) {
  io = server;
}

/** The connected sockets of a user (they all join the room utente:<id>) */
function socketDi(utenteId) {
  if (!io) return [];
  const ids = io.sockets.adapter.rooms.get(`utente:${utenteId}`);
  return [...(ids || [])].map(id => io.sockets.sockets.get(id)).filter(Boolean);
}

/**
 * Disconnects a user's sockets.
 * @param {number} utenteId
 * @param {object} [opzioni]
 * @param {string} [opzioni.famiglia] - only the sockets of this session
 * @param {string|null} [opzioni.tranne] - all but the sockets of this session
 * @returns {number} how many sockets were disconnected
 */
export function scollegaSessioni(utenteId, { famiglia, tranne } = {}) {
  let scollegati = 0;
  for (const socket of socketDi(utenteId)) {
    const sua = socket.utente?.famiglia == null ? null : String(socket.utente.famiglia);
    if (famiglia !== undefined && sua !== String(famiglia)) continue;
    if (tranne && sua === String(tranne)) continue;
    socket.disconnect(true);
    scollegati++;
  }
  return scollegati;
}
