// ============================================
// GymMaster — Test: l'app in ascolto
// ============================================
//
// L'app vera (src/app.js) su una porta libera di localhost, e richiesta() per
// parlarle via HTTP come fa il frontend.

import { prisma } from './database.js';
import { creaServer } from '../../src/app.js';
import redis from '../../src/config/redis.js';

let ultimoIp = 0;

/**
 * Un indirizzo nuovo a ogni richiesta, passato come CF-Connecting-IP (come
 * dietro Cloudflare): il limite dei tentativi di accesso conta per indirizzo e
 * un test non deve consumare quelli di un altro. Chi prova proprio il limite
 * passa lo stesso ip a ogni richiesta.
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
   * @param {string} percorso - dopo /api/v1, per esempio '/sessioni/3'
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
    // io.close() chiude anche il server HTTP
    await new Promise(risolvi => io.close(risolvi));
    await prisma.$disconnect();
    redis.disconnect();
  }

  return { richiesta, chiudi };
}
