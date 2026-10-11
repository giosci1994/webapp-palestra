// ============================================
// GymMaster — Test: the listening app
// ============================================
//
// The real app (src/app.js) on a free localhost port, and richiesta() to talk
// to it over HTTP as the frontend does.

import { prisma } from './database.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';

let ultimoIp = 0;

/**
 * A new address for every request, passed as CF-Connecting-IP (as behind
 * Cloudflare): the sign-in attempt limit counts per address, and one test must
 * not use up another's attempts. A test of the limit itself passes the same ip
 * on every request.
 */
function nuovoIp() {
  ultimoIp++;
  return `10.${(ultimoIp >> 16) & 255}.${(ultimoIp >> 8) & 255}.${ultimoIp & 255}`;
}

export async function avviaServer() {
  const { serverHttp, io } = creaServer();
  await new Promise(risolvi => serverHttp.listen(0, '127.0.0.1', risolvi));
  const base = `http://127.0.0.1:${serverHttp.address().port}/api/v1`;

  /**
   * @param {string} metodo
   * @param {string} percorso - after /api/v1, for example '/sessioni/3'
   * @param {{ token?: string, corpo?: any, cookie?: string, ip?: string, userAgent?: string }} [opzioni]
   * @returns {Promise<{ stato: number, corpo: any, testo: string, intestazioni: Headers, cookieRicevuti: string[] }>}
   */
  async function richiesta(metodo, percorso, { token, corpo, cookie, ip = nuovoIp(), userAgent } = {}) {
    const intestazioni = { 'cf-connecting-ip': ip };
    if (userAgent) intestazioni['user-agent'] = userAgent;
    if (token) intestazioni.authorization = `Bearer ${token}`;
    if (cookie) intestazioni.cookie = cookie;
    if (corpo !== undefined) intestazioni['content-type'] = 'application/json';

    const risposta = await fetch(base + percorso, {
      method: metodo,
      headers: intestazioni,
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const testo = await risposta.text();
    return {
      stato: risposta.status,
      corpo: testo ? JSON.parse(testo) : null,
      testo,
      intestazioni: risposta.headers,
      cookieRicevuti: risposta.headers.getSetCookie()
    };
  }

  async function chiudi() {
    // io.close() also closes the HTTP server
    await new Promise(risolvi => io.close(risolvi));
    await prisma.$disconnect();
    redis.disconnect();
  }

  return { richiesta, chiudi };
}
