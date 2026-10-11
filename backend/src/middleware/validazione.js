// ============================================
// GymMaster — Validation middleware with Zod
// Automatic validation of body, query and params
// ============================================

import { ErroreValidazione } from '../utils/errori.js';

/**
 * Creates a validation middleware based on a Zod schema.
 * Validates the request's body, query and/or params.
 *
 * @param {Object} schemi - Object with Zod schemas for body, query, params
 * @param {import('zod').ZodSchema} [schemi.body] - Schema for the body
 * @param {import('zod').ZodSchema} [schemi.query] - Schema for the query string
 * @param {import('zod').ZodSchema} [schemi.params] - Schema for the URL parameters
 * @returns {Function} Middleware Express
 *
 * @example
 * import { schemaLogin } from '../validators/autenticazione.schema.js';
 * router.post('/login', valida({ body: schemaLogin }), controller);
 */
export function valida(schemi) {
  return (req, res, next) => {
    const errori = [];

    // Validate body
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
        // Replace the body with the validated and sanitized data
        req.body = risultato.data;
      }
    }

    // Validate query
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

    // Validate params
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

    // If there are errors, reject the request
    if (errori.length > 0) {
      return next(new ErroreValidazione('Dati della richiesta non validi', errori));
    }

    next();
  };
}

/** Table ids are Postgres 32-bit integers */
const ID_MASSIMO = 2147483647;

/**
 * For router.param: an id in the URL must be a positive integer. Without this
 * check "abc" reached Prisma as NaN and the response was a 500.
 */
export function idNumerico(req, res, next, valore, nome) {
  if (!/^\d+$/.test(valore) || Number(valore) < 1 || Number(valore) > ID_MASSIMO) {
    return next(new ErroreValidazione(`Parametro "${nome}" non valido`));
  }
  next();
}
