// ============================================
// GymMaster — API Client
// Fetch wrapper with automatic JWT handling
// ============================================

import { linguaCorrente, traduci } from '../i18n/index.js';

const BASE_URL = '/api/v1';

/**
 * The phone's time zone ("Europe/Rome"), sent with every request: the server
 * uses it for the user's days, weeks and reminder hour (backend utils/date.js)
 */
function intestazioneFuso() {
  try {
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return fuso ? { 'X-Fuso-Orario': fuso } : {};
  } catch {
    return {};
  }
}

let accessToken = null;
let refreshPromise = null;
let onSessioneScaduta = null;

/** Sets the access token (called by the login) */
export function impostaToken(token) {
  accessToken = token;
}

/** Returns the current token */
export function ottieniToken() {
  return accessToken;
}

/** Clears the token (logout) */
export function cancellaToken() {
  accessToken = null;
}

/** Registers the handler to call when the session turns out to be expired for good */
export function impostaGestoreSessioneScaduta(fn) {
  onSessioneScaduta = fn;
}

/** Shared session refresh (deduplicated with the internal calls). Returns the token or null. */
export async function refreshSessione() {
  return tentaRefresh();
}

/**
 * Fetch wrapper with:
 * - Automatic Authorization header
 * - Automatic token refresh on 401
 * - Automatic JSON parsing
 * - Structured error handling
 * - Optional `signal` to abort the request (e.g. AbortSignal.timeout)
 */
export async function apiChiamata(percorso, opzioni = {}) {
  const { body, metodo = 'GET', headers = {}, skipAuth = false, signal } = opzioni;

  const config = {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      // The app's language, for the server's messages, and the phone's time zone
      'Accept-Language': linguaCorrente(),
      ...intestazioneFuso(),
      ...headers
    },
    credentials: 'include', // For the refresh token cookie
    signal
  };

  // If we have no token and this is not a skipAuth call,
  // try an automatic refresh (covers a race condition on page reload)
  if (!accessToken && !skipAuth) {
    const tokenRefreshato = await tentaRefresh();
    if (tokenRefreshato) {
      accessToken = tokenRefreshato;
    }
  }

  // Add the Authorization header if we have a token
  if (accessToken && !skipAuth) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  let risposta = await fetch(`${BASE_URL}${percorso}`, config);

  // On 401 (token expired/missing), try a refresh and retry
  if (risposta.status === 401 && !skipAuth) {
    const nuovoToken = await tentaRefresh();
    if (nuovoToken) {
      config.headers['Authorization'] = `Bearer ${nuovoToken}`;
      risposta = await fetch(`${BASE_URL}${percorso}`, config);
    } else {
      // Refresh failed on a protected route: the session really expired.
      // We don't let a cryptic error through ("Token di accesso mancante"):
      // we notify the app (redirect to login) and stop with a clear error.
      if (onSessioneScaduta) onSessioneScaduta();
      const err = new Error(traduci('api.sessioneScaduta'));
      err.codice = 'SESSIONE_SCADUTA';
      err.stato = 401;
      throw err;
    }
  }

  // Check the content-type before parsing JSON
  const contentType = risposta.headers.get('content-type');
  let dati;
  
  if (contentType && contentType.includes('application/json')) {
    dati = await risposta.json();
  } else {
    // If it is not JSON (e.g. an HTML block page from Cloudflare or Nginx)
    await risposta.text();
    if (!risposta.ok) {
      if (risposta.status === 429) {
        throw new Error(traduci('api.troppeRichieste'));
      } else if (risposta.status === 403) {
        throw new Error(traduci('api.accessoNegato'));
      } else {
        throw new Error(traduci('api.erroreServerCodice', { codice: risposta.status }));
      }
    } else {
      // 200 OK response but not JSON
      throw new Error(traduci('api.rispostaNonValida'));
    }
  }

  if (!risposta.ok) {
    const errore = new Error(dati.messaggio || traduci('api.erroreServer'));
    errore.codice = dati.codice;
    errore.stato = risposta.status;
    errore.dettagli = dati.dettagli;
    throw errore;
  }

  return dati;
}

/** Refreshes the access token */
async function tentaRefresh() {
  // Avoid multiple parallel refreshes
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const risposta = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!risposta.ok) {
        cancellaToken();
        return null;
      }

      const dati = await risposta.json();
      accessToken = dati.dati.accessToken;
      return accessToken;
    } catch {
      cancellaToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// --- Helper shortcuts ---

/**
 * Downloads a binary file protected by authentication.
 *
 * A plain <a href> would not be enough: the access token lives in memory and
 * not in a cookie, so the request has to go through here to carry the
 * Authorization header.
 */
export async function scaricaFile(percorso, nomePredefinito = 'documento') {
  if (!accessToken) {
    const iniziale = await tentaRefresh();
    if (iniziale) accessToken = iniziale;
  }

  const esegui = () => fetch(`${BASE_URL}${percorso}`, {
    method: 'GET',
    headers: {
      'Accept-Language': linguaCorrente(),
      ...intestazioneFuso(),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` })
    },
    credentials: 'include'
  });

  let risposta = await esegui();

  if (risposta.status === 401) {
    const nuovoToken = await tentaRefresh();
    if (!nuovoToken) {
      if (onSessioneScaduta) onSessioneScaduta();
      throw new Error(traduci('api.sessioneScaduta'));
    }
    accessToken = nuovoToken;
    risposta = await esegui();
  }

  if (!risposta.ok) {
    throw new Error(traduci('api.downloadFallito', { codice: risposta.status }));
  }

  // The name suggested by the server wins over the fallback one
  const disposizione = risposta.headers.get('content-disposition') || '';
  const nome = /filename="?([^"';]+)"?/i.exec(disposizione)?.[1] || nomePredefinito;

  const blob = await risposta.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Without revoke the blob would stay in memory for the whole session
    URL.revokeObjectURL(url);
  }
  return nome;
}

export const api = {
  get: (percorso) => apiChiamata(percorso),
  post: (percorso, body) => apiChiamata(percorso, { metodo: 'POST', body }),
  patch: (percorso, body) => apiChiamata(percorso, { metodo: 'PATCH', body }),
  put: (percorso, body) => apiChiamata(percorso, { metodo: 'PUT', body }),
  // The body is optional: it is for DELETEs that need a confirmation
  // (e.g. deleting the account, which asks for the password)
  delete: (percorso, body) => apiChiamata(percorso, { metodo: 'DELETE', body })
};
