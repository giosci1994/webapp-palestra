// ============================================
// GymMaster — Users validation schemas
// Zod schemas for the profile, the password, the roles and the admin's list
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.
//
// The app sends form values: "" for an empty field, the text of a number input
// ("61.5") or a number. The schemas accept what the app sends and refuse the
// rest, so that nothing wrong reaches the database or the password hashing.

import { z } from 'zod';
import { Ruolo, StatoUtente } from '@prisma/client';
import { ID_MASSIMO } from '../middleware/validazione.js';

const GIORNO_MS = 24 * 60 * 60 * 1000;

// Limits of the values. Texts of the translation files that name them (the
// weight, the height, the page size…) must stay in step with these.
const PESO_MASSIMO_KG = 1000;
const ALTEZZA_MASSIMA_CM = 300;
const ANNI_ESPERIENZA_MASSIMI = 100;
const PAGINA_MASSIMA = 1_000_000;
const LIMITE_MASSIMO = 1000;

/** Nobody alive was born before this */
const DATA_NASCITA_MINIMA = Date.UTC(1900, 0, 1);

/** What parseFloat reads in full: "61", "61.5", ".5", "1e2" */
const DECIMALE = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
/** What parseInt reads in full ("175", "175.5": the decimals are dropped) */
const INTERO = /^\d+(\.\d*)?$/;
/** The date part of an ISO date: "1995-04-12" or "1995-04-12T00:00:00.000Z" */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}(T|$)/;

// --- Checks on single values ---
// Each returns true when the value is fine; `campo` turns them into a field.

const testoFinoA = max => valore => typeof valore === 'string' && valore.length <= max;
const oNullo = verifica => valore => valore === null || verifica(valore);
const eBooleano = valore => typeof valore === 'boolean';

/** A number from 0 to `massimo`, as a number or as the text of an input */
const numeroFinoA = (massimo, { intero = false } = {}) => valore => {
  const numero = typeof valore === 'number'
    ? valore
    : (typeof valore === 'string' && (intero ? INTERO : DECIMALE).test(valore) ? Number(valore) : NaN);
  return Number.isFinite(numero) && numero >= 0 && numero <= massimo;
};

/** A date of birth in ISO format, not before 1900 and not in the future (a day of room for the time zones) */
const dataDiNascita = valore => {
  if (typeof valore !== 'string' || !DATA_ISO.test(valore)) return false;
  const istante = new Date(valore).getTime();
  return istante >= DATA_NASCITA_MINIMA && istante <= Date.now() + GIORNO_MS;
};

/** Nothing at all: null, or the empty text the app sends for a field left blank */
const oNulloOVuoto = verifica => valore => valore === null || valore === '' || verifica(valore);

/** The profile picture and the like: a text, or null to remove it */
const testoONullo = oNullo(testoFinoA(Infinity));

/** A list of short texts (or the text of one) */
const specializzazioni = valore => valore === null
  || testoFinoA(2000)(valore)
  || (Array.isArray(valore) && valore.length <= 50 && valore.every(testoFinoA(100)));

/** The visibility choices the onboarding sends: { palestra: true, peso: false… } */
const preferenzeComeOggetto = valore => valore === null
  || (typeof valore === 'object' && !Array.isArray(valore) && Object.values(valore).every(eBooleano));

/** The visibility choices the profile sends: the JSON text of the same object */
const preferenzeComeTesto = valore => {
  if (valore === null) return true;
  if (!testoFinoA(2000)(valore)) return false;
  try {
    const oggetto = JSON.parse(valore);
    return oggetto !== null && preferenzeComeOggetto(oggetto);
  } catch {
    return false;
  }
};

/** The id of a gym, or nothing to leave it */
const idPalestra = valore => valore === null || valore === ''
  || (typeof valore === 'number' && Number.isInteger(valore) && valore >= 1 && valore <= ID_MASSIMO)
  || (typeof valore === 'string' && /^\d+$/.test(valore) && Number(valore) >= 1 && Number(valore) <= ID_MASSIMO);

/**
 * A field whose value is checked by a function. Any wrong value, of any type,
 * gets the same translated message. Optional: a missing field stays missing.
 */
const campo = (chiave, verifica) => z.any()
  .superRefine((valore, ctx) => {
    if (!verifica(valore)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: chiave });
  })
  .optional();

/** A body that is not an object (a list, a text) gets a translated message, not zod's */
const SE_NON_E_UN_OGGETTO = {
  invalid_type_error: 'utentiSchema.corpoNonValido',
  required_error: 'utentiSchema.corpoNonValido'
};

// --- Change the password ---

/**
 * A missing or empty password is the service's to refuse, with its own
 * message; here only what is not text is refused (it would reach argon2).
 */
export const schemaCambiaPassword = z.object({
  vecchiaPassword: campo('utentiSchema.passwordNonTesto', oNullo(testoFinoA(Infinity))),
  nuovaPassword: campo('utentiSchema.passwordNonTesto', oNullo(testoFinoA(Infinity)))
}, SE_NON_E_UN_OGGETTO);

// --- Onboarding wizard (PATCH /utenti/completa-profilo) ---
// The handler ignores a field that is empty (""), null, 0 or false: those are
// fine here too.

export const schemaCompletaProfilo = z.object({
  tipoAccount: campo('utentiSchema.tipoAccountNonValido', valore => valore === 'UTENTE' || valore === 'PERSONAL_TRAINER'),
  immagineProfilo: campo('utentiSchema.immagineNonValida', testoONullo),
  dataNascita: campo('utentiSchema.dataNascitaNonValida', oNulloOVuoto(dataDiNascita)),
  genere: campo('utentiSchema.genereNonValido', oNullo(testoFinoA(50))),
  pesoKg: campo('utentiSchema.pesoNonValido', oNulloOVuoto(numeroFinoA(PESO_MASSIMO_KG))),
  altezzaCm: campo('utentiSchema.altezzaNonValida', oNulloOVuoto(numeroFinoA(ALTEZZA_MASSIMA_CM, { intero: true }))),
  obiettivoFitness: campo('utentiSchema.obiettivoNonValido', oNullo(testoFinoA(100))),
  preferenzeVisibilita: campo('utentiSchema.preferenzeNonValide', preferenzeComeOggetto),
  gamificationAttiva: campo('utentiSchema.gamificationNonValida', eBooleano),
  accettaToS: campo('utentiSchema.consensoNonValido', oNullo(eBooleano)),
  accettaPrivacy: campo('utentiSchema.consensoNonValido', oNullo(eBooleano)),
  // Professional profile (personal trainer onboarding)
  bio: campo('utentiSchema.bioOnboardingNonValida', oNullo(testoFinoA(300))),
  specializzazioni: campo('utentiSchema.specializzazioniNonValide', specializzazioni),
  anniEsperienza: campo('utentiSchema.anniEsperienzaNonValidi', oNulloOVuoto(numeroFinoA(ANNI_ESPERIENZA_MASSIMI, { intero: true }))),
  certificazioni: campo('utentiSchema.certificazioniNonValide', oNullo(testoFinoA(300))),
  contattoPubblico: campo('utentiSchema.contattoNonValido', oNullo(testoFinoA(500))),
  tariffaIndicativa: campo('utentiSchema.tariffaNonValida', oNullo(testoFinoA(500)))
}, SE_NON_E_UN_OGGETTO);

// --- Profile (PATCH /utenti/profilo) ---
// null empties a field. The length of the bio and of the picture, the
// language and the chat retention are checked by the service, with their own
// messages: they are listed so that zod does not drop them.

export const schemaAggiornaProfilo = z.object({
  nome: campo('utentiSchema.nomeNonValido', valore => testoFinoA(100)(valore) && valore.trim().length > 0),
  immagineProfilo: campo('utentiSchema.immagineNonValida', testoONullo),
  dataNascita: campo('utentiSchema.dataNascitaNonValida', oNullo(dataDiNascita)),
  pesoKg: campo('utentiSchema.pesoNonValido', oNullo(numeroFinoA(PESO_MASSIMO_KG))),
  altezzaCm: campo('utentiSchema.altezzaNonValida', oNullo(numeroFinoA(ALTEZZA_MASSIMA_CM, { intero: true }))),
  genere: campo('utentiSchema.genereNonValido', oNullo(testoFinoA(50))),
  bio: campo('utentiSchema.bioNonValida', testoONullo),
  obiettivoFitness: campo('utentiSchema.obiettivoNonValido', oNullo(testoFinoA(100))),
  preferenzeVisibilita: campo('utentiSchema.preferenzeNonValide', preferenzeComeTesto),
  gamificationAttiva: campo('utentiSchema.gamificationNonValida', eBooleano),
  palestraId: campo('utentiSchema.palestraNonValida', idPalestra),
  lingua: z.any().optional(),
  chatRetentionGiorni: z.any().optional()
}, SE_NON_E_UN_OGGETTO);

// --- Change a user's role (PATCH /utenti/:id/ruolo) ---

export const schemaCambiaRuolo = z.object({
  ruolo: z.enum(Object.values(Ruolo), { errorMap: () => ({ message: 'utentiSchema.ruoloNonValido' }) })
}, SE_NON_E_UN_OGGETTO);

// --- The admin's list of users (GET /utenti) ---
// A missing page or page size keeps the default; stato and ruolo may be empty
// ("no filter"), as the handler always allowed.

const numeroInteroDa1 = massimo => valore => typeof valore === 'string' && /^\d+$/.test(valore)
  && Number(valore) >= 1 && Number(valore) <= massimo;

export const schemaListaUtenti = z.object({
  pagina: campo('utentiSchema.paginaNonValida', numeroInteroDa1(PAGINA_MASSIMA)),
  limite: campo('utentiSchema.limiteNonValido', numeroInteroDa1(LIMITE_MASSIMO)),
  stato: campo('utentiSchema.statoNonValido', valore => valore === '' || Object.values(StatoUtente).includes(valore)),
  ruolo: campo('utentiSchema.ruoloNonValido', valore => valore === '' || Object.values(Ruolo).includes(valore))
});

// --- Search people (GET /utenti/cerca) ---

export const schemaCercaUtenti = z.object({
  q: campo('utentiSchema.ricercaNonValida', valore => typeof valore === 'string')
});
