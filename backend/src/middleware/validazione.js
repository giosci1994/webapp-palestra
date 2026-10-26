// ============================================
// GymMaster — Validation middleware with Zod
// Automatic validation of body, query and params
// ============================================

import { ErroreValidazione } from '../utils/errori.js';
import { t } from '../i18n/index.js';

/**
 * The text of a zod issue. The schemas write translation keys as messages
 * ('autenticazioneSchema.passwordCorta'): they become text in the request's
 * language. Zod's own default messages ("Required") are not keys and stay.
 */
const eUnaChiave = messaggio => /^\w+\.[\w.]+$/.test(messaggio);
const testoDelProblema = problema => (eUnaChiave(problema.message) ? t(problema.message) : problema.message);

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
            messaggio: testoDelProblema(e),
            origine: 'body',
            nostro: eUnaChiave(e.message)
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
            messaggio: testoDelProblema(e),
            origine: 'query',
            nostro: eUnaChiave(e.message)
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
            messaggio: testoDelProblema(e),
            origine: 'params',
            nostro: eUnaChiave(e.message)
          }))
        );
      } else {
        req.params = risultato.data;
      }
    }

    // If there are errors, reject the request. The app shows only the main
    // message: the first reason, when it is one of ours (translated), says
    // more than "invalid data"; zod's own ones are English only
    if (errori.length > 0) {
      const primo = errori.find(e => e.nostro);
      const dettagli = errori.map(({ nostro: _, ...errore }) => errore);
      return next(new ErroreValidazione(primo ? primo.messaggio : t('errori.validazione'), dettagli));
    }

    next();
  };
}

/** Table ids are Postgres 32-bit integers */
export const ID_MASSIMO = 2147483647;

/**
 * For router.param: an id in the URL must be a positive integer. Without this
 * check "abc" reached Prisma as NaN and the response was a 500.
 */
export function idNumerico(req, res, next, valore, nome) {
  if (!/^\d+$/.test(valore) || Number(valore) < 1 || Number(valore) > ID_MASSIMO) {
    return next(new ErroreValidazione(t('validazione.parametroNonValido', { nome })));
  }
  next();
}

/** True when a value, or anything inside it, is a text with a NUL character */
function haCarattereNullo(valore, profondita = 0) {
  if (typeof valore === 'string') return valore.includes('\u0000');
  if (valore === null || typeof valore !== 'object' || profondita > 20) return false;
  return Object.entries(valore).some(([chiave, interno]) => chiave.includes('\u0000') || haCarattereNullo(interno, profondita + 1));
}

/**
 * The database cannot store a NUL character ("\u0000") in a text: anywhere in
 * the body or in the query string it made the request a 500, whatever the
 * route. It is refused before the routes, with a 400.
 */
export function senzaCaratteriNulli(req, res, next) {
  if (haCarattereNullo(req.body) || haCarattereNullo(req.query)) {
    return next(new ErroreValidazione(t('validazione.carattereNullo')));
  }
  next();
}
