// ============================================
// GymMaster — Personal trainer validation schemas
// Zod schemas for appointments, plans, announcements
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.
//
// These schemas only check the data; they do not change it. The handlers in
// routes/pt.routes.js keep reading the fields as they always did (ids can be
// numbers or numeric strings, as a <select> in the app sends them). Fields
// the handlers check by hand, with their own message ("title and content are
// required"), are optional here: the schema only refuses the wrong type.

import { z } from 'zod';
import { ID_MASSIMO } from '../middleware/validazione.js';

// Appointments are instants; PostgreSQL (through Prisma) takes four-digit years
const ANNO_MINIMO = 1900;
const ANNO_MASSIMO = 9999;

const DURATA_MASSIMA_MINUTI = 1440;
const SERIE_MASSIME = 100;
const RECUPERO_MASSIMO_SECONDI = 3600;
const ESERCIZI_MASSIMI = 100;

const PRIORITA = ['normale', 'importante', 'urgente'];
const LIVELLI = ['BASE', 'INTERMEDIO', 'AVANZATO'];

// --- Checks ---

/** A whole number, or a string of digits, from min to max */
const eIntero = (valore, min, max) => {
  const numero = typeof valore === 'number' ? valore : (typeof valore === 'string' && /^\d+$/.test(valore) ? Number(valore) : NaN);
  return Number.isInteger(numero) && numero >= min && numero <= max;
};

/** A text without the NUL character, which PostgreSQL does not store */
const eTesto = valore => typeof valore === 'string' && !valore.includes('\u0000');

/** A date the server reads (like new Date(...) always did) and the database stores */
const eIstante = valore => {
  if (typeof valore !== 'string') return false;
  const data = new Date(valore);
  const anno = data.getUTCFullYear();
  return !Number.isNaN(data.getTime()) && anno >= ANNO_MINIMO && anno <= ANNO_MASSIMO;
};

// --- Building blocks (the message is the key of the error) ---

/** A table id: a positive number or numeric string */
const idIntero = chiave => z.custom(valore => eIntero(valore, 1, ID_MASSIMO), chiave);

/** A text; the empty one is allowed (the handlers treat it as "not given") */
const testo = chiave => z.custom(eTesto, chiave);

/** A text with something written in it */
const testoNonVuoto = chiave => z.custom(valore => eTesto(valore) && valore.trim().length > 0, chiave);

/** A date and time; the query string can leave it empty */
const istante = chiave => z.custom(eIstante, chiave);
const istanteOVuoto = chiave => z.custom(valore => valore === '' || eIstante(valore), chiave);

/** One of the values; the empty text is allowed (the handlers use the default) */
const unoDi = (valori, chiave) => z.custom(valore => valore === '' || valori.includes(valore), chiave);

/** The length of an appointment: a number of minutes (the app sends numbers, not texts) */
const durata = () => z.custom(valore => typeof valore === 'number' && eIntero(valore, 1, DURATA_MASSIMA_MINUTI), 'ptSchema.durataNonValida');

/** An id that a filter or an optional field can leave empty */
const idOVuoto = chiave => z.custom(valore => valore === '' || eIntero(valore, 1, ID_MASSIMO), chiave);

// --- Appointments ---

/** Query string of GET /pt/appuntamenti: all the filters are optional */
export const schemaListaAppuntamenti = z.object({
  da: istanteOVuoto('ptSchema.dataInizioNonValida').optional(),
  a: istanteOVuoto('ptSchema.dataFineNonValida').optional(),
  clienteId: idOVuoto('ptSchema.clienteIdNonValido').optional()
});

/** Body of POST /pt/appuntamenti */
export const schemaNuovoAppuntamento = z.object({
  clienteId: idIntero('ptSchema.clienteIdNonValido'),
  titolo: testoNonVuoto('ptSchema.titoloObbligatorio'),
  descrizione: testo('ptSchema.descrizioneNonValida').nullish(),
  dataOra: istante('ptSchema.dataOraNonValida'),
  // Without it, an hour
  durataMinuti: durata().nullish(),
  note: testo('ptSchema.noteNonValide').nullish()
});

/** Body of PATCH /pt/appuntamenti/:id: only the fields sent change (null clears description and notes) */
export const schemaModificaAppuntamento = z.object({
  titolo: testoNonVuoto('ptSchema.titoloObbligatorio').optional(),
  descrizione: testo('ptSchema.descrizioneNonValida').nullish(),
  dataOra: istante('ptSchema.dataOraNonValida').optional(),
  durataMinuti: durata().optional(),
  completato: z.boolean({ invalid_type_error: 'ptSchema.completatoNonValido' }).optional(),
  note: testo('ptSchema.noteNonValide').nullish()
});

// --- Plans ---

/** One exercise of a new plan: the targets default to 3 sets, "8-12" reps and 90 seconds of rest */
const schemaEsercizioScheda = z.object({
  esercizioId: idIntero('ptSchema.esercizioIdNonValido'),
  serieTarget: z.custom(valore => eIntero(valore, 1, SERIE_MASSIME), 'ptSchema.serieTargetNonValido').nullish(),
  repTarget: testo('ptSchema.repTargetNonValido').nullish(),
  recuperoSecondi: z.custom(valore => eIntero(valore, 1, RECUPERO_MASSIMO_SECONDI), 'ptSchema.recuperoNonValido').nullish()
}, { invalid_type_error: 'ptSchema.esercizioNonValido' });

/**
 * Body of POST /pt/schede. The title and the exercises are required, but the
 * handler says so with its own message, so they can be missing here.
 */
export const schemaNuovaScheda = z.object({
  titolo: testo('ptSchema.titoloNonValido').nullish(),
  descrizione: testo('ptSchema.descrizioneNonValida').nullish(),
  livello: unoDi(LIVELLI, 'ptSchema.livelloNonValido').nullish(),
  esercizi: z.array(schemaEsercizioScheda, { invalid_type_error: 'ptSchema.eserciziNonValidi' })
    .max(ESERCIZI_MASSIMI, 'ptSchema.eserciziTroppi').nullish()
});

/** Body of POST /pt/clienti/:id/assegna-scheda */
export const schemaAssegnaScheda = z.object({
  schedaId: idIntero('ptSchema.schedaIdNonValido')
});

// --- Requests and announcements ---

/** Body of PATCH /pt/richieste/:id/accetta */
export const schemaAccettaRichiesta = z.object({
  notePT: testo('ptSchema.notePTNonValide').nullish()
});

/**
 * Body of POST /pt/annunci. Title and content are required, but the handler
 * says so with its own message. Without a recipient, it goes to all the clients.
 */
export const schemaNuovoAnnuncio = z.object({
  titolo: testo('ptSchema.titoloNonValido').nullish(),
  contenuto: testo('ptSchema.contenutoNonValido').nullish(),
  priorita: unoDi(PRIORITA, 'ptSchema.prioritaNonValida').nullish(),
  destinatarioId: idOVuoto('ptSchema.destinatarioIdNonValido').nullish()
});
