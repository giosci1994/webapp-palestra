// ============================================
// GymMaster — Classi Errore Personalizzate
// Gestione errori strutturata per tutta l'API
// ============================================

/**
 * Errore base dell'applicazione.
 * Tutti gli errori personalizzati estendono questa classe.
 */
export class ErroreApp extends Error {
  constructor(messaggio, codiceStato = 500, codice = 'ERRORE_INTERNO') {
    super(messaggio);
    this.codiceStato = codiceStato;
    this.codice = codice;
    this.nome = this.constructor.name;
  }
}

/** 400 — Richiesta non valida */
export class ErroreValidazione extends ErroreApp {
  constructor(messaggio = 'Dati della richiesta non validi', dettagli = null) {
    super(messaggio, 400, 'VALIDAZIONE_FALLITA');
    this.dettagli = dettagli;
  }
}

/** 401 — Non autenticato */
export class ErroreNonAutenticato extends ErroreApp {
  constructor(messaggio = 'Autenticazione richiesta') {
    super(messaggio, 401, 'NON_AUTENTICATO');
  }
}

/** 403 — Non autorizzato */
export class ErroreNonAutorizzato extends ErroreApp {
  constructor(messaggio = 'Non hai i permessi per questa azione') {
    super(messaggio, 403, 'NON_AUTORIZZATO');
  }
}

/** 404 — Risorsa non trovata */
export class ErroreNonTrovato extends ErroreApp {
  constructor(risorsa = 'Risorsa') {
    super(`${risorsa} non trovato/a`, 404, 'NON_TROVATO');
  }
}

/** 409 — Conflitto (es. email già registrata) */
export class ErroreConflitto extends ErroreApp {
  constructor(messaggio = 'Risorsa già esistente') {
    super(messaggio, 409, 'CONFLITTO');
  }
}

/** 429 — Troppe richieste */
export class ErroreTroppeRichieste extends ErroreApp {
  constructor(messaggio = 'Troppe richieste, riprova più tardi') {
    super(messaggio, 429, 'TROPPE_RICHIESTE');
  }
}
