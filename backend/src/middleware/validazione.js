// ============================================
// GymMaster — Middleware Validazione con Zod
// Validazione automatica di body, query e params
// ============================================

import { ErroreValidazione } from '../utils/errori.js';

/**
 * Crea un middleware di validazione basato su uno schema Zod.
 * Valida body, query e/o params della richiesta.
 *
 * @param {Object} schemi - Oggetto con schemi Zod per body, query, params
 * @param {import('zod').ZodSchema} [schemi.body] - Schema per il body
 * @param {import('zod').ZodSchema} [schemi.query] - Schema per la query string
 * @param {import('zod').ZodSchema} [schemi.params] - Schema per i parametri URL
 * @returns {Function} Middleware Express
 *
 * @example
 * import { schemaLogin } from '../validators/autenticazione.schema.js';
 * router.post('/login', valida({ body: schemaLogin }), controller);
 */
export function valida(schemi) {
  return (req, res, next) => {
    const errori = [];

    // Valida body
    if (schemi.body) {
      const risultato = schemi.body.safeParse(req.body);
      if (!risultato.success) {
        errori.push(
          ...risultato.error.errors.map(e => ({
            campo: e.path.join('.'),
            messaggio: e.message,
            origine: 'body'
          }))
        );
      } else {
        // Sostituisci il body con i dati validati e sanitizzati
        req.body = risultato.data;
      }
    }

    // Valida query
    if (schemi.query) {
      const risultato = schemi.query.safeParse(req.query);
      if (!risultato.success) {
        errori.push(
          ...risultato.error.errors.map(e => ({
            campo: e.path.join('.'),
            messaggio: e.message,
            origine: 'query'
          }))
        );
      } else {
        req.query = risultato.data;
      }
    }

    // Valida params
    if (schemi.params) {
      const risultato = schemi.params.safeParse(req.params);
      if (!risultato.success) {
        errori.push(
          ...risultato.error.errors.map(e => ({
            campo: e.path.join('.'),
            messaggio: e.message,
            origine: 'params'
          }))
        );
      } else {
        req.params = risultato.data;
      }
    }

    // Se ci sono errori, rifiuta la richiesta
    if (errori.length > 0) {
      return next(new ErroreValidazione('Dati della richiesta non validi', errori));
    }

    next();
  };
}
