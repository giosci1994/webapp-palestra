// ============================================
// GymMaster — Custom Error Classes
// Structured error handling for the whole API
// ============================================

/**
 * Base error of the application.
 * Every custom error extends this class.
 */
export class ErroreApp extends Error {
  constructor(messaggio, codiceStato = 500, codice = 'ERRORE_INTERNO') {
    super(messaggio);
    this.codiceStato = codiceStato;
    this.codice = codice;
    this.nome = this.constructor.name;
  }
}

/** 400 — Invalid request */
export class ErroreValidazione extends ErroreApp {
  constructor(messaggio = 'Dati della richiesta non validi', dettagli = null) {
    super(messaggio, 400, 'VALIDAZIONE_FALLITA');
    this.dettagli = dettagli;
  }
}

/** 401 — Not authenticated */
export class ErroreNonAutenticato extends ErroreApp {
  constructor(messaggio = 'Autenticazione richiesta') {
    super(messaggio, 401, 'NON_AUTENTICATO');
  }
}

/** 403 — Not authorized */
export class ErroreNonAutorizzato extends ErroreApp {
  constructor(messaggio = 'Non hai i permessi per questa azione') {
    super(messaggio, 403, 'NON_AUTORIZZATO');
  }
}

/** 404 — Resource not found. The message is the whole sentence: "Scheda non trovata" */
export class ErroreNonTrovato extends ErroreApp {
  constructor(messaggio = 'Risorsa non trovata') {
    super(messaggio, 404, 'NON_TROVATO');
  }
}

/** 409 — Conflict (e.g. email already registered) */
export class ErroreConflitto extends ErroreApp {
  constructor(messaggio = 'Risorsa già esistente') {
    super(messaggio, 409, 'CONFLITTO');
  }
}

/** 429 — Too many requests */
export class ErroreTroppeRichieste extends ErroreApp {
  constructor(messaggio = 'Troppe richieste, riprova più tardi') {
    super(messaggio, 429, 'TROPPE_RICHIESTE');
  }
}
