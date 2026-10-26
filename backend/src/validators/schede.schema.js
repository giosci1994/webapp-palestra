// ============================================
// GymMaster — Workout plan validation schemas
// Zod schemas for creating and editing plans and the exercises in them
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.
//
// Zod drops the keys a schema does not list, so every field the handlers in
// controllers/schede.controller.js read is listed here, even the loosest.

import { z } from 'zod';
import { ID_MASSIMO } from '../middleware/validazione.js';

/**
 * A number that may arrive as a number or as a numeric string ("5"). Anything
 * else (text, an object, a list, NaN, out of range) is refused with
 * `messaggio`: without this check it reached the database and ended in a 500.
 * Missing (undefined/null) is the job of .optional()/.nullable() around it.
 *
 * @param {string} messaggio - translation key when the value is not valid
 * @param {object} [opzioni]
 * @param {number} [opzioni.min] - smallest value allowed
 * @param {number} [opzioni.max] - largest value allowed (default: the largest id)
 * @param {boolean} [opzioni.intero] - whole numbers only (default true)
 * @param {string} [opzioni.obbligatorio] - translation key when the value is missing:
 *   without it a missing value is not an error here
 * @param {'errore'|'nullo'|'assente'} [opzioni.vuoto] - what an empty string means:
 *   an error (default), null, or "not sent" (undefined)
 */
export function numero(messaggio, { min = 0, max = ID_MASSIMO, intero = true, obbligatorio, vuoto = 'errore' } = {}) {
  return z.unknown().transform((valore, ctx) => {
    if (obbligatorio && (valore === undefined || valore === null || (valore === '' && vuoto === 'errore'))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: obbligatorio });
      return z.NEVER;
    }
    if (valore === '' && vuoto !== 'errore') return vuoto === 'nullo' ? null : undefined;

    const n = typeof valore === 'string' && /^-?\d+(\.\d+)?$/.test(valore) ? Number(valore) : valore;
    if (typeof n !== 'number' || !Number.isFinite(n) || (intero && !Number.isInteger(n)) || n < min || n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: messaggio });
      return z.NEVER;
    }
    return n;
  });
}

/** An optional number: absent, null or empty means "no value" (the handler picks a default) */
const numeroFacoltativo = (messaggio, opzioni) => numero(messaggio, { ...opzioni, vuoto: 'nullo' }).nullable().optional();

/** Optional text, null allowed */
const testoFacoltativo = messaggio => z.string({ invalid_type_error: messaggio }).nullable().optional();

/** The body itself is not an object (a list, for example) */
const CORPO_NON_VALIDO = { invalid_type_error: 'schedeSchema.corpoNonValido', required_error: 'schedeSchema.corpoNonValido' };

const LIVELLI = ['BASE', 'INTERMEDIO', 'AVANZATO'];
const VISIBILITA = ['PERSONALE', 'GLOBALE'];

/** One of the allowed values; on creation null and '' mean "not sent" (the default applies) */
const unoDi = (valori, messaggio, { vuotoAmmesso }) => {
  const scelta = z.enum(valori, { errorMap: () => ({ message: messaggio }) }).optional();
  return vuotoAmmesso ? z.preprocess(v => (v === null || v === '' ? undefined : v), scelta) : scelta;
};

/** An exercise inside a plan, as the plan editor sends it (cardio fields included) */
const schemaEsercizioInScheda = z.object({
  esercizioId: numero('schedeSchema.esercizioIdNonValido', { min: 1, obbligatorio: 'schedeSchema.esercizioIdObbligatorio' }),
  serieTarget: numeroFacoltativo('schedeSchema.serieTargetNonValido', { max: 1000 }),
  repTarget: testoFacoltativo('schedeSchema.repTargetNonValido'),
  recuperoSecondi: numeroFacoltativo('schedeSchema.recuperoSecondiNonValido', { max: 86400 }),
  note: testoFacoltativo('schedeSchema.noteNonValide'),
  // Any value: the handler only asks whether it is truthy
  riscaldamento: z.unknown(),
  durataMinuti: numeroFacoltativo('schedeSchema.durataMinutiNonValida', { max: 1440 }),
  velocitaKmh: numeroFacoltativo('schedeSchema.velocitaKmhNonValida', { max: 200, intero: false }),
  inclinazione: numeroFacoltativo('schedeSchema.inclinazioneNonValida', { min: -100, max: 100, intero: false }),
  livelloResistenza: numeroFacoltativo('schedeSchema.livelloResistenzaNonValido', { max: 1000 }),
  distanzaKm: numeroFacoltativo('schedeSchema.distanzaKmNonValida', { max: 10000, intero: false })
}, { invalid_type_error: 'schedeSchema.esercizioNonValido', required_error: 'schedeSchema.esercizioNonValido' });

const elencoEsercizi = z
  .array(schemaEsercizioInScheda, { invalid_type_error: 'schedeSchema.eserciziNonValidi' })
  .nullable()
  .optional();

/**
 * Schema for POST /schede. The title is checked by the handler ("title is
 * required"): here only its type.
 */
export const schemaCreaScheda = z.object({
  titolo: testoFacoltativo('schedeSchema.titoloNonValido'),
  descrizione: testoFacoltativo('schedeSchema.descrizioneNonValida'),
  livello: unoDi(LIVELLI, 'schedeSchema.livelloNonValido', { vuotoAmmesso: true }),
  visibilita: unoDi(VISIBILITA, 'schedeSchema.visibilitaNonValida', { vuotoAmmesso: true }),
  esercizi: elencoEsercizi
}, CORPO_NON_VALIDO);

/** Schema for PUT /schede/:id: what is not sent stays as it is */
export const schemaAggiornaScheda = z.object({
  titolo: z.string({ invalid_type_error: 'schedeSchema.titoloNonValido' }).optional(),
  descrizione: testoFacoltativo('schedeSchema.descrizioneNonValida'),
  livello: unoDi(LIVELLI, 'schedeSchema.livelloNonValido', { vuotoAmmesso: false }),
  visibilita: unoDi(VISIBILITA, 'schedeSchema.visibilitaNonValida', { vuotoAmmesso: false }),
  esercizi: elencoEsercizi
}, CORPO_NON_VALIDO);

/** Schema for POST /schede/:id/esercizi */
export const schemaAggiungiEsercizio = z.object({
  esercizioId: numero('schedeSchema.esercizioIdNonValido', { min: 1, obbligatorio: 'schedeSchema.esercizioIdObbligatorio' }),
  serieTarget: numeroFacoltativo('schedeSchema.serieTargetNonValido', { max: 1000 }),
  repTarget: testoFacoltativo('schedeSchema.repTargetNonValido'),
  recuperoSecondi: numeroFacoltativo('schedeSchema.recuperoSecondiNonValido', { max: 86400 })
}, CORPO_NON_VALIDO);

/** Schema for PUT /schede/:id/esercizi/:esercizioSchedaId */
export const schemaAggiornaEsercizioScheda = z.object({
  serieTarget: numeroFacoltativo('schedeSchema.serieTargetNonValido', { max: 1000 }),
  repTarget: testoFacoltativo('schedeSchema.repTargetNonValido'),
  recuperoSecondi: numeroFacoltativo('schedeSchema.recuperoSecondiNonValido', { max: 86400 }),
  // The column cannot be empty: no null here
  ordineEsecuzione: numero('schedeSchema.ordineEsecuzioneNonValido', { max: 10000 }).optional()
}, CORPO_NON_VALIDO);
