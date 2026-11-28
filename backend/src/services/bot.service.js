// ============================================
// GymMaster — Telegram bot service
// - Account linking (one-time code)
// - Conversational assistant (Gemini function calling) to create workout plans
// - Exercise matching, Italian -> English catalog (v1)
// - Reading the user's workout plans
// ============================================

import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import prisma from '../config/database.js';
import redis from '../config/redis.js';
import { ErroreApp, ErroreValidazione, ErroreNonTrovato } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { escapeHtml } from './telegram.service.js';
import { t, linguaCorrente, localeDi } from '../i18n/index.js';
import { macchinaCardio, dovEsercizioCardio, eEsercizioCardio, SELEZIONE_CARDIO } from '../utils/macchineCardio.js';
import { fusoCorrente } from '../utils/date.js';
import { gruppiDi, eCardioOriscaldamento, normalizzaGruppi, puoUnire, unisci, separa } from '../utils/superset.js';
import { testoDelProblema } from '../middleware/validazione.js';
import {
  schemaVoceForza, schemaVoceCardio, schemaUnisciSuperset, schemaSeparaSuperset, nota as schemaNota, DURATA_CARDIO_PREDEFINITA
} from '../validators/bot.schema.js';
import { TITOLO_MASSIMO, NOTE_MASSIME } from '../validators/schede.schema.js';

// --- Gemini client (lazy) ---
let clientAI = null;
function ottieniClientAI() {
  if (!clientAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'LA_TUA_API_KEY_GEMINI') {
      throw new ErroreApp(t('botService.aiNonConfigurata'), 503, 'AI_NON_CONFIGURATA');
    }
    clientAI = new GoogleGenAI({ apiKey });
  }
  return clientAI;
}

/** For the tests: a fake Gemini client (null goes back to the real one) */
export function impostaClientAI(client) {
  clientAI = client;
}

const MODELLO = 'gemini-2.5-flash';

// ============================================
// LANGUAGE
// ============================================
// The replies are in the language of the current request: for a linked user
// the routes run the whole request in the user's language (bot.routes.js),
// for the others it is Telegram's.

/** The exercise name to show: the English `nome`, or `nomeIt` (when it has one) in Italian */
function nomeMostrato(esercizio) {
  return linguaCorrente() === 'it' ? (esercizio.nomeIt || esercizio.nome) : esercizio.nome;
}

/** The translation of `chiave`, or `dato` when there is none (names that come from the database) */
function traduciODato(chiave, dato) {
  const testo = t(chiave);
  return testo === chiave ? dato : testo;
}

/** A muscle group name in the current language (the name itself when it has no translation) */
export function nomeGruppo(nome) {
  return nome ? traduciODato(`gruppi.${nome}`, nome) : nome;
}

/** A body region name in the current language (the name itself when it has no translation) */
export function nomeRegione(nome) {
  return nome ? traduciODato(`botService.regioni.${nome}`, nome) : nome;
}

/**
 * Regions and muscle groups are data (Italian names): the bot sends them back
 * as they are to pick one. For the buttons, { name: name to show }.
 */
export const etichette = (nomi, nomeDi) => Object.fromEntries(nomi.map(nome => [nome, nomeDi(nome)]));


// ============================================
// ACCOUNT LINKING
// ============================================

/** Generates/refreshes a one-time code to link the account from the app. */
export async function generaCodiceCollegamento(utenteId) {
  const codice = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 characters
  const codiceScadenza = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.collegamentoTelegram.upsert({
    where: { utenteId },
    create: { utenteId, codice, codiceScadenza },
    update: { codice, codiceScadenza }
  });

  const username = process.env.TELEGRAM_BOT_USERNAME || null;
  const deepLink = username ? `https://t.me/${username}?start=${codice}` : null;

  return { codice, deepLink, username, scadenza: codiceScadenza };
}

/** Link status for the UI. */
export async function statoCollegamento(utenteId) {
  const c = await prisma.collegamentoTelegram.findUnique({ where: { utenteId } });
  return { collegato: !!(c && c.telegramChatId), collegatoIl: c?.collegatoIl || null };
}

/** Unlinks the account from the bot. */
export async function scollegaTelegram(utenteId) {
  await prisma.collegamentoTelegram.deleteMany({ where: { utenteId } });
  return { successo: true };
}

/** Links a Telegram chat to an account after validating the code. */
export async function collegaChat(chatId, codice) {
  if (!codice) throw new ErroreValidazione(t('botService.codiceMancante'));
  const codiceNorm = String(codice).trim().toUpperCase();

  const collegamento = await prisma.collegamentoTelegram.findUnique({ where: { codice: codiceNorm } });
  if (!collegamento || !collegamento.codiceScadenza || collegamento.codiceScadenza < new Date()) {
    throw new ErroreValidazione(t('botService.codiceNonValido'));
  }

  // Free any other accounts linked to this chatId
  await prisma.collegamentoTelegram.updateMany({
    where: { telegramChatId: BigInt(chatId), NOT: { id: collegamento.id } },
    data: { telegramChatId: null, collegatoIl: null }
  });

  const aggiornato = await prisma.collegamentoTelegram.update({
    where: { id: collegamento.id },
    data: { telegramChatId: BigInt(chatId), codice: null, codiceScadenza: null, collegatoIl: new Date() },
    include: { utente: { select: { nome: true } } }
  });

  return { nome: aggiornato.utente.nome };
}

// ============================================
// EXERCISE MATCHING (IT -> EN catalog, v1)
// ============================================

const STOPWORDS = new Set([
  'con', 'per', 'di', 'del', 'della', 'dei', 'delle', 'il', 'la', 'le', 'lo', 'gli', 'un', 'una', 'uno',
  'and', 'with', 'the', 'for', 'of', 'to', 'da', 'in', 'su', 'ho', 'fatto', 'serie',
  'ripetizioni', 'rep', 'reps', 'set', 'sets'
]);

function tokenizza(testo) {
  return String(testo || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strips accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((parola) => parola.length >= 3 && !STOPWORDS.has(parola));
}

/** Finds the best catalog candidates (Italian and English) for a description. */
async function cercaEserciziPerDescrizione(descrizione, limite = 5) {
  let tokens = tokenizza(descrizione);
  if (tokens.length === 0) {
    const fallback = String(descrizione || '').toLowerCase().trim();
    if (!fallback) return [];
    tokens = [fallback];
  }

  // People write to the bot in Italian: the search must cover both names
  const candidati = await prisma.esercizio.findMany({
    where: {
      OR: tokens.flatMap((parola) => ([
        { nome: { contains: parola, mode: 'insensitive' } },
        { nomeIt: { contains: parola, mode: 'insensitive' } }
      ]))
    },
    select: {
      id: true, nome: true, nomeIt: true, gruppoMuscoloPrimario: true,
      attrezzatura: { select: { nome: true } }
    },
    take: 60
  });

  const scored = candidati.map((e) => {
    // The score looks at both names: someone writing to the bot in Italian
    // must get the same result as someone writing in English.
    const testo = `${e.nome} ${e.nomeIt || ''}`.toLowerCase();
    const score = tokens.reduce((somma, parola) => somma + (testo.includes(parola) ? 1 : 0), 0);
    // The order never depends on the language: ties go by the length of the
    // Italian name (or the English one), whatever name is shown
    return { e, score, lunghezza: (e.nomeIt || e.nome).length };
  });

  scored.sort((a, b) => b.score - a.score || a.lunghezza - b.lunghezza);
  return scored.slice(0, limite).map(({ e, score }) => ({
    id: e.id,
    nome: nomeMostrato(e),
    gruppo: nomeGruppo(e.gruppoMuscoloPrimario),
    attrezzatura: e.attrezzatura?.nome || null,
    score
  }));
}

/** Resolves the requested cardio machine to its exercise (created by the seed, utils/macchineCardio.js). */
async function risolviMacchinaCardio(testo) {
  const macchina = macchinaCardio(testo);
  if (!macchina) return null;
  const es = await prisma.esercizio.findFirst({ where: dovEsercizioCardio(macchina), orderBy: { id: 'asc' } });
  return es ? { id: es.id, nome: es.nome, nomeIt: es.nomeIt } : null;
}

// ============================================
// CONVERSATION STATE (Redis)
// ============================================

const TTL_STATO = 6 * 60 * 60; // 6 hours
const chiaveStato = (utenteId) => `bot:stato:${utenteId}`;

function statoVuoto() {
  return { storia: [], bozza: { esercizi: [] } };
}

/**
 * Redis unreachable: a clear 503 instead of an empty draft, otherwise the
 * guided creation says "Draft: 1 exercise" and then "the draft is empty".
 */
function statoNonDisponibile(e, azione) {
  logger.warn({ errore: e.message }, `Impossibile ${azione} lo stato bot su Redis`);
  return new ErroreApp(t('botService.statoNonDisponibile'), 503, 'BOT_STATO_NON_DISPONIBILE');
}

async function caricaStato(utenteId) {
  let raw;
  try {
    raw = await redis.get(chiaveStato(utenteId));
  } catch (e) {
    throw statoNonDisponibile(e, 'leggere');
  }
  if (!raw) return statoVuoto();
  try {
    return JSON.parse(raw);
  } catch (e) {
    // A damaged state: start again rather than block the user
    logger.warn({ errore: e.message }, 'Stato bot illeggibile su Redis');
    return statoVuoto();
  }
}

async function salvaStato(utenteId, stato) {
  try {
    await redis.set(chiaveStato(utenteId), JSON.stringify(stato), 'EX', TTL_STATO);
  } catch (e) {
    throw statoNonDisponibile(e, 'salvare');
  }
}

/** Cancels the current draft/conversation. */
export async function annullaBozza(utenteId) {
  try {
    await redis.del(chiaveStato(utenteId));
  } catch (e) {
    throw statoNonDisponibile(e, 'cancellare');
  }
  return { successo: true };
}

// ============================================
// ONE CHANGE AT A TIME PER USER (Redis lock)
// ============================================
// The bot handles different chats in parallel: two requests of the same user
// (a double tap on "Finish", a message while the AI is still answering) must
// not both read the draft, change it and write it back, or one change is lost
// and a plan can be saved twice. The lock expires on its own, so a crash
// never blocks the user for more than three minutes; it covers an AI answer
// with all its rounds with Gemini, even a slow one (the bot stops waiting
// after 30 s, the backend goes on).
const DURATA_BLOCCO_MS = 180 * 1000;
const chiaveBlocco = (utenteId) => `bot:blocco:${utenteId}`;
// Deletes the lock only if it is still ours: after it has expired another
// request may hold it
const SBLOCCA_SE_MIO = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * Runs `lavoro` holding the user's lock. Busy: 409 BOT_OCCUPATO (the request
 * conflicts with one still running, it is not a quota: it can be repeated as
 * soon as the bot answers). Redis unreachable: the usual 503.
 */
async function conBloccoUtente(utenteId, lavoro) {
  const chiave = chiaveBlocco(utenteId);
  const gettone = crypto.randomUUID();
  let preso;
  try {
    preso = await redis.set(chiave, gettone, 'PX', DURATA_BLOCCO_MS, 'NX');
  } catch (e) {
    throw statoNonDisponibile(e, 'bloccare');
  }
  if (preso !== 'OK') throw new ErroreApp(t('botService.richiestaInCorso'), 409, 'BOT_OCCUPATO');
  try {
    return await lavoro();
  } finally {
    await redis.eval(SBLOCCA_SE_MIO, 1, chiave, gettone).catch((e) => {
      // It expires on its own
      logger.warn({ errore: e.message }, 'Impossibile rilasciare il blocco bot su Redis');
    });
  }
}

/**
 * Empties the draft in Redis before a plan is created from it, then creates
 * the plan with `crea`. Redis failing: a 503 and no plan (the draft is still
 * there). The database failing: the draft is put back as it was and the error
 * goes on. Never a plan with its draft still full, which "finish" again would
 * save twice.
 * The database error becomes a 500 BOT_SCHEDA_NON_SALVATA that says the draft
 * is still there (not "AI error": the AI did its part).
 */
async function salvaSchedaDallaBozza(utenteId, stato, crea) {
  const bozzaPrima = stato.bozza;
  const attesaPrima = stato.attesaTitoloFino;
  const attesaNotaPrima = stato.attesaNotaFino;
  const rimetti = () => {
    stato.bozza = bozzaPrima;
    if (attesaPrima) stato.attesaTitoloFino = attesaPrima;
    if (attesaNotaPrima) stato.attesaNotaFino = attesaNotaPrima;
  };
  stato.bozza = { esercizi: [] };
  smettiDiAttendere(stato);
  try {
    await salvaStato(utenteId, stato);
  } catch (e) {
    rimetti();
    throw e;
  }
  try {
    return await crea();
  } catch (e) {
    logger.error({ utenteId, errore: e.message }, 'Scheda bot non salvata nel database');
    rimetti();
    await salvaStato(utenteId, stato).catch((errore) => {
      logger.error({ utenteId, errore: errore.message }, 'Bozza bot non ripristinata dopo un errore del database');
    });
    // 500, not 503: nothing says the failure is temporary (a plan the
    // database refuses fails again); the text still invites a retry
    throw new ErroreApp(t('botService.schedaNonSalvata'), 500, 'BOT_SCHEDA_NON_SALVATA');
  }
}

/**
 * Takes out of the draft the entries whose exercise is no longer in the
 * catalog: the plan could not reference them, and "finish" would fail every
 * time (the draft is put back as it was). Returns the names taken out, once
 * each, for the user.
 */
async function togliEserciziSpariti(stato) {
  const ids = [...new Set(stato.bozza.esercizi.map(e => e.esercizioId).filter(id => forza.esercizioId.safeParse(id).success))];
  if (!ids.length) return [];
  const esistenti = new Set((await prisma.esercizio.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(e => e.id));
  const tolti = stato.bozza.esercizi.filter(e => ids.includes(e.esercizioId) && !esistenti.has(e.esercizioId));
  if (!tolti.length) return [];
  stato.bozza.esercizi = stato.bozza.esercizi.filter(e => !tolti.includes(e));
  return [...new Set(tolti.map(nomeMostrato))];
}

/** All the exercises of the draft were taken out: the draft, now empty, is saved, and the user is told */
async function bozzaSvuotata(utenteId, stato, tolti) {
  await salvaStato(utenteId, stato);
  return t('botService.bozzaSenzaEsercizi', { nomi: tolti.join(', ') });
}

async function verificaRateLimit(utenteId) {
  try {
    const chiave = `bot:rl:${utenteId}`;
    const n = await redis.incr(chiave);
    if (n === 1) await redis.expire(chiave, 60);
    if (n > 15) {
      throw new ErroreApp(t('botService.troppoVeloce'), 429, 'BOT_RATE_LIMIT');
    }
  } catch (e) {
    if (e instanceof ErroreApp) throw e;
    // Redis unavailable: do not block the user
  }
}

// ============================================
// CONVERSATION ENGINE (Gemini function calling)
// ============================================

/**
 * The instructions for the model, built per request: it must answer in the
 * user's language (the instructions themselves stay in Italian). The tool
 * results (exercise names, the draft summary) are in that language too; the
 * errors and hints meant only for the model are in English, like the code.
 */
function promptSistema() {
  const nomeLingua = new Intl.DisplayNames(['it'], { type: 'language' }).of(linguaCorrente());
  return `Sei GymBot, l'assistente di GymMaster su Telegram. Aiuti l'utente a creare una SCHEDA DI ALLENAMENTO (un template riutilizzabile) parlando in linguaggio naturale mentre si allena.

Come lavori:
- Quando l'utente descrive un esercizio (es. "ho fatto 3 serie di alzate laterali con i manubri da 8 ripetizioni"), chiama lo strumento "cerca_esercizio" passando una descrizione in INGLESE (il catalogo ha i nomi in inglese: es. "dumbbell lateral raise").
- Ricevuti i candidati, scegli quello più pertinente e chiama "aggiungi_esercizio" con il suo esercizioId, le serie e le ripetizioni. Se più candidati sono plausibili e diversi tra loro, CHIEDI all'utente quale intende prima di aggiungere.
- Le ripetizioni vanno passate come stringa (es. "8" oppure "8-12"). Se l'utente non dice il recupero, ometti recuperoSecondi (default 90s).
- Il PESO non viene salvato nei template: se l'utente lo dice, ringrazia ma spiega che la scheda è un modello e il peso lo registrerà durante l'allenamento. Non inventare pesi.
- Per il CARDIO e il RISCALDAMENTO (tapis roulant, cyclette, ellittica, vogatore, stepper, air bike) NON usare cerca_esercizio: usa "aggiungi_cardio" con la macchina e i parametri disponibili (durata in minuti; se indicati: velocità km/h, inclinazione %, resistenza, distanza km). Imposta riscaldamento=true quando l'utente lo presenta come riscaldamento (es. "10 minuti di tapis per scaldarmi").
- Quando l'utente dice che ha finito ("ho finito", "basta", "chiudi"), chiama "termina_scheda" con un titolo sensato (se non te l'ha dato, proponilo o chiedilo).
- Puoi usare "mostra_bozza" per ricapitolare e "rimuovi_ultimo" per togliere l'ultimo esercizio.
- NOTE: se l'utente dà un'indicazione di tecnica per un esercizio di forza (postura, tempo, presa), passala in "note" di aggiungi_esercizio. Il cardio non ha note.
- SUPERSET e CIRCUITI: per fare un superset (2 esercizi) o un circuito (3 o più), aggiungi prima gli esercizi uno dopo l'altro, poi chiama "unisci_superset" con le loro posizioni nella bozza (1, 2, 3… come nello STATO BOZZA). Solo esercizi di forza vicini; cardio e riscaldamento non si uniscono. "separa_superset" toglie una voce dal suo gruppo.

Regole:
1. Rispondi SEMPRE in ${nomeLingua} (la lingua dell'utente), anche per conferme, riepiloghi e domande, in modo breve e amichevole, con qualche emoji 💪
2. Non inventare esercizi: usa solo quelli trovati con cerca_esercizio.
3. Conferma ogni aggiunta in una riga, nella lingua dell'utente ("${t('botService.prompt.esempioConferma')}").
4. Sii proattivo ma non prolisso.`;
}

const dichiarazioniFunzioni = [
  {
    name: 'cerca_esercizio',
    description: 'Cerca nel catalogo (nomi in inglese) gli esercizi che corrispondono a una descrizione. Passare una descrizione in inglese.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        descrizione: { type: Type.STRING, description: 'Descrizione dell\'esercizio in inglese, es. "dumbbell lateral raise"' }
      },
      required: ['descrizione']
    }
  },
  {
    name: 'aggiungi_esercizio',
    description: 'Aggiunge un esercizio (scelto tra i candidati di cerca_esercizio) alla bozza della scheda corrente.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        esercizioId: { type: Type.INTEGER, description: 'ID dell\'esercizio scelto tra i candidati' },
        serie: { type: Type.INTEGER, description: 'Numero di serie (set)' },
        ripetizioni: { type: Type.STRING, description: 'Ripetizioni come stringa, es. "8" o "8-12"' },
        recuperoSecondi: { type: Type.INTEGER, description: 'Recupero in secondi (opzionale, default 90)' },
        note: { type: Type.STRING, description: 'Nota di tecnica per questo esercizio (opzionale)' }
      },
      required: ['esercizioId', 'serie', 'ripetizioni']
    }
  },
  {
    name: 'aggiungi_cardio',
    description: 'Aggiunge una voce cardio (tapis roulant, cyclette, ellittica, vogatore, stepper, air bike) o un riscaldamento alla bozza.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        macchina: { type: Type.STRING, description: 'Macchina cardio: tapis roulant, cyclette, ellittica, vogatore, stepper o air bike' },
        durataMinuti: { type: Type.INTEGER, description: `Durata in minuti (se l'utente non la dice, ${DURATA_CARDIO_PREDEFINITA})` },
        velocitaKmh: { type: Type.NUMBER, description: 'Velocità in km/h (opzionale)' },
        inclinazione: { type: Type.NUMBER, description: 'Inclinazione/pendenza in % (opzionale)' },
        livelloResistenza: { type: Type.INTEGER, description: 'Livello di resistenza (opzionale)' },
        distanzaKm: { type: Type.NUMBER, description: 'Distanza in km (opzionale)' },
        riscaldamento: { type: Type.BOOLEAN, description: 'true se è un riscaldamento' }
      },
      required: ['macchina']
    }
  },
  {
    name: 'mostra_bozza',
    description: 'Mostra il riepilogo della bozza di scheda corrente.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'rimuovi_ultimo',
    description: 'Rimuove l\'ultimo esercizio aggiunto alla bozza.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'unisci_superset',
    description: 'Unisce in un superset (2) o circuito (3+) voci di forza vicine della bozza. Cardio e riscaldamento esclusi.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        posizioni: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: 'Posizioni nella bozza (da 1), almeno 2, una dopo l\'altra, es. [2, 3]' }
      },
      required: ['posizioni']
    }
  },
  {
    name: 'separa_superset',
    description: 'Toglie una voce dal suo superset o circuito.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        posizione: { type: Type.INTEGER, description: 'Posizione della voce nella bozza (da 1)' }
      },
      required: ['posizione']
    }
  },
  {
    name: 'termina_scheda',
    description: 'Finalizza e salva la scheda con tutti gli esercizi della bozza.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        titolo: { type: Type.STRING, description: 'Titolo della scheda' },
        livello: { type: Type.STRING, description: 'Livello: BASE, INTERMEDIO o AVANZATO (opzionale)' }
      },
      required: ['titolo']
    }
  }
];

/** The details of a cardio entry (draft or saved plan), in the current language */
function dettagliCardio(e) {
  const parti = [];
  if (e.durataMinuti != null) parti.push(t('botService.voce.durata', { valore: e.durataMinuti }));
  if (e.velocitaKmh != null) parti.push(t('botService.voce.velocita', { valore: e.velocitaKmh }));
  if (e.inclinazione != null) parti.push(t('botService.voce.inclinazione', { valore: e.inclinazione }));
  if (e.livelloResistenza != null) parti.push(t('botService.voce.resistenza', { valore: e.livelloResistenza }));
  if (e.distanzaKm != null) parti.push(t('botService.voce.distanza', { valore: e.distanzaKm }));
  return parti.join(', ');
}

/** The line of a strength exercise: "1. Name — 3x10 (rest 90s)", without the rest when the plan has none */
function rigaForza(n, nome, serie, ripetizioni, recupero) {
  ripetizioni ??= '—';
  return t(recupero != null ? 'botService.voce.forza' : 'botService.voce.forzaSenzaRecupero', { n, nome, serie, ripetizioni, recupero });
}

/**
 * The line of a member of a superset or circuit: "A1. Name — 4x8", then the
 * pause before the next member when there is one, and on the last member
 * the rest after the round.
 */
function rigaMembro(posto, nome, serie, ripetizioni, recupero) {
  const valori = { n: posto.etichetta, nome, serie, ripetizioni: ripetizioni ?? '—', recupero };
  if (!recupero) return t('botService.voce.forzaSenzaRecupero', valori);
  return t(posto.ultimo ? 'botService.voce.forzaDopoGiro' : 'botService.voce.forzaPausa', valori);
}

/** A long text cut to `massimo` characters, with "…" (notes in a summary) */
function inBreve(testo, massimo) {
  const caratteri = [...String(testo)];
  return caratteri.length <= massimo ? String(testo) : `${caratteri.slice(0, massimo - 1).join('').trimEnd()}…`;
}

/** How long a note may be in the draft summary and in a plan's details */
const NOTA_IN_BOZZA = 40;
const NOTA_IN_SCHEDA = 200;

/** The heading "Superset A" / "Circuit A" above the first member of a group, then the line */
function conIntestazioneGruppo(posto, riga) {
  if (!posto?.primo) return riga;
  const titolo = t(posto.tipo === 'superset' ? 'botService.voce.superset' : 'botService.voce.circuito', { lettera: posto.lettera });
  return `${titolo}\n${riga}`;
}

/** The line of a note under its entry, shortened to `massimo` (escaped for HTML when asked) */
function rigaNota(note, massimo, html) {
  const breve = inBreve(note, massimo);
  return `\n${t('botService.voce.nota', { nota: html ? escapeHtml(breve) : breve })}`;
}

/** A draft entry is cardio: by its type, or by its values like a plan's (utils/superset.js) */
const eVoceCardio = e => e?.tipo === 'CARDIO' || eCardioOriscaldamento(e || {});

/**
 * The summary of the draft: the AI reads it (plain text, positions 1, 2, 3...
 * for unisci_superset) and the guided creation shows it (`html`: names and
 * notes escaped). Members of a group show their position and label, "2 · A1".
 */
function riepilogoBozza(bozza, { html = false } = {}) {
  if (!bozza.esercizi.length) return t('botService.bozza.vuota');
  const testo = v => (html && v != null ? escapeHtml(v) : v);
  const posti = gruppiDi(bozza.esercizi);
  const righe = bozza.esercizi.map((e, i) => {
    const nome = testo(nomeMostrato(e));
    if (eVoceCardio(e)) {
      const etichetta = t(e.riscaldamento ? 'botService.voce.etichettaRiscaldamento' : 'botService.voce.etichettaCardio');
      const dettagli = dettagliCardio(e);
      return t(dettagli ? 'botService.voce.cardioDettagli' : 'botService.voce.cardio', { n: i + 1, etichetta, nome, dettagli });
    }
    const posto = posti[i];
    const riga = posto
      ? conIntestazioneGruppo(posto, rigaMembro(
        { ...posto, etichetta: t('botService.voce.posizioneGruppo', { n: i + 1, etichetta: posto.etichetta }) },
        nome, e.serie, testo(e.ripetizioni), e.recuperoSecondi))
      : rigaForza(i + 1, nome, e.serie, testo(e.ripetizioni), e.recuperoSecondi);
    return e.note ? riga + rigaNota(e.note, NOTA_IN_BOZZA, html) : riga;
  });
  return t('botService.bozza.riepilogo', {
    numero: bozza.esercizi.length,
    righe: righe.join('\n')
  });
}

/** A value checked again with the schema of its field, or the default when it is missing or wrong */
function valoreOPredefinito(schema, valore, predefinito) {
  const risultato = schema.safeParse(valore);
  return risultato.success && risultato.data != null ? risultato.data : predefinito;
}

const forza = schemaVoceForza.shape;
const cardio = schemaVoceCardio.shape;

/**
 * The plan's entries from the draft. A draft saved before the checks existed
 * can hold values the plan does not accept (99999999999 sets made every
 * "finish" a 500 until /annulla): each value is checked again with the same
 * limits, and a wrong one takes the default instead of blocking the plan.
 */
function vociDellaScheda(esercizi) {
  // Groups numbered again on what is saved: an entry left out breaks no group
  return normalizzaGruppi(esercizi.filter(e => forza.esercizioId.safeParse(e.esercizioId).success))
    .map((e, i) => {
      if (eVoceCardio(e)) {
        return {
          esercizioId: e.esercizioId,
          ordineEsecuzione: i + 1,
          riscaldamento: !!e.riscaldamento,
          // A draft entry saved without minutes takes the default (bot.schema.js)
          durataMinuti: valoreOPredefinito(cardio.durataMinuti, e.durataMinuti, DURATA_CARDIO_PREDEFINITA),
          velocitaKmh: valoreOPredefinito(cardio.velocitaKmh, e.velocitaKmh, null),
          inclinazione: valoreOPredefinito(cardio.inclinazione, e.inclinazione, null),
          livelloResistenza: valoreOPredefinito(cardio.livelloResistenza, e.livelloResistenza, null),
          distanzaKm: valoreOPredefinito(cardio.distanzaKm, e.distanzaKm, null),
          serieTarget: 1,        // keeps the live workout working (WorkoutLive)
          repTarget: null,
          recuperoSecondi: 0
        };
      }
      return {
        esercizioId: e.esercizioId,
        serieTarget: valoreOPredefinito(forza.serie, e.serie, 3),
        repTarget: valoreOPredefinito(forza.ripetizioni, e.ripetizioni, '8-12'),
        recuperoSecondi: valoreOPredefinito(forza.recuperoSecondi, e.recuperoSecondi, 90),
        ordineEsecuzione: i + 1,
        gruppo: e.gruppo,
        note: valoreOPredefinito(schemaNota, e.note, null)
      };
    });
}

/**
 * The default title of a plan from the bot: "Plan of 28/11", with today's day
 * and month in the user's time zone (the request runs in it, bot.auth.js) and
 * the locale of their language (en-GB and it-IT both write day/month)
 */
function titoloPredefinito() {
  const data = new Intl.DateTimeFormat(localeDi(), { day: '2-digit', month: '2-digit', timeZone: fusoCorrente() }).format(new Date());
  return t('botService.titoloSchedaPredefinito', { data });
}

/** The title of a new plan: a text that is not empty, or the default one */
const titoloScheda = titolo => (typeof titolo === 'string' && titolo.trim() ? titolo.trim() : titoloPredefinito());

/**
 * A cardio entry of the draft. `valori` are already checked by schemaVoceCardio
 * (the minutes have their default there); the plan gets 1 set and no rest
 * like the app (vociDellaScheda).
 */
function voceCardio(esercizio, valori = {}, riscaldamento = false) {
  return {
    tipo: 'CARDIO',
    esercizioId: esercizio.id,
    nome: esercizio.nome,
    nomeIt: esercizio.nomeIt,
    riscaldamento: !!riscaldamento,
    durataMinuti: valori.durataMinuti ?? DURATA_CARDIO_PREDEFINITA,
    velocitaKmh: valori.velocitaKmh ?? null,
    inclinazione: valori.inclinazione ?? null,
    livelloResistenza: valori.livelloResistenza ?? null,
    distanzaKm: valori.distanzaKm ?? null
  };
}

/**
 * Joins the draft entries at `posizioni` (from 1, next to each other: the
 * schema checks that) into one superset or circuit, with the app's rules
 * (utils/superset.js): strength entries only, an entry already in a group
 * brings its group along. An error for the model when they cannot be joined.
 */
function unisciVoci(stato, posizioni) {
  const lista = stato.bozza.esercizi;
  const indici = [...posizioni].sort((a, b) => a - b).map(p => p - 1);
  if (indici.at(-1) >= lista.length) return { errore: `Position ${indici.at(-1) + 1} is outside the draft: it has ${lista.length} entries.` };
  const cardio = indici.filter(i => eVoceCardio(lista[i]));
  if (cardio.length) {
    return { errore: `Cardio and warm-up entries cannot join a superset (position ${cardio.map(i => i + 1).join(', ')}).` };
  }
  let nuova = lista;
  for (const i of indici.slice(0, -1)) nuova = unisci(nuova, i);
  stato.bozza.esercizi = nuova;
  const posto = gruppiDi(nuova)[indici[0]];
  return { ok: true, gruppo: posto.lettera, tipo: posto.tipo, membri: posto.membri, totaleEsercizi: nuova.length };
}

async function eseguiFunzione(nome, args, utente, stato) {
  switch (nome) {
    case 'cerca_esercizio': {
      const candidati = await cercaEserciziPerDescrizione(args.descrizione, 5);
      return { candidati };
    }
    case 'aggiungi_esercizio': {
      // The same limits as a plan in the app: a wrong value goes back to the
      // model as an error and never enters the draft
      const controllo = schemaVoceForza.safeParse(args);
      if (!controllo.success) return { errore: testoDelProblema(controllo.error.issues[0]) };
      const { esercizioId, serie, ripetizioni, recuperoSecondi, note } = controllo.data;
      const es = await prisma.esercizio.findUnique({
        where: { id: esercizioId },
        select: { id: true, nome: true, nomeIt: true, ...SELEZIONE_CARDIO }
      });
      if (!es) return { errore: 'Exercise not found. Use cerca_esercizio first.' };
      if (eEsercizioCardio(es)) {
        // A cardio machine found by cerca_esercizio: saved as cardio, never as
        // sets x reps, whatever the model sent. The model is told, so it can
        // replace it (rimuovi_ultimo + aggiungi_cardio) with the user's values.
        const voce = voceCardio(es);
        stato.bozza.esercizi.push(voce);
        return {
          ok: true,
          aggiunto: nomeMostrato(es),
          cardio: true,
          durataMinuti: voce.durataMinuti,
          nota: `Cardio exercise: added as ${voce.durataMinuti} minutes of cardio, not as sets and reps. For cardio use aggiungi_cardio.`,
          totaleEsercizi: stato.bozza.esercizi.length
        };
      }
      const voce = {
        tipo: 'FORZA',
        esercizioId: es.id,
        nome: es.nome,
        nomeIt: es.nomeIt,
        serie: serie ?? 3,
        ripetizioni: ripetizioni ?? '8-12',
        // 0 is a valid rest (no pause); missing, the default
        recuperoSecondi: recuperoSecondi ?? 90,
        note: note ?? null
      };
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: nomeMostrato(es), totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'aggiungi_cardio': {
      const controllo = schemaVoceCardio.safeParse(args);
      if (!controllo.success) return { errore: testoDelProblema(controllo.error.issues[0]) };
      const valori = controllo.data;
      const macchina = await risolviMacchinaCardio(args.macchina);
      if (!macchina) {
        return { errore: 'Cardio machine not recognised. Available: tapis roulant, cyclette, ellittica, vogatore, stepper, air bike.' };
      }
      const voce = voceCardio(macchina, valori, args.riscaldamento);
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: nomeMostrato(macchina), riscaldamento: voce.riscaldamento, totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'mostra_bozza':
      return { riepilogo: riepilogoBozza(stato.bozza), totaleEsercizi: stato.bozza.esercizi.length };
    case 'rimuovi_ultimo': {
      // The last member of a group leaves it first, so the new last member
      // takes the rest after the round (like "split" in the app)
      const ultimo = stato.bozza.esercizi.length - 1;
      if (ultimo >= 0 && gruppiDi(stato.bozza.esercizi)[ultimo]) stato.bozza.esercizi = separa(stato.bozza.esercizi, ultimo);
      const rimosso = stato.bozza.esercizi.pop();
      return { ok: true, rimosso: rimosso ? nomeMostrato(rimosso) : null, totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'unisci_superset': {
      const controllo = schemaUnisciSuperset.safeParse(args);
      if (!controllo.success) return { errore: testoDelProblema(controllo.error.issues[0]) };
      const risultato = unisciVoci(stato, controllo.data.posizioni);
      if (risultato.errore) return risultato;
      return { ...risultato, riepilogo: riepilogoBozza(stato.bozza) };
    }
    case 'separa_superset': {
      const controllo = schemaSeparaSuperset.safeParse(args);
      if (!controllo.success) return { errore: testoDelProblema(controllo.error.issues[0]) };
      const indice = controllo.data.posizione - 1;
      const lista = stato.bozza.esercizi;
      if (indice >= lista.length) return { errore: `Position ${indice + 1} is outside the draft: it has ${lista.length} entries.` };
      if (!gruppiDi(lista)[indice]) return { errore: `Entry ${indice + 1} is not in a superset or circuit.` };
      stato.bozza.esercizi = separa(lista, indice);
      return { ok: true, separato: nomeMostrato(lista[indice]), riepilogo: riepilogoBozza(stato.bozza), totaleEsercizi: lista.length };
    }
    case 'termina_scheda': {
      // Like the other arguments: a title over the limit goes back to the
      // model as an error (it can shorten it), and nothing is saved
      if (typeof args.titolo === 'string' && args.titolo.trim().length > TITOLO_MASSIMO) {
        return { errore: t('botSchema.titoloTroppoLungo') };
      }
      const tolti = await togliEserciziSpariti(stato);
      const voci = vociDellaScheda(stato.bozza.esercizi);
      if (!voci.length && tolti.length) {
        // The user is told by rispondiAlMessaggio (tolti), not by the model
        await bozzaSvuotata(utente.id, stato, tolti);
        return { errore: `The draft's exercises (${tolti.join(', ')}) are no longer in the catalog: the draft is now empty.`, tolti, bozzaSvuotata: true };
      }
      if (!voci.length) {
        return { errore: 'The draft is empty: add at least one exercise before finishing.' };
      }
      const livelliValidi = ['BASE', 'INTERMEDIO', 'AVANZATO'];
      const livello = livelliValidi.includes(String(args.livello || '').toUpperCase())
        ? String(args.livello).toUpperCase() : 'BASE';

      const riepilogo = riepilogoBozza(stato.bozza);
      const scheda = await salvaSchedaDallaBozza(utente.id, stato, () => prisma.schedaAllenamento.create({
        data: {
          titolo: titoloScheda(args.titolo),
          descrizione: t('botService.descrizioneScheda'),
          livello,
          visibilita: 'PERSONALE',
          creatoreId: utente.id,
          esercizi: { create: voci }
        },
        include: { esercizi: true }
      }));
      const fatto = { ok: true, schedaId: scheda.id, titolo: scheda.titolo, numEsercizi: scheda.esercizi.length, riepilogo };
      if (tolti.length) {
        fatto.tolti = tolti;
        fatto.nota = `Removed from the draft because they are no longer in the catalog: ${tolti.join(', ')}.`;
      }
      return fatto;
    }
    default:
      return { errore: `Unknown function: ${nome}` };
  }
}

/** The functions that change the draft: their result is saved at once */
const FUNZIONI_CHE_CAMBIANO = new Set(['aggiungi_esercizio', 'aggiungi_cardio', 'rimuovi_ultimo', 'unisci_superset', 'separa_superset', 'termina_scheda']);

/** Adds a user message and the answer to the history (the last 16 entries) */
function aggiungiAllaStoria(stato, testo, risposta) {
  stato.storia = [
    ...(stato.storia || []),
    { role: 'user', text: testo },
    { role: 'model', text: risposta }
  ].slice(-16);
}

/** Processes a user message and returns the bot's answer. */
export async function elaboraMessaggio(utente, testo) {
  if (!testo || !testo.trim()) throw new ErroreValidazione(t('botService.messaggioVuoto'));
  if (testo.length > 1000) throw new ErroreValidazione(t('botService.messaggioTroppoLungo'));

  // After "Finish" in the guided creation the next text is the plan's title,
  // not a message for the AI
  const statoAttuale = await caricaStato(utente.id);
  if (attendeTitolo(statoAttuale)) {
    const titolo = testo.trim();
    if (titolo.length > TITOLO_MASSIMO) throw new ErroreValidazione(t('botSchema.titoloTroppoLungo'));
    return { scheda: await terminaSchedaGuidata(utente.id, titolo) };
  }
  // After "Note" the next text is the note of the last entry
  if (attendeNota(statoAttuale)) {
    // Too long: a clear 400 and the draft keeps waiting, so a shorter note can follow
    const nota = testo.trim();
    if (nota.length > NOTE_MASSIME) throw new ErroreValidazione(t('schedeSchema.noteTroppoLunghe'));
    return { nota: await salvaNotaGuidata(utente.id, nota) };
  }

  await verificaRateLimit(utente.id);

  const ai = ottieniClientAI();
  return conBloccoUtente(utente.id, () => rispondiAlMessaggio(ai, utente, testo));
}

/** The AI engine for one message, with the user's lock held */
async function rispondiAlMessaggio(ai, utente, testo) {
  const stato = await caricaStato(utente.id);

  const contents = (stato.storia || []).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: testo }] });

  const systemInstruction = promptSistema() + '\n\n--- STATO BOZZA ---\n' + riepilogoBozza(stato.bozza);

  let rispostaFinale = '';
  // What the functions have already done in this message (they are saved at once)
  const azioni = [];
  // Exercises taken out of the draft because they left the catalog: the user
  // is told by the bot itself, whatever the model writes
  const avvisi = [];
  try {
    for (let i = 0; i < 6; i++) {
      const risposta = await ai.models.generateContent({
        model: MODELLO,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: dichiarazioniFunzioni }],
          temperature: 0.4,
          maxOutputTokens: 800
        }
      });

      const chiamate = risposta.functionCalls || [];
      if (chiamate.length > 0) {
        contents.push({ role: 'model', parts: chiamate.map((c) => ({ functionCall: c })) });
        const partiRisposta = [];
        for (const c of chiamate) {
          const risultato = await eseguiFunzione(c.name, c.args || {}, utente, stato);
          if (risultato.bozzaSvuotata) avvisi.push(t('botService.bozzaSenzaEsercizi', { nomi: risultato.tolti.join(', ') }));
          else if (risultato.tolti) avvisi.push(t('botService.eserciziTolti', { nomi: risultato.tolti.join(', ') }));
          if (FUNZIONI_CHE_CAMBIANO.has(c.name) && risultato.ok) {
            // Saved before the next call to Gemini: if that one fails, the
            // added exercises are not lost and a saved plan does not stay in
            // the draft (the user writing "done" again would save it twice)
            await salvaStato(utente.id, stato);
            const cosa = risultato.aggiunto || risultato.rimosso || risultato.titolo;
            azioni.push(cosa ? `${c.name}: ${cosa}` : c.name);
          }
          partiRisposta.push({ functionResponse: { name: c.name, response: risultato } });
        }
        contents.push({ role: 'user', parts: partiRisposta });
        continue;
      }

      rispostaFinale = risposta.text || '';
      break;
    }
  } catch (errore) {
    logger.error({ utenteId: utente.id, errore: errore.message }, 'Errore motore bot Gemini');
    if (azioni.length) {
      // The draft is already saved: the history says what was done, so the
      // model does not do it again when the user repeats the message (with
      // Redis unreachable this save fails too, and the 503 goes on)
      aggiungiAllaStoria(stato, testo, `[Risposta interrotta da un errore. Azioni già eseguite: ${azioni.join('; ')}]`);
      await salvaStato(utente.id, stato).catch(() => {});
    }
    if (errore instanceof ErroreApp) throw errore;
    if (errore.message?.includes('429') || errore.message?.toLowerCase().includes('quota')) {
      throw new ErroreApp(t('botService.limiteAI'), 429, 'AI_RATE_LIMIT');
    }
    throw new ErroreApp(t('botService.erroreAI'), 502, 'AI_ERRORE');
  }

  if (!rispostaFinale) rispostaFinale = t('botService.rispostaVuota');

  aggiungiAllaStoria(stato, testo, rispostaFinale);
  await salvaStato(utente.id, stato);

  return { risposta: [rispostaFinale, ...avvisi].join('\n\n') };
}

// ============================================
// READING WORKOUT PLANS
// ============================================

/** How many plans of each list /schede shows on its buttons (the rest is in the app) */
export const SCHEDE_PER_ELENCO = 15;

/**
 * The user's own plans and the global ones, in two lists (newest first) for
 * the bot, each with how many more there are in the app. A global plan the
 * user created is in the global list only.
 */
export async function listaSchedeUtente(utenteId) {
  const dove = {
    proprie: { creatoreId: utenteId, assegnataDaPTId: null, visibilita: 'PERSONALE' },
    globali: { visibilita: 'GLOBALE' }
  };
  const elenco = where => prisma.schedaAllenamento.findMany({
    where,
    select: { id: true, titolo: true, livello: true, _count: { select: { esercizi: true } } },
    orderBy: { creatoIl: 'desc' },
    take: SCHEDE_PER_ELENCO
  });
  const [proprie, globali, totaleProprie, totaleGlobali] = await Promise.all([
    elenco(dove.proprie), elenco(dove.globali),
    prisma.schedaAllenamento.count({ where: dove.proprie }), prisma.schedaAllenamento.count({ where: dove.globali })
  ]);
  const compatta = s => ({ id: s.id, titolo: s.titolo, livello: s.livello, numEsercizi: s._count.esercizi });
  return {
    proprie: proprie.map(compatta),
    globali: globali.map(compatta),
    altreProprie: Math.max(0, totaleProprie - proprie.length),
    altreGlobali: Math.max(0, totaleGlobali - globali.length)
  };
}

/** A workout plan's details formatted as text (Telegram HTML: the names and the title are escaped). */
export async function dettaglioSchedaTesto(utenteId, schedaId) {
  const scheda = await prisma.schedaAllenamento.findUnique({
    where: { id: parseInt(schedaId) },
    include: {
      esercizi: {
        include: { esercizio: { select: { nome: true, nomeIt: true, ...SELEZIONE_CARDIO } } },
        orderBy: { ordineEsecuzione: 'asc' }
      }
    }
  });
  if (!scheda) throw new ErroreNonTrovato(t('botService.schedaNonTrovata'));
  if (scheda.creatoreId !== utenteId && scheda.visibilita !== 'GLOBALE') {
    throw new ErroreNonTrovato(t('botService.schedaNonTrovata'));
  }

  // Superset or circuit of each entry: A1, A2... (null outside a group)
  const posti = gruppiDi(scheda.esercizi);
  const righe = scheda.esercizi.map((e, i) => {
    // The server's test (utils/superset.js), and a cardio exercise saved
    // without values still reads as cardio, not as "1x— (rest 0s)"
    const eCardio = eCardioOriscaldamento(e) || eEsercizioCardio(e.esercizio);
    const nome = escapeHtml(nomeMostrato(e.esercizio));
    // Reps are free text in the app
    const ripetizioni = e.repTarget == null ? e.repTarget : escapeHtml(e.repTarget);
    if (eCardio) {
      const dettagli = dettagliCardio(e);
      return t(dettagli ? 'botService.voce.cardioSchedaDettagli' : 'botService.voce.cardioScheda', {
        n: i + 1, icona: e.riscaldamento ? '🔥' : '🏃', nome, dettagli
      });
    }
    // A heading line above the first member: "Superset A" (2) or "Circuit A" (3+)
    const riga = posti[i]
      ? conIntestazioneGruppo(posti[i], rigaMembro(posti[i], nome, e.serieTarget, ripetizioni, e.recuperoSecondi))
      : rigaForza(i + 1, nome, e.serieTarget, ripetizioni, e.recuperoSecondi);
    // The technique note, escaped (free text in the app), shortened so a
    // long plan still fits one Telegram message
    return e.note?.trim() ? riga + rigaNota(e.note.trim(), NOTA_IN_SCHEDA, true) : riga;
  });
  const testo = t('botService.scheda.testo', {
    titolo: escapeHtml(scheda.titolo),
    livello: escapeHtml(traduciODato(`botService.livelli.${scheda.livello}`, scheda.livello)),
    righe: righe.join('\n') || t('botService.scheda.nessunEsercizio')
  });
  return { id: scheda.id, titolo: scheda.titolo, testo, numEsercizi: scheda.esercizi.length };
}

/** Summary of the user's stats, ready to send on Telegram (HTML; only numbers and a date go in). */
export async function statisticheTesto(utenteId) {
  const setteGiorniFa = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [totSessioni, sessioni7g, agg, record, ultima] = await Promise.all([
    prisma.sessioneAllenamento.count({ where: { utenteId } }),
    prisma.sessioneAllenamento.count({ where: { utenteId, dataInizio: { gte: setteGiorniFa } } }),
    prisma.sessioneAllenamento.aggregate({ where: { utenteId }, _sum: { volumeTotaleKg: true, durataMinuti: true } }),
    prisma.recordPersonale.count({ where: { utenteId } }),
    prisma.sessioneAllenamento.findFirst({ where: { utenteId }, orderBy: { dataInizio: 'desc' }, select: { dataInizio: true } })
  ]);
  const volume = Math.round(agg._sum.volumeTotaleKg || 0);
  const ore = Math.round((agg._sum.durataMinuti || 0) / 60 * 10) / 10;
  const locale = localeDi();
  const righe = [
    t('botService.statistiche.titolo'),
    '',
    t('botService.statistiche.totali', { valore: totSessioni }),
    t('botService.statistiche.ultimi7Giorni', { valore: sessioni7g }),
    t('botService.statistiche.volume', { valore: volume.toLocaleString(locale) }),
    t('botService.statistiche.tempo', { valore: ore }),
    t('botService.statistiche.record', { valore: record })
  ];
  if (ultima) righe.push('', t('botService.statistiche.ultimoAllenamento', { data: new Date(ultima.dataInizio).toLocaleDateString(locale, { timeZone: fusoCorrente() }) }));
  return { testo: righe.join('\n') };
}

// ─── Guided creation with buttons ───

/** Body regions available in the catalog (Italian). */
export async function categorieEsercizi() {
  const r = await prisma.esercizio.findMany({
    where: { bodyRegion: { not: null } },
    distinct: ['bodyRegion'], select: { bodyRegion: true }, orderBy: { bodyRegion: 'asc' }
  });
  return r.map(x => x.bodyRegion).filter(Boolean);
}

/** Muscle groups of a body region. */
export async function gruppiPerRegione(bodyRegion) {
  const r = await prisma.esercizio.findMany({
    where: { bodyRegion },
    distinct: ['gruppoMuscoloPrimario'], select: { gruppoMuscoloPrimario: true }, orderBy: { gruppoMuscoloPrimario: 'asc' }
  });
  return r.map(x => x.gruppoMuscoloPrimario).filter(Boolean);
}

/** IDs of the user's most used exercises, sorted by frequency. */
async function eserciziPiuUsatiIds(utenteId) {
  const usati = await prisma.esercizioScheda.groupBy({
    by: ['esercizioId'],
    where: { scheda: { creatoreId: utenteId } },
    _count: { esercizioId: true },
    orderBy: { _count: { esercizioId: 'desc' } },
    take: 60
  });
  return usati.map(u => u.esercizioId);
}

/** An exercise on a button of the guided creation: `cardio` asks for minutes instead of sets x reps */
const voceElenco = e => ({ id: e.id, nome: nomeMostrato(e), cardio: eEsercizioCardio(e) });

/** Exercises on one page of the guided creation */
export const ESERCIZI_PER_PAGINA = 12;

/** The exercises that are cardio for eEsercizioCardio, as a Prisma `where` */
const DOVE_CARDIO = { OR: [{ gruppoMuscoloPrimario: 'Cardio' }, { attrezzatura: { categoria: 'CARDIO' } }] };

/**
 * One page of exercises for the guided creation: the user's most used first,
 * then by the name shown, alphabetically in the user's language (the id
 * breaks ties). The order is the same at every request, so a page offset in
 * the button gives the next exercises, never the same ones again. The catalog
 * has no popularity of its own, and the plans of all users are too few to
 * rank 1300 exercises: alphabetical is the order one can scan.
 * `precedente` and `successivo` are the offsets of the other pages, or null.
 */
async function paginaEsercizi(utenteId, where, offset = 0) {
  const [esercizi, usatiIds] = await Promise.all([
    prisma.esercizio.findMany({ where, select: { id: true, nome: true, nomeIt: true, ...SELEZIONE_CARDIO } }),
    eserciziPiuUsatiIds(utenteId)
  ]);
  const rank = new Map(usatiIds.map((id, i) => [id, i]));
  const posto = e => (rank.has(e.id) ? rank.get(e.id) : Infinity);
  const confronta = new Intl.Collator(linguaCorrente(), { sensitivity: 'base', numeric: true }).compare;
  const voci = esercizi.map(e => ({ e, nome: nomeMostrato(e) }));
  voci.sort((a, b) => (posto(a.e) - posto(b.e)) || confronta(a.nome, b.nome) || (a.e.id - b.e.id));
  // An offset past the end (the catalog changed) shows the last page
  const inizio = Math.min(offset, Math.max(0, Math.floor((voci.length - 1) / ESERCIZI_PER_PAGINA) * ESERCIZI_PER_PAGINA));
  const fine = inizio + ESERCIZI_PER_PAGINA;
  return {
    esercizi: voci.slice(inizio, fine).map(v => voceElenco(v.e)),
    offset: inizio,
    totale: voci.length,
    precedente: inizio > 0 ? Math.max(0, inizio - ESERCIZI_PER_PAGINA) : null,
    successivo: fine < voci.length ? fine : null
  };
}

/** One page of the exercises of a muscle group (C4: the user's most used at the top) */
export function eserciziPerGruppo(utenteId, gruppo, offset = 0) {
  return paginaEsercizi(utenteId, { gruppoMuscoloPrimario: gruppo }, offset);
}

/**
 * One page of the cardio exercises ("Cardio / warm-up" in the guided
 * creation): the machines have no body region, so no region shows them
 */
export function eserciziCardio(utenteId, offset = 0) {
  return paginaEsercizi(utenteId, DOVE_CARDIO, offset);
}

/** Whether the catalog has cardio exercises, for the "Cardio / warm-up" button */
export async function ciSonoEserciziCardio() {
  return (await prisma.esercizio.count({ where: DOVE_CARDIO })) > 0;
}

/** The user's N most used exercises (the "più usati" (most used) shortcut). */
export async function eserciziPiuUsati(utenteId, limite = 12) {
  const ids = await eserciziPiuUsatiIds(utenteId);
  if (!ids.length) return [];
  const top = ids.slice(0, limite);
  const esercizi = await prisma.esercizio.findMany({ where: { id: { in: top } }, select: { id: true, nome: true, nomeIt: true, ...SELEZIONE_CARDIO } });
  const ordine = new Map(top.map((id, i) => [id, i]));
  return esercizi.sort((a, b) => ordine.get(a.id) - ordine.get(b.id)).map(voceElenco);
}

/**
 * Adds an exercise (by id) to the draft, from the guided creation. The values
 * are already checked by the route (validators/bot.schema.js); missing, the defaults.
 * A cardio exercise becomes a cardio entry with its minutes, whatever button
 * sent it (an old sets x reps button too); the others take sets and reps.
 */
export async function aggiungiEsercizioGuidato(utenteId, esercizioId, serie, ripetizioni, durataMinuti) {
  const es = await prisma.esercizio.findUnique({ where: { id: esercizioId }, select: { id: true, nome: true, nomeIt: true, ...SELEZIONE_CARDIO } });
  if (!es) throw new ErroreNonTrovato(t('botService.esercizioNonTrovato'));
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    const cardio = eEsercizioCardio(es);
    const voce = cardio
      ? voceCardio(es, { durataMinuti })
      : { tipo: 'FORZA', esercizioId: es.id, nome: es.nome, nomeIt: es.nomeIt,
          serie: serie ?? 3, ripetizioni: ripetizioni ?? '8-12', recuperoSecondi: 90 };
    stato.bozza.esercizi.push(voce);
    // Adding again after "Finish" or "Note": the next text is no longer the title or the note
    smettiDiAttendere(stato);
    await salvaStato(utenteId, stato);
    const dati = { aggiunto: nomeMostrato(es), totaleEsercizi: stato.bozza.esercizi.length, cardio, ...pulsantiDopo(stato) };
    if (cardio) dati.durataMinuti = voce.durataMinuti;
    return dati;
  });
}

// ─── The title at the end of the guided creation ───
// "Finish" asks for the title: until it comes (or the user adds another
// exercise, goes back to the categories, cancels) the next text is the title.
// The wait ends on its own: a text written much later goes to the AI.
const ATTESA_TITOLO_MS = 15 * 60 * 1000;

/** Whether the draft is waiting for its title */
const attendeTitolo = stato => typeof stato.attesaTitoloFino === 'number' && stato.attesaTitoloFino > Date.now();

/**
 * "Note" works the same way: the next text is the note of the last entry,
 * for as long as the title waits, and anything else in the guided creation
 * (or /annulla) ends the wait. One wait at a time.
 */
const attendeNota = stato => typeof stato.attesaNotaFino === 'number' && stato.attesaNotaFino > Date.now();

/** The draft no longer waits for a title or a note */
function smettiDiAttendere(stato) {
  delete stato.attesaTitoloFino;
  delete stato.attesaNotaFino;
}

/** The last entry can be joined to the one before (both strength, not already together) */
const unibileAllaPrecedente = lista =>
  lista.length >= 2 && !eVoceCardio(lista.at(-1)) && !eVoceCardio(lista.at(-2)) && puoUnire(lista, lista.length - 2);

/** Which extra buttons the guided creation shows after a step: "Note" (strength only) and "Join the previous one" */
const pulsantiDopo = stato => ({
  nota: stato.bozza.esercizi.length > 0 && !eVoceCardio(stato.bozza.esercizi.at(-1)),
  unibile: unibileAllaPrecedente(stato.bozza.esercizi)
});

/** The last entry of the draft, if it can take a note; otherwise a clear 400 */
function ultimaVoceConNota(stato) {
  const ultima = stato.bozza.esercizi.at(-1);
  if (!ultima) throw new ErroreValidazione(t('botService.bozzaVuotaGuidata'));
  if (eVoceCardio(ultima)) throw new ErroreValidazione(t('botService.notaSoloForza'));
  return ultima;
}

/** "Note" in the guided creation: the draft waits for the note of its last entry */
export async function chiediNotaGuidata(utenteId) {
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    const ultima = ultimaVoceConNota(stato);
    smettiDiAttendere(stato);
    stato.attesaNotaFino = Date.now() + ATTESA_TITOLO_MS;
    await salvaStato(utenteId, stato);
    return { nome: nomeMostrato(ultima), nota: ultima.note ?? null };
  });
}

/** The text written after "Note": it becomes the note of the last entry (it replaces the one before) */
export async function salvaNotaGuidata(utenteId, testo) {
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    smettiDiAttendere(stato);
    let ultima;
    try {
      ultima = ultimaVoceConNota(stato);
    } catch (e) {
      // Nothing to put the note on any more: the wait is over all the same
      await salvaStato(utenteId, stato);
      throw e;
    }
    ultima.note = testo;
    await salvaStato(utenteId, stato);
    return {
      nome: nomeMostrato(ultima), riepilogo: riepilogoBozza(stato.bozza, { html: true }),
      totaleEsercizi: stato.bozza.esercizi.length, ...pulsantiDopo(stato)
    };
  });
}

/**
 * "Join the previous one": the last entry joins the group of the one before,
 * or the two make a new superset (the app's rules, utils/superset.js)
 */
export async function unisciAllaPrecedenteGuidata(utenteId) {
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    if (!unibileAllaPrecedente(stato.bozza.esercizi)) throw new ErroreValidazione(t('botService.nienteDaUnire'));
    smettiDiAttendere(stato);
    const n = stato.bozza.esercizi.length;
    const { gruppo, tipo } = unisciVoci(stato, [n - 1, n]);
    await salvaStato(utenteId, stato);
    return {
      gruppo, tipo, riepilogo: riepilogoBozza(stato.bozza, { html: true }),
      totaleEsercizi: n, ...pulsantiDopo(stato)
    };
  });
}

/** The number of entries in the user's draft (read only, no lock) */
export async function numeroEserciziBozza(utenteId) {
  return (await caricaStato(utenteId)).bozza.esercizi.length;
}

/** "Finish" in the guided creation: the draft waits for its title, the default one is proposed */
export async function chiediTitoloGuidata(utenteId) {
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    if (!vociDellaScheda(stato.bozza.esercizi).length) throw new ErroreValidazione(t('botService.bozzaVuotaGuidata'));
    smettiDiAttendere(stato);
    stato.attesaTitoloFino = Date.now() + ATTESA_TITOLO_MS;
    await salvaStato(utenteId, stato);
    return { titoloProposto: titoloScheda(null), numEsercizi: stato.bozza.esercizi.length };
  });
}

/** Back to the categories: the draft no longer waits for a title or a note */
export async function smettiDiAttendereTitolo(utenteId) {
  const prima = await caricaStato(utenteId);
  if (!attendeTitolo(prima) && !attendeNota(prima)) return;
  await conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    smettiDiAttendere(stato);
    await salvaStato(utenteId, stato);
  });
}

/**
 * Turns the draft into a workout plan (guided creation), with the given title
 * or the default one. The exercises no longer in the catalog are taken out
 * first (`tolti`); none left, a clear 400 and the emptied draft.
 */
export async function terminaSchedaGuidata(utenteId, titolo = null) {
  return conBloccoUtente(utenteId, async () => {
    const stato = await caricaStato(utenteId);
    const tolti = await togliEserciziSpariti(stato);
    const voci = vociDellaScheda(stato.bozza.esercizi);
    if (!voci.length && tolti.length) throw new ErroreValidazione(await bozzaSvuotata(utenteId, stato, tolti));
    if (!voci.length) throw new ErroreValidazione(t('botService.bozzaVuotaGuidata'));
    const scheda = await salvaSchedaDallaBozza(utenteId, stato, () => prisma.schedaAllenamento.create({
      data: {
        titolo: titoloScheda(titolo), descrizione: t('botService.descrizioneScheda'),
        livello: 'BASE', visibilita: 'PERSONALE', creatoreId: utenteId,
        esercizi: { create: voci }
      },
      include: { esercizi: true }
    }));
    return { schedaId: scheda.id, titolo: scheda.titolo, numEsercizi: scheda.esercizi.length, tolti };
  });
}
