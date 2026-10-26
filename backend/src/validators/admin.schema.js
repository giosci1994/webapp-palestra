// ============================================
// GymMaster — Admin validation schemas
// Zod schemas for gyms, equipment, suggestions, banner and "what's new"
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.
//
// zod drops the fields a schema does not list: every field the routes read
// is here. Where the route accepts null or an empty text to clear a field,
// the schema accepts them too.

import { z } from 'zod';
import { CategoriaAttrezzatura, StatoSuggerimento } from '@prisma/client';
import { ID_MASSIMO } from '../middleware/validazione.js';

/** The limit of a Postgres 32-bit integer column (ordine): beyond it the database fails */
const INTERO_MASSIMO = ID_MASSIMO;

/** The body of a request must be an object (not a list or a text) */
const corpo = { required_error: 'adminSchema.corpoNonValido', invalid_type_error: 'adminSchema.corpoNonValido' };

/** A required text: present, a text and not blank */
const testoObbligatorio = massimo => z
  .string({ required_error: 'adminSchema.campoObbligatorio', invalid_type_error: 'adminSchema.testoNonValido' })
  .max(massimo, 'adminSchema.testoTroppoLungo')
  .refine(valore => valore.trim() !== '', 'adminSchema.campoObbligatorio');

/** An optional text; null and an empty text are allowed (the routes turn them into null) */
const testoFacoltativo = massimo => z
  .string({ invalid_type_error: 'adminSchema.testoNonValido' })
  .max(massimo, 'adminSchema.testoTroppoLungo')
  .nullish();

/** A flag: true, false, or 0 and 1 (what the routes have always accepted); null counts as not sent */
const siNo = z.custom(valore => valore === null || typeof valore === 'boolean' || valore === 0 || valore === 1, 'adminSchema.siNoNonValido');

// --- Gyms ---

export const schemaCreaPalestra = z.object({
  nomeCatena: testoObbligatorio(200),
  citta: testoObbligatorio(200),
  indirizzo: testoObbligatorio(300),
  nazione: testoFacoltativo(100),
  googlePlaceId: testoFacoltativo(300)
}, corpo);

/** Only the fields sent are changed; the ones the database requires cannot be emptied */
export const schemaAggiornaPalestra = z.object({
  nomeCatena: testoObbligatorio(200).optional(),
  citta: testoObbligatorio(200).optional(),
  indirizzo: testoObbligatorio(300).optional(),
  nazione: z.string({ invalid_type_error: 'adminSchema.testoNonValido' }).max(100, 'adminSchema.testoTroppoLungo').optional(),
  googlePlaceId: testoFacoltativo(300)
}, corpo);

// --- Equipment ---

export const schemaCreaAttrezzatura = z.object({
  nome: testoObbligatorio(200),
  categoria: z.nativeEnum(CategoriaAttrezzatura, { message: 'adminSchema.categoriaNonValida' }),
  muscoliBersaglio: testoFacoltativo(500)
}, corpo);

// --- Exercise suggestions ---

/** ?stato=: the filter; an empty one means no filter */
export const schemaElencoSuggerimenti = z.object({
  stato: z.preprocess(
    valore => (valore === '' ? undefined : valore),
    z.nativeEnum(StatoSuggerimento, { message: 'adminSchema.statoNonValido' }).optional()
  )
});

/** The id of a piece of equipment: a whole number or a numeric text (a select sends text); '' and null mean none */
const idAttrezzatura = z.custom(
  valore => valore === null || valore === ''
    || (typeof valore === 'number' && Number.isInteger(valore) && valore >= 1 && valore <= ID_MASSIMO)
    || (typeof valore === 'string' && /^\d+$/.test(valore) && Number(valore) >= 1 && Number(valore) <= ID_MASSIMO),
  'adminSchema.idNonValido'
).optional();

/** The admin can correct the fields before approving; the ones not sent come from the suggestion */
export const schemaApprovaSuggerimento = z.object({
  nome: testoFacoltativo(200),
  gruppoMuscoloPrimario: testoFacoltativo(200),
  gruppoMuscoloSecondario: testoFacoltativo(200),
  attrezzaturaRichiestaId: idAttrezzatura,
  descrizione: testoFacoltativo(2000),
  linkVideo: testoFacoltativo(500)
}, corpo);

export const schemaRifiutaSuggerimento = z.object({
  motivoRifiuto: testoFacoltativo(1000)
}, corpo);

// --- Banner ---

export const schemaBanner = z.object({
  visibile: siNo.optional(),
  testo: testoFacoltativo(1000)
}, corpo);

// --- What's new ---

const punto = z.object({
  icona: testoFacoltativo(50),
  testo: testoFacoltativo(500)
}).passthrough();
const elencoPunti = z.array(punto).max(50);

/**
 * The points of a story: a list of { icona, testo }, or the same list already
 * as JSON text; an empty text or null clears them. The value is kept as sent
 * (the route turns it into JSON).
 */
const punti = z.custom(valore => {
  if (valore === null || valore === '') return true;
  if (typeof valore !== 'string') return elencoPunti.safeParse(valore).success;
  try { return elencoPunti.safeParse(JSON.parse(valore)).success; } catch { return false; }
}, 'adminSchema.puntiNonValidi').optional();

/** Fields shared by creating and updating a story */
const campiNovita = {
  sottotitolo: testoFacoltativo(500),
  punti,
  icona: testoFacoltativo(50),
  immagine: z.string({ invalid_type_error: 'adminSchema.testoNonValido' }).nullish(),
  ctaTesto: testoFacoltativo(100),
  ctaRotta: testoFacoltativo(200),
  coloreInizio: testoFacoltativo(30),
  coloreFine: testoFacoltativo(30),
  attiva: siNo.optional()
};

/**
 * The title is not required here: the route answers "title required" itself,
 * with its own message. A story is shown in order: ordine is a whole number
 * or a numeric text (the form used to send text).
 */
export const schemaCreaNovita = z.object({
  titolo: testoFacoltativo(200),
  ...campiNovita,
  ordine: z.custom(valore => valore === null || (
    typeof valore === 'number'
      ? Number.isInteger(valore) && Math.abs(valore) <= INTERO_MASSIMO
      : typeof valore === 'string' && /^-?\d+$/.test(valore) && Math.abs(Number(valore)) <= INTERO_MASSIMO
  ), 'adminSchema.ordineNonValido').optional()
}, corpo);

/**
 * Updating: only the fields sent change. The title cannot be emptied. A
 * wrong "ordine" has always become 0 here (parseInt(...) || 0): it stays so,
 * only a number too big for the database is refused.
 */
export const schemaAggiornaNovita = z.object({
  titolo: testoObbligatorio(200).optional(),
  ...campiNovita,
  ordine: z.custom(valore => {
    // An object that cannot become a text makes parseInt throw: it is refused too
    try { return Math.abs(parseInt(valore) || 0) <= INTERO_MASSIMO; } catch { return false; }
  }, 'adminSchema.ordineNonValido').optional()
}, corpo);
