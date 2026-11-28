// ============================================
// GymMaster — Telegram bot validation schemas
// Zod schemas for the /api/v1/bot/* routes and for the arguments of the
// functions the AI calls: the same fields and limits as a plan in the app
// (schede.schema.js), so the bot cannot save what the app would refuse.
// ============================================
//
// The messages are translation keys (middleware/validazione.js translates them).

import { z } from 'zod';
import { numero, schemaEsercizioInScheda, RIPETIZIONI_MASSIME } from './schede.schema.js';

const campi = schemaEsercizioInScheda.shape;

/** Telegram chat ids are integers (negative for groups) that fit in 64 bits */
const CHAT_ID_MASSIMO = 2n ** 63n - 1n;

/**
 * The chat id, as a number or a numeric string. It comes back as a string of
 * digits, ready for BigInt(): "abc" there was a 500.
 */
export const idChat = z.unknown().transform((valore, ctx) => {
  if (valore === undefined || valore === null || valore === '') {
    ctx.addIssue({ code: 'custom', message: 'botAuth.chatIdMancante' });
    return z.NEVER;
  }
  const testo = typeof valore === 'number' && Number.isSafeInteger(valore) ? String(valore) : valore;
  if (typeof testo !== 'string' || !/^-?\d{1,19}$/.test(testo) ||
      BigInt(testo) > CHAT_ID_MASSIMO || BigInt(testo) < -CHAT_ID_MASSIMO) {
    ctx.addIssue({ code: 'custom', message: 'botSchema.chatIdNonValido' });
    return z.NEVER;
  }
  return testo;
});

/**
 * Sets of a strength entry: 1 to 1000 like the app (0 sets would be an empty
 * entry). Missing or null: the handler picks the default.
 */
const serie = numero('schedeSchema.serieTargetNonValido', { min: 1, max: 1000, vuoto: 'nullo' }).nullable().optional();

/** Reps as a short text; a number (the AI may send 10) becomes "10", empty means "not sent" */
const ripetizioni = z.preprocess(
  v => (typeof v === 'number' ? String(v) : typeof v === 'string' ? (v.trim() || undefined) : v),
  z.string({ error: 'schedeSchema.repTargetNonValido' })
    .max(RIPETIZIONI_MASSIME, { error: 'botSchema.ripetizioniTroppoLunghe' })
    .nullable()
    .optional()
);

/** A strength entry: the button of the guided creation or `aggiungi_esercizio` of the AI */
export const schemaVoceForza = z.object({
  esercizioId: campi.esercizioId,
  serie,
  ripetizioni,
  recuperoSecondi: campi.recuperoSecondi
});

/**
 * The duration of a cardio entry when nobody gives one: without it the entry
 * has no cardio value at all and the app and the bot take it for strength.
 */
export const DURATA_CARDIO_PREDEFINITA = 10;

/** Minutes of a cardio entry: the app's limits, missing or empty the default */
const durataMinuti = campi.durataMinuti.transform(v => v ?? DURATA_CARDIO_PREDEFINITA);

/** The values of a cardio entry (`aggiungi_cardio` of the AI), with the app's limits */
export const schemaVoceCardio = z.object({
  durataMinuti,
  velocitaKmh: campi.velocitaKmh,
  inclinazione: campi.inclinazione,
  livelloResistenza: campi.livelloResistenza,
  distanzaKm: campi.distanzaKm
});

/** A name picked from a list the backend sent (a body region, a muscle group) */
const nomeDaElenco = messaggio => z.string({ error: messaggio }).trim().min(1, { error: messaggio }).max(100, { error: messaggio });

const CORPO_NON_VALIDO = { error: 'schedeSchema.corpoNonValido' };

/** Routes that only need the chat */
export const schemaSoloChat = z.object({ chatId: idChat }, CORPO_NON_VALIDO);

/** POST /collega: the code is checked by the handler ("code missing") */
export const schemaCollega = z.object({
  chatId: idChat,
  codice: z.string({ error: 'botSchema.codiceNonValido' }).nullable().optional()
}, CORPO_NON_VALIDO);

/** POST /messaggio: empty and too long are the handler's job */
export const schemaMessaggio = z.object({
  chatId: idChat,
  testo: z.string({ error: 'botSchema.testoNonValido' }).nullable().optional()
}, CORPO_NON_VALIDO);

/** POST /scheda */
export const schemaScheda = z.object({
  chatId: idChat,
  schedaId: numero('botSchema.schedaIdNonValido', { min: 1, obbligatorio: 'botSchema.schedaIdNonValido' })
}, CORPO_NON_VALIDO);

/** POST /guida/gruppi: without a region Prisma read "no filter" */
export const schemaGuidaGruppi = z.object({
  chatId: idChat,
  bodyRegion: nomeDaElenco('botSchema.regioneNonValida')
}, CORPO_NON_VALIDO);

/**
 * POST /guida/esercizi: a muscle group, the cardio exercises or the "most
 * used" shortcut, from the page that starts at `offset` (missing: the first)
 */
export const schemaGuidaEsercizi = z.object({
  chatId: idChat,
  gruppo: nomeDaElenco('botSchema.gruppoNonValido').optional(),
  soloPiuUsati: z.boolean({ error: 'botSchema.soloPiuUsatiNonValido' }).optional(),
  soloCardio: z.boolean({ error: 'botSchema.soloCardioNonValido' }).optional(),
  offset: numero('botSchema.offsetNonValido', { min: 0, max: 100000, vuoto: 'nullo' }).nullable().optional()
}, CORPO_NON_VALIDO).superRefine((corpo, ctx) => {
  if (!corpo.soloPiuUsati && !corpo.soloCardio && !corpo.gruppo) {
    ctx.addIssue({ code: 'custom', path: ['gruppo'], message: 'botSchema.gruppoNonValido' });
  }
});

/**
 * POST /guida/aggiungi: sets and reps for a strength exercise, minutes for a
 * cardio one (the handler looks at the exercise and keeps what fits)
 */
export const schemaGuidaAggiungi = schemaVoceForza.omit({ recuperoSecondi: true }).extend({ chatId: idChat, durataMinuti });

/**
 * The longest title of a plan from the bot. The app's plan schema has no
 * limit; this one keeps a title the user types in Telegram readable on the
 * buttons of /schede.
 */
export const TITOLO_MASSIMO = 100;

/** POST /guida/termina: the title is optional (missing or empty, the handler picks one) */
export const schemaGuidaTermina = z.object({
  chatId: idChat,
  titolo: z.string({ error: 'schedeSchema.titoloNonValido' }).trim()
    .max(TITOLO_MASSIMO, { error: 'botSchema.titoloTroppoLungo' }).nullable().optional()
}, CORPO_NON_VALIDO);
