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
import { t, linguaCorrente, localeDi } from '../i18n/index.js';
import { fusoCorrente } from '../utils/date.js';

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

// Cardio machines: keywords -> canonical exercise name (created in the seed).
const MACCHINE_CARDIO = [
  { nome: 'Tapis Roulant', chiavi: ['tapis', 'roulant', 'tappeto', 'treadmill', 'corsa', 'camminata', 'corro', 'cammino', 'corri'] },
  { nome: 'Cyclette', chiavi: ['cyclette', 'ciclette', 'cyclet', 'bici', 'bike', 'spinning', 'pedala', 'pedalo'] },
  { nome: 'Ellittica', chiavi: ['ellittica', 'elittica', 'elliptical', 'crosstrainer', 'cross trainer'] },
  { nome: 'Vogatore (Rower)', chiavi: ['vogatore', 'rower', 'remo', 'rowing', 'voga'] },
  { nome: 'Stepper', chiavi: ['stepper', 'step', 'scale', 'climber'] },
  { nome: 'Air Bike', chiavi: ['air bike', 'airbike', 'assault', 'air-bike'] }
];

/** Resolves the requested cardio machine to the matching catalog exercise. */
async function risolviMacchinaCardio(macchina) {
  const m = String(macchina || '').toLowerCase().trim();
  if (!m) return null;
  const scelta = MACCHINE_CARDIO.find(
    (c) => c.chiavi.some((k) => m.includes(k)) || m.includes(c.nome.toLowerCase())
  );
  if (!scelta) return null;
  const es = await prisma.esercizio.findFirst({ where: { nome: scelta.nome } });
  return es ? { id: es.id, nome: es.nome, nomeIt: es.nomeIt } : null;
}

// ============================================
// CONVERSATION STATE (Redis)
// ============================================

const TTL_STATO = 6 * 60 * 60; // 6 hours
const chiaveStato = (utenteId) => `bot:stato:${utenteId}`;

function statoVuoto() {
  return { storia: [], bozza: { titolo: null, livello: null, esercizi: [] } };
}

async function caricaStato(utenteId) {
  try {
    const raw = await redis.get(chiaveStato(utenteId));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    logger.warn({ errore: e.message }, 'Impossibile leggere lo stato bot da Redis');
  }
  return statoVuoto();
}

async function salvaStato(utenteId, stato) {
  try {
    await redis.set(chiaveStato(utenteId), JSON.stringify(stato), 'EX', TTL_STATO);
  } catch (e) {
    logger.warn({ errore: e.message }, 'Impossibile salvare lo stato bot su Redis');
  }
}

/** Cancels the current draft/conversation. */
export async function annullaBozza(utenteId) {
  try { await redis.del(chiaveStato(utenteId)); } catch { /* ignore */ }
  return { successo: true };
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
 * results (exercise names, the draft summary) are in that language too.
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
        recuperoSecondi: { type: Type.INTEGER, description: 'Recupero in secondi (opzionale, default 90)' }
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
        durataMinuti: { type: Type.INTEGER, description: 'Durata in minuti' },
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
  return t(recupero != null ? 'botService.voce.forza' : 'botService.voce.forzaSenzaRecupero', { n, nome, serie, ripetizioni, recupero });
}

function riepilogoBozza(bozza) {
  if (!bozza.esercizi.length) return t('botService.bozza.vuota');
  const righe = bozza.esercizi.map((e, i) => {
    if (e.tipo === 'CARDIO') {
      const etichetta = t(e.riscaldamento ? 'botService.voce.etichettaRiscaldamento' : 'botService.voce.etichettaCardio');
      const dettagli = dettagliCardio(e);
      return t(dettagli ? 'botService.voce.cardioDettagli' : 'botService.voce.cardio', { n: i + 1, etichetta, nome: nomeMostrato(e), dettagli });
    }
    return rigaForza(i + 1, nomeMostrato(e), e.serie, e.ripetizioni, e.recuperoSecondi);
  });
  return t('botService.bozza.riepilogo', {
    titolo: bozza.titolo || t('botService.bozza.titoloDaDefinire'),
    numero: bozza.esercizi.length,
    righe: righe.join('\n')
  });
}

async function eseguiFunzione(nome, args, utente, stato) {
  switch (nome) {
    case 'cerca_esercizio': {
      const candidati = await cercaEserciziPerDescrizione(args.descrizione, 5);
      return { candidati };
    }
    case 'aggiungi_esercizio': {
      const es = await prisma.esercizio.findUnique({
        where: { id: parseInt(args.esercizioId) },
        select: { id: true, nome: true, nomeIt: true }
      });
      if (!es) return { errore: 'Esercizio non trovato. Usa prima cerca_esercizio.' };
      const voce = {
        tipo: 'FORZA',
        esercizioId: es.id,
        nome: es.nome,
        nomeIt: es.nomeIt,
        serie: parseInt(args.serie) || 3,
        ripetizioni: String(args.ripetizioni || '8-12'),
        recuperoSecondi: args.recuperoSecondi ? parseInt(args.recuperoSecondi) : 90
      };
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: nomeMostrato(es), totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'aggiungi_cardio': {
      const macchina = await risolviMacchinaCardio(args.macchina);
      if (!macchina) {
        return { errore: 'Macchina cardio non riconosciuta. Disponibili: tapis roulant, cyclette, ellittica, vogatore, stepper, air bike.' };
      }
      const voce = {
        tipo: 'CARDIO',
        esercizioId: macchina.id,
        nome: macchina.nome,
        nomeIt: macchina.nomeIt,
        riscaldamento: !!args.riscaldamento,
        durataMinuti: args.durataMinuti != null ? parseInt(args.durataMinuti) : null,
        velocitaKmh: args.velocitaKmh != null ? parseFloat(args.velocitaKmh) : null,
        inclinazione: args.inclinazione != null ? parseFloat(args.inclinazione) : null,
        livelloResistenza: args.livelloResistenza != null ? parseInt(args.livelloResistenza) : null,
        distanzaKm: args.distanzaKm != null ? parseFloat(args.distanzaKm) : null
      };
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: nomeMostrato(macchina), riscaldamento: voce.riscaldamento, totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'mostra_bozza':
      return { riepilogo: riepilogoBozza(stato.bozza), totaleEsercizi: stato.bozza.esercizi.length };
    case 'rimuovi_ultimo': {
      const rimosso = stato.bozza.esercizi.pop();
      return { ok: true, rimosso: rimosso ? nomeMostrato(rimosso) : null, totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'termina_scheda': {
      if (!stato.bozza.esercizi.length) {
        return { errore: 'La bozza è vuota: aggiungi almeno un esercizio prima di terminare.' };
      }
      const livelliValidi = ['BASE', 'INTERMEDIO', 'AVANZATO'];
      const livello = livelliValidi.includes(String(args.livello || '').toUpperCase())
        ? String(args.livello).toUpperCase() : 'BASE';

      const scheda = await prisma.schedaAllenamento.create({
        data: {
          titolo: args.titolo || t('botService.titoloSchedaPredefinito'),
          descrizione: t('botService.descrizioneScheda'),
          livello,
          visibilita: 'PERSONALE',
          creatoreId: utente.id,
          esercizi: {
            create: stato.bozza.esercizi.map((e, i) => {
              if (e.tipo === 'CARDIO') {
                return {
                  esercizioId: e.esercizioId,
                  ordineEsecuzione: i + 1,
                  riscaldamento: !!e.riscaldamento,
                  durataMinuti: e.durataMinuti ?? null,
                  velocitaKmh: e.velocitaKmh ?? null,
                  inclinazione: e.inclinazione ?? null,
                  livelloResistenza: e.livelloResistenza ?? null,
                  distanzaKm: e.distanzaKm ?? null,
                  serieTarget: 1,        // keeps the live workout working (WorkoutLive)
                  repTarget: null,
                  recuperoSecondi: 0
                };
              }
              return {
                esercizioId: e.esercizioId,
                serieTarget: e.serie,
                repTarget: e.ripetizioni,
                recuperoSecondi: e.recuperoSecondi,
                ordineEsecuzione: i + 1
              };
            })
          }
        },
        include: { esercizi: true }
      });

      const riepilogo = riepilogoBozza(stato.bozza);
      stato.bozza = { titolo: null, livello: null, esercizi: [] };
      return { ok: true, schedaId: scheda.id, titolo: scheda.titolo, numEsercizi: scheda.esercizi.length, riepilogo };
    }
    default:
      return { errore: `Funzione sconosciuta: ${nome}` };
  }
}

/** Processes a user message and returns the bot's answer. */
export async function elaboraMessaggio(utente, testo) {
  if (!testo || !testo.trim()) throw new ErroreValidazione(t('botService.messaggioVuoto'));
  if (testo.length > 1000) throw new ErroreValidazione(t('botService.messaggioTroppoLungo'));

  await verificaRateLimit(utente.id);

  const ai = ottieniClientAI();
  const stato = await caricaStato(utente.id);

  const contents = (stato.storia || []).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: testo }] });

  const systemInstruction = promptSistema() + '\n\n--- STATO BOZZA ---\n' + riepilogoBozza(stato.bozza);

  let rispostaFinale = '';
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
    if (errore instanceof ErroreApp) throw errore;
    if (errore.message?.includes('429') || errore.message?.toLowerCase().includes('quota')) {
      throw new ErroreApp(t('botService.limiteAI'), 429, 'AI_RATE_LIMIT');
    }
    throw new ErroreApp(t('botService.erroreAI'), 502, 'AI_ERRORE');
  }

  if (!rispostaFinale) rispostaFinale = t('botService.rispostaVuota');

  stato.storia = [
    ...(stato.storia || []),
    { role: 'user', text: testo },
    { role: 'model', text: rispostaFinale }
  ].slice(-16);

  await salvaStato(utente.id, stato);

  return { risposta: rispostaFinale };
}

// ============================================
// READING WORKOUT PLANS
// ============================================

/** The user's workout plans + global plans, in a compact form for the bot. */
export async function listaSchedeUtente(utenteId) {
  const schede = await prisma.schedaAllenamento.findMany({
    where: { OR: [{ creatoreId: utenteId, assegnataDaPTId: null }, { visibilita: 'GLOBALE' }] },
    select: {
      id: true, titolo: true, livello: true, visibilita: true,
      _count: { select: { esercizi: true } }
    },
    orderBy: { creatoIl: 'desc' },
    take: 30
  });
  return schede.map((s) => ({
    id: s.id,
    titolo: s.titolo,
    livello: s.livello,
    globale: s.visibilita === 'GLOBALE',
    numEsercizi: s._count.esercizi
  }));
}

/** A workout plan's details formatted as text (Telegram Markdown). */
export async function dettaglioSchedaTesto(utenteId, schedaId) {
  const scheda = await prisma.schedaAllenamento.findUnique({
    where: { id: parseInt(schedaId) },
    include: {
      esercizi: {
        include: { esercizio: { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } } },
        orderBy: { ordineEsecuzione: 'asc' }
      }
    }
  });
  if (!scheda) throw new ErroreNonTrovato(t('botService.schedaNonTrovata'));
  if (scheda.creatoreId !== utenteId && scheda.visibilita !== 'GLOBALE') {
    throw new ErroreNonTrovato(t('botService.schedaNonTrovata'));
  }

  const righe = scheda.esercizi.map((e, i) => {
    const eCardio = e.riscaldamento || e.durataMinuti != null || e.velocitaKmh != null ||
                    e.livelloResistenza != null || e.distanzaKm != null;
    const nome = nomeMostrato(e.esercizio);
    if (eCardio) {
      const dettagli = dettagliCardio(e);
      return t(dettagli ? 'botService.voce.cardioSchedaDettagli' : 'botService.voce.cardioScheda', {
        n: i + 1, icona: e.riscaldamento ? '🔥' : '🏃', nome, dettagli
      });
    }
    return rigaForza(i + 1, nome, e.serieTarget, e.repTarget, e.recuperoSecondi);
  });
  const testo = t('botService.scheda.testo', {
    titolo: scheda.titolo,
    livello: traduciODato(`botService.livelli.${scheda.livello}`, scheda.livello),
    righe: righe.join('\n') || t('botService.scheda.nessunEsercizio')
  });
  return { id: scheda.id, titolo: scheda.titolo, testo, numEsercizi: scheda.esercizi.length };
}

/** Summary of the user's stats, ready to send on Telegram (Markdown). */
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

/** Exercises of a muscle group, with the user's most used at the top (C4). */
export async function eserciziPerGruppo(utenteId, gruppo, limite = 12) {
  const [esercizi, usatiIds] = await Promise.all([
    prisma.esercizio.findMany({ where: { gruppoMuscoloPrimario: gruppo }, select: { id: true, nome: true, nomeIt: true } }),
    eserciziPiuUsatiIds(utenteId)
  ]);
  const rank = new Map(usatiIds.map((id, i) => [id, i]));
  esercizi.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9));
  return esercizi.slice(0, limite).map(e => ({ id: e.id, nome: nomeMostrato(e) }));
}

/** The user's N most used exercises (the "più usati" (most used) shortcut). */
export async function eserciziPiuUsati(utenteId, limite = 12) {
  const ids = await eserciziPiuUsatiIds(utenteId);
  if (!ids.length) return [];
  const top = ids.slice(0, limite);
  const esercizi = await prisma.esercizio.findMany({ where: { id: { in: top } }, select: { id: true, nome: true, nomeIt: true } });
  const ordine = new Map(top.map((id, i) => [id, i]));
  return esercizi.sort((a, b) => ordine.get(a.id) - ordine.get(b.id)).map(e => ({ id: e.id, nome: nomeMostrato(e) }));
}

/** Adds an exercise (by id) to the draft, from the guided creation. */
export async function aggiungiEsercizioGuidato(utenteId, esercizioId, serie = 3, ripetizioni = '8-12') {
  const es = await prisma.esercizio.findUnique({ where: { id: parseInt(esercizioId) }, select: { id: true, nome: true, nomeIt: true } });
  if (!es) throw new ErroreNonTrovato(t('botService.esercizioNonTrovato'));
  const stato = await caricaStato(utenteId);
  stato.bozza.esercizi.push({
    tipo: 'FORZA', esercizioId: es.id, nome: es.nome, nomeIt: es.nomeIt,
    serie: parseInt(serie) || 3, ripetizioni: String(ripetizioni || '8-12'), recuperoSecondi: 90
  });
  await salvaStato(utenteId, stato);
  return { aggiunto: nomeMostrato(es), totaleEsercizi: stato.bozza.esercizi.length };
}

/** Turns the draft into a workout plan (guided creation). */
export async function terminaSchedaGuidata(utenteId, titolo = null) {
  const stato = await caricaStato(utenteId);
  if (!stato.bozza.esercizi.length) throw new ErroreValidazione(t('botService.bozzaVuotaGuidata'));
  const scheda = await prisma.schedaAllenamento.create({
    data: {
      titolo: titolo || t('botService.titoloSchedaPredefinito'), descrizione: t('botService.descrizioneScheda'),
      livello: 'BASE', visibilita: 'PERSONALE', creatoreId: utenteId,
      esercizi: {
        create: stato.bozza.esercizi.map((e, i) => {
          if (e.tipo === 'CARDIO') {
            return { esercizioId: e.esercizioId, ordineEsecuzione: i + 1, riscaldamento: !!e.riscaldamento, durataMinuti: e.durataMinuti ?? null, velocitaKmh: e.velocitaKmh ?? null, inclinazione: e.inclinazione ?? null, livelloResistenza: e.livelloResistenza ?? null, distanzaKm: e.distanzaKm ?? null, serieTarget: 1, repTarget: null, recuperoSecondi: 0 };
          }
          return { esercizioId: e.esercizioId, serieTarget: e.serie, repTarget: e.ripetizioni, recuperoSecondi: e.recuperoSecondi, ordineEsecuzione: i + 1 };
        })
      }
    },
    include: { esercizi: true }
  });
  stato.bozza = { titolo: null, livello: null, esercizi: [] };
  await salvaStato(utenteId, stato);
  return { schedaId: scheda.id, titolo: scheda.titolo, numEsercizi: scheda.esercizi.length };
}
