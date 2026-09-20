// ============================================
// GymMaster — API Client
// Fetch wrapper con gestione JWT automatica
// ============================================

const BASE_URL = '/api/v1';

let accessToken = null;
let refreshPromise = null;
let onSessioneScaduta = null;

/** Imposta il token di accesso (chiamato dal login) */
export function impostaToken(token) {
  accessToken = token;
}

/** Recupera il token corrente */
export function ottieniToken() {
  return accessToken;
}

/** Cancella il token (logout) */
export function cancellaToken() {
  accessToken = null;
}

/** Registra il gestore da invocare quando la sessione risulta definitivamente scaduta */
export function impostaGestoreSessioneScaduta(fn) {
  onSessioneScaduta = fn;
}

/** Refresh condiviso della sessione (dedup con le chiamate interne). Ritorna il token o null. */
export async function refreshSessione() {
  return tentaRefresh();
}

/**
 * Fetch wrapper con:
 * - Header Authorization automatico
 * - Refresh token automatico se 401
 * - Parsing JSON automatico
 * - Gestione errori strutturata
 */
export async function apiChiamata(percorso, opzioni = {}) {
  const { body, metodo = 'GET', headers = {}, skipAuth = false } = opzioni;

  const config = {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    credentials: 'include' // Per cookie refresh token
  };

  // Se non abbiamo un token e non è una chiamata skipAuth,
  // tenta un refresh automatico (copre race condition al refresh pagina)
  if (!accessToken && !skipAuth) {
    const tokenRefreshato = await tentaRefresh();
    if (tokenRefreshato) {
      accessToken = tokenRefreshato;
    }
  }

  // Aggiungi Authorization header se abbiamo un token
  if (accessToken && !skipAuth) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  let risposta = await fetch(`${BASE_URL}${percorso}`, config);

  // Se 401 (token scaduto/mancante), prova refresh e riprova
  if (risposta.status === 401 && !skipAuth) {
    const nuovoToken = await tentaRefresh();
    if (nuovoToken) {
      config.headers['Authorization'] = `Bearer ${nuovoToken}`;
      risposta = await fetch(`${BASE_URL}${percorso}`, config);
    } else {
      // Refresh fallito su una rotta protetta: sessione realmente scaduta.
      // Non lasciamo che parta un errore criptico ("Token di accesso mancante"):
      // notifichiamo l'app (redirect al login) e interrompiamo con un errore chiaro.
      if (onSessioneScaduta) onSessioneScaduta();
      const err = new Error('Sessione scaduta. Accedi di nuovo per continuare.');
      err.codice = 'SESSIONE_SCADUTA';
      err.stato = 401;
      throw err;
    }
  }

  // Controlla il content-type prima di fare il parsing JSON
  const contentType = risposta.headers.get('content-type');
  let dati;
  
  if (contentType && contentType.includes('application/json')) {
    dati = await risposta.json();
  } else {
    // Se non è JSON (es. pagina di blocco HTML da Cloudflare o Nginx)
    const testoSconosciuto = await risposta.text();
    if (!risposta.ok) {
      if (risposta.status === 429) {
        throw new Error('Troppe richieste o IP temporaneamente bloccato dai sistemi di sicurezza.');
      } else if (risposta.status === 403) {
        throw new Error('Accesso negato. Il traffico potrebbe essere stato bloccato dal firewall.');
      } else {
        throw new Error(`Errore del server (${risposta.status}). Riprova più tardi.`);
      }
    } else {
      // Risposta 200 OK ma non JSON
      throw new Error('Risposta dal server non valida (formato non supportato).');
    }
  }

  if (!risposta.ok) {
    const errore = new Error(dati.messaggio || 'Errore del server');
    errore.codice = dati.codice;
    errore.stato = risposta.status;
    errore.dettagli = dati.dettagli;
    throw errore;
  }

  return dati;
}

/** Refresh del token di accesso */
async function tentaRefresh() {
  // Evita refresh multipli paralleli
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
 * Scarica un file binario protetto da autenticazione.
 *
 * Un semplice <a href> non basterebbe: il token di accesso vive in memoria e
 * non in un cookie, quindi la richiesta deve passare da qui per portarsi
 * dietro l'header Authorization.
 */
export async function scaricaFile(percorso, nomePredefinito = 'documento') {
  if (!accessToken) {
    const iniziale = await tentaRefresh();
    if (iniziale) accessToken = iniziale;
  }

  const esegui = () => fetch(`${BASE_URL}${percorso}`, {
    method: 'GET',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include'
  });

  let risposta = await esegui();

  if (risposta.status === 401) {
    const nuovoToken = await tentaRefresh();
    if (!nuovoToken) {
      if (onSessioneScaduta) onSessioneScaduta();
      throw new Error('Sessione scaduta. Accedi di nuovo per continuare.');
    }
    accessToken = nuovoToken;
    risposta = await esegui();
  }

  if (!risposta.ok) {
    throw new Error(`Download non riuscito (errore ${risposta.status})`);
  }

  // Il nome proposto dal server ha la precedenza su quello di riserva
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
    // Senza revoke il blob resterebbe in memoria per tutta la sessione
    URL.revokeObjectURL(url);
  }
  return nome;
}

export const api = {
  get: (percorso) => apiChiamata(percorso),
  post: (percorso, body) => apiChiamata(percorso, { metodo: 'POST', body }),
  patch: (percorso, body) => apiChiamata(percorso, { metodo: 'PATCH', body }),
  put: (percorso, body) => apiChiamata(percorso, { metodo: 'PUT', body }),
  // Il body e' facoltativo: serve alle DELETE che richiedono una conferma
  // (es. l'eliminazione dell'account, che vuole la password)
  delete: (percorso, body) => apiChiamata(percorso, { metodo: 'DELETE', body })
};
