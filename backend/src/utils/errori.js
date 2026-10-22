// ============================================
// GymMaster — Custom Error Classes
// Structured error handling for the whole API
// ============================================
//
// Messages are in the request's language: pass t('<namespace>.<key>') when
// throwing. The defaults below are translated when the error is created.

import { traduci } from '../i18n/index.js';

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
  constructor(messaggio = traduci('errori.validazione'), dettagli = null) {
    super(messaggio, 400, 'VALIDAZIONE_FALLITA');
    this.dettagli = dettagli;
  }
}

/** 401 — Not authenticated */
export class ErroreNonAutenticato extends ErroreApp {
  /** @param {string} [codice] - a more precise code the app acts on, e.g. EMAIL_NON_VERIFICATA */
  constructor(messaggio = traduci('errori.nonAutenticato'), codice = 'NON_AUTENTICATO') {
    super(messaggio, 401, codice);
  }
}

/** 403 — Not authorized */
export class ErroreNonAutorizzato extends ErroreApp {
  constructor(messaggio = traduci('errori.nonAutorizzato')) {
    super(messaggio, 403, 'NON_AUTORIZZATO');
  }
}

/** 404 — Resource not found. The message is the whole sentence: "Scheda non trovata" */
export class ErroreNonTrovato extends ErroreApp {
  constructor(messaggio = traduci('errori.nonTrovato')) {
    super(messaggio, 404, 'NON_TROVATO');
  }
}

/** 409 — Conflict (e.g. email already registered) */
export class ErroreConflitto extends ErroreApp {
  /**
   * @param {string} [codice] - a code of its own, for the app to tell this conflict from others
   * @param {object} [dettagli] - what the app needs to solve it
   */
  constructor(messaggio = traduci('errori.conflitto'), { codice = 'CONFLITTO', dettagli = null } = {}) {
    super(messaggio, 409, codice);
    this.dettagli = dettagli;
  }
}

/** 429 — Too many requests */
export class ErroreTroppeRichieste extends ErroreApp {
  constructor(messaggio = traduci('errori.troppeRichieste')) {
    super(messaggio, 429, 'TROPPE_RICHIESTE');
  }
}
