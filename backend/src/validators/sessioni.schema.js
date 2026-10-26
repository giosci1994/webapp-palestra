// ============================================
// GymMaster — Workout validation schemas
// Zod schemas for starting a workout and for the history's query string
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.
//
// Zod drops the keys a schema does not list, so every field the handlers in
// controllers/sessioni.controller.js read is listed here.

import { z } from 'zod';
import { ID_MASSIMO } from '../middleware/validazione.js';
import { numero } from './schede.schema.js';

/** The body itself is not an object (a list, for example) */
const CORPO_NON_VALIDO = { invalid_type_error: 'sessioniSchema.corpoNonValido', required_error: 'sessioniSchema.corpoNonValido' };

/**
 * Schema for POST /sessioni. Without `schedaId` (and without `libero: true`)
 * the handler answers "schedaId is required": the schema only checks the types.
 */
export const schemaAvviaSessione = z.object({
  // An id as a number or as a numeric string; empty counts as not sent
  schedaId: numero('sessioniSchema.schedaIdNonValido', { min: 1, max: ID_MASSIMO, vuoto: 'assente' }).nullable().optional(),
  // Warm-up minutes (0 or empty = none)
  minutiRiscaldamento: numero('sessioniSchema.minutiRiscaldamentoNonValidi', { max: 600, vuoto: 'nullo' }).nullable().optional(),
  // Only a real `true` counts for these two (anything else is read as false):
  // any other value is not an error
  chiudiAperte: z.unknown(),
  libero: z.unknown()
}, CORPO_NON_VALIDO);

/** A page and a size of page: a missing one keeps its default, an empty one counts as missing */
const paginazione = {
  pagina: numero('sessioniSchema.paginaNonValida', { min: 1, max: 100000, vuoto: 'assente' }).optional(),
  limite: numero('sessioniSchema.limiteNonValido', { min: 1, max: 500, vuoto: 'assente' }).optional()
};

/** Schema for the query string of GET /sessioni */
export const schemaListaSessioni = z.object({ ...paginazione });

/** Schema for the query string of GET /sessioni/storico */
export const schemaStoricoSessioni = z.object({
  ...paginazione,
  // Filter by plan; empty means no filter
  schedaId: numero('sessioniSchema.schedaIdNonValido', { min: 1, max: ID_MASSIMO, vuoto: 'assente' }).optional()
});
