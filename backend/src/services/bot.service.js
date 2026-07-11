// ============================================
// GymMaster — Service Bot Telegram
// - Collegamento account (codice usa-e-getta)
// - Assistente conversazionale (Gemini function-calling) per creare schede
// - Matching esercizi italiano -> catalogo inglese (v1)
// - Lettura schede dell'utente
// ============================================

import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import prisma from '../config/database.js';
import redis from '../config/redis.js';
import { ErroreApp, ErroreValidazione, ErroreNonTrovato } from '../utils/errori.js';
import logger from '../utils/logger.js';

// --- Client Gemini (lazy) ---
let clientAI = null;
function ottieniClientAI() {
  if (!clientAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'LA_TUA_API_KEY_GEMINI') {
      throw new ErroreApp('Assistente AI non configurato (GEMINI_API_KEY mancante).', 503, 'AI_NON_CONFIGURATA');
    }
    clientAI = new GoogleGenAI({ apiKey });
  }
  return clientAI;
}

const MODELLO = 'gemini-2.5-flash';

// ============================================
// COLLEGAMENTO ACCOUNT
// ============================================

/** Genera/aggiorna un codice usa-e-getta per collegare l'account dall'app. */
export async function generaCodiceCollegamento(utenteId) {
  const codice = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 caratteri
  const codiceScadenza = new Date(Date.now() + 10 * 60 * 1000); // 10 minuti

  await prisma.collegamentoTelegram.upsert({
    where: { utenteId },
    create: { utenteId, codice, codiceScadenza },
    update: { codice, codiceScadenza }
  });

  const username = process.env.TELEGRAM_BOT_USERNAME || null;
  const deepLink = username ? `https://t.me/${username}?start=${codice}` : null;

  return { codice, deepLink, username, scadenza: codiceScadenza };
}

/** Stato collegamento per la UI. */
export async function statoCollegamento(utenteId) {
  const c = await prisma.collegamentoTelegram.findUnique({ where: { utenteId } });
  return { collegato: !!(c && c.telegramChatId), collegatoIl: c?.collegatoIl || null };
}

/** Scollega l'account dal bot. */
export async function scollegaTelegram(utenteId) {
  await prisma.collegamentoTelegram.deleteMany({ where: { utenteId } });
  return { successo: true };
}

/** Collega una chat Telegram a un account validando il codice. */
export async function collegaChat(chatId, codice) {
  if (!codice) throw new ErroreValidazione('Codice mancante');
  const codiceNorm = String(codice).trim().toUpperCase();

  const collegamento = await prisma.collegamentoTelegram.findUnique({ where: { codice: codiceNorm } });
  if (!collegamento || !collegamento.codiceScadenza || collegamento.codiceScadenza < new Date()) {
    throw new ErroreValidazione('Codice non valido o scaduto. Generane uno nuovo dall\'app.');
  }

  // Libera eventuali altri account collegati a questo chatId
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
// MATCHING ESERCIZI (IT -> catalogo EN, v1)
// ============================================

const STOPWORDS = new Set([
  'con', 'per', 'di', 'del', 'della', 'dei', 'delle', 'il', 'la', 'le', 'lo', 'gli', 'un', 'una', 'uno',
  'and', 'with', 'the', 'for', 'of', 'to', 'da', 'in', 'su', 'ho', 'fatto', 'serie',
  'ripetizioni', 'rep', 'reps', 'set', 'sets'
]);

function tokenizza(testo) {
  return String(testo || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Cerca i migliori candidati nel catalogo (nomi in inglese) per una descrizione. */
export async function cercaEserciziPerDescrizione(descrizione, limite = 5) {
  let tokens = tokenizza(descrizione);
  if (tokens.length === 0) {
    const fallback = String(descrizione || '').toLowerCase().trim();
    if (!fallback) return [];
    tokens = [fallback];
  }

  const candidati = await prisma.esercizio.findMany({
    where: { OR: tokens.map((t) => ({ nome: { contains: t, mode: 'insensitive' } })) },
    select: {
      id: true, nome: true, gruppoMuscoloPrimario: true,
      attrezzatura: { select: { nome: true } }
    },
    take: 60
  });

  const scored = candidati.map((e) => {
    const nl = e.nome.toLowerCase();
    const score = tokens.reduce((s, t) => s + (nl.includes(t) ? 1 : 0), 0);
    return {
      id: e.id,
      nome: e.nome,
      gruppo: e.gruppoMuscoloPrimario,
      attrezzatura: e.attrezzatura?.nome || null,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score || a.nome.length - b.nome.length);
  return scored.slice(0, limite);
}

// Macchine cardio: parole chiave -> nome esercizio canonico (creato nel seed).
const MACCHINE_CARDIO = [
  { nome: 'Tapis Roulant', chiavi: ['tapis', 'roulant', 'tappeto', 'treadmill', 'corsa', 'camminata', 'corro', 'cammino', 'corri'] },
  { nome: 'Cyclette', chiavi: ['cyclette', 'ciclette', 'cyclet', 'bici', 'bike', 'spinning', 'pedala', 'pedalo'] },
  { nome: 'Ellittica', chiavi: ['ellittica', 'elittica', 'elliptical', 'crosstrainer', 'cross trainer'] },
  { nome: 'Vogatore (Rower)', chiavi: ['vogatore', 'rower', 'remo', 'rowing', 'voga'] },
  { nome: 'Stepper', chiavi: ['stepper', 'step', 'scale', 'climber'] },
  { nome: 'Air Bike', chiavi: ['air bike', 'airbike', 'assault', 'air-bike'] }
];

/** Risolve la macchina cardio richiesta nell'esercizio corrispondente del catalogo. */
async function risolviMacchinaCardio(macchina) {
  const m = String(macchina || '').toLowerCase().trim();
  if (!m) return null;
  const scelta = MACCHINE_CARDIO.find(
    (c) => c.chiavi.some((k) => m.includes(k)) || m.includes(c.nome.toLowerCase())
  );
  if (!scelta) return null;
  const es = await prisma.esercizio.findFirst({ where: { nome: scelta.nome } });
  return es ? { id: es.id, nome: es.nome } : null;
}

// ============================================
// STATO CONVERSAZIONE (Redis)
// ============================================

const TTL_STATO = 6 * 60 * 60; // 6 ore
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

/** Annulla la bozza/conversazione corrente. */
export async function annullaBozza(utenteId) {
  try { await redis.del(chiaveStato(utenteId)); } catch { /* ignora */ }
  return { successo: true };
}

async function verificaRateLimit(utenteId) {
  try {
    const chiave = `bot:rl:${utenteId}`;
    const n = await redis.incr(chiave);
    if (n === 1) await redis.expire(chiave, 60);
    if (n > 15) {
      throw new ErroreApp('Stai scrivendo troppo in fretta, attendi un minuto. ⏳', 429, 'BOT_RATE_LIMIT');
    }
  } catch (e) {
    if (e instanceof ErroreApp) throw e;
    // Redis non disponibile: non bloccare l'utente
  }
}

// ============================================
// MOTORE CONVERSAZIONALE (Gemini function-calling)
// ============================================

const SYSTEM_PROMPT = `Sei GymBot, l'assistente di GymMaster su Telegram. Aiuti l'utente a creare una SCHEDA DI ALLENAMENTO (un template riutilizzabile) parlando in linguaggio naturale mentre si allena.

Come lavori:
- Quando l'utente descrive un esercizio (es. "ho fatto 3 serie di alzate laterali con i manubri da 8 ripetizioni"), chiama lo strumento "cerca_esercizio" passando una descrizione in INGLESE (il catalogo ha i nomi in inglese: es. "dumbbell lateral raise").
- Ricevuti i candidati, scegli quello più pertinente e chiama "aggiungi_esercizio" con il suo esercizioId, le serie e le ripetizioni. Se più candidati sono plausibili e diversi tra loro, CHIEDI all'utente quale intende prima di aggiungere.
- Le ripetizioni vanno passate come stringa (es. "8" oppure "8-12"). Se l'utente non dice il recupero, ometti recuperoSecondi (default 90s).
- Il PESO non viene salvato nei template: se l'utente lo dice, ringrazia ma spiega che la scheda è un modello e il peso lo registrerà durante l'allenamento. Non inventare pesi.
- Per il CARDIO e il RISCALDAMENTO (tapis roulant, cyclette, ellittica, vogatore, stepper, air bike) NON usare cerca_esercizio: usa "aggiungi_cardio" con la macchina e i parametri disponibili (durata in minuti; se indicati: velocità km/h, inclinazione %, resistenza, distanza km). Imposta riscaldamento=true quando l'utente lo presenta come riscaldamento (es. "10 minuti di tapis per scaldarmi").
- Quando l'utente dice che ha finito ("ho finito", "basta", "chiudi"), chiama "termina_scheda" con un titolo sensato (se non te l'ha dato, proponilo o chiedilo).
- Puoi usare "mostra_bozza" per ricapitolare e "rimuovi_ultimo" per togliere l'ultimo esercizio.

Regole:
1. Rispondi SEMPRE in italiano, in modo breve e amichevole, con qualche emoji 💪
2. Non inventare esercizi: usa solo quelli trovati con cerca_esercizio.
3. Conferma ogni aggiunta in una riga ("✅ Aggiunto: <nome> — <serie>x<rip>").
4. Sii proattivo ma non prolisso.`;

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

function riepilogoBozza(bozza) {
  if (!bozza.esercizi.length) return 'La bozza è vuota.';
  const righe = bozza.esercizi.map((e, i) => {
    if (e.tipo === 'CARDIO') {
      const parti = [];
      if (e.durataMinuti != null) parti.push(`${e.durataMinuti} min`);
      if (e.velocitaKmh != null) parti.push(`${e.velocitaKmh} km/h`);
      if (e.inclinazione != null) parti.push(`incl ${e.inclinazione}%`);
      if (e.livelloResistenza != null) parti.push(`liv ${e.livelloResistenza}`);
      if (e.distanzaKm != null) parti.push(`${e.distanzaKm} km`);
      const tag = e.riscaldamento ? '🔥 Riscaldamento' : '🏃 Cardio';
      return `${i + 1}. ${tag}: ${e.nome}${parti.length ? ' — ' + parti.join(', ') : ''}`;
    }
    return `${i + 1}. ${e.nome} — ${e.serie}x${e.ripetizioni} (rec ${e.recuperoSecondi}s)`;
  });
  return `Titolo: ${bozza.titolo || '(da definire)'}\nVoci (${bozza.esercizi.length}):\n${righe.join('\n')}`;
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
        select: { id: true, nome: true }
      });
      if (!es) return { errore: 'Esercizio non trovato. Usa prima cerca_esercizio.' };
      const voce = {
        tipo: 'FORZA',
        esercizioId: es.id,
        nome: es.nome,
        serie: parseInt(args.serie) || 3,
        ripetizioni: String(args.ripetizioni || '8-12'),
        recuperoSecondi: args.recuperoSecondi ? parseInt(args.recuperoSecondi) : 90
      };
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: es.nome, totaleEsercizi: stato.bozza.esercizi.length };
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
        riscaldamento: !!args.riscaldamento,
        durataMinuti: args.durataMinuti != null ? parseInt(args.durataMinuti) : null,
        velocitaKmh: args.velocitaKmh != null ? parseFloat(args.velocitaKmh) : null,
        inclinazione: args.inclinazione != null ? parseFloat(args.inclinazione) : null,
        livelloResistenza: args.livelloResistenza != null ? parseInt(args.livelloResistenza) : null,
        distanzaKm: args.distanzaKm != null ? parseFloat(args.distanzaKm) : null
      };
      stato.bozza.esercizi.push(voce);
      return { ok: true, aggiunto: macchina.nome, riscaldamento: voce.riscaldamento, totaleEsercizi: stato.bozza.esercizi.length };
    }
    case 'mostra_bozza':
      return { riepilogo: riepilogoBozza(stato.bozza), totaleEsercizi: stato.bozza.esercizi.length };
    case 'rimuovi_ultimo': {
      const rimosso = stato.bozza.esercizi.pop();
      return { ok: true, rimosso: rimosso?.nome || null, totaleEsercizi: stato.bozza.esercizi.length };
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
          titolo: args.titolo || 'Scheda da Telegram',
          descrizione: 'Creata via bot Telegram',
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
                  serieTarget: 1,        // mantiene funzionante l'esecuzione (WorkoutLive)
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

/** Elabora un messaggio dell'utente e restituisce la risposta del bot. */
export async function elaboraMessaggio(utente, testo) {
  if (!testo || !testo.trim()) throw new ErroreValidazione('Messaggio vuoto');
  if (testo.length > 1000) throw new ErroreValidazione('Messaggio troppo lungo (max 1000 caratteri)');

  await verificaRateLimit(utente.id);

  const ai = ottieniClientAI();
  const stato = await caricaStato(utente.id);

  const contents = (stato.storia || []).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: testo }] });

  const systemInstruction = SYSTEM_PROMPT + '\n\n--- STATO BOZZA ---\n' + riepilogoBozza(stato.bozza);

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
      throw new ErroreApp('Limite di richieste AI raggiunto, riprova tra poco. ⏳', 429, 'AI_RATE_LIMIT');
    }
    throw new ErroreApp('Errore con l\'assistente AI, riprova tra poco.', 502, 'AI_ERRORE');
  }

  if (!rispostaFinale) rispostaFinale = 'Ok 👍';

  stato.storia = [
    ...(stato.storia || []),
    { role: 'user', text: testo },
    { role: 'model', text: rispostaFinale }
  ].slice(-16);

  await salvaStato(utente.id, stato);

  return { risposta: rispostaFinale };
}

// ============================================
// LETTURA SCHEDE
// ============================================

/** Schede dell'utente + schede globali, in forma compatta per il bot. */
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

/** Dettaglio di una scheda formattato come testo (Markdown Telegram). */
export async function dettaglioSchedaTesto(utenteId, schedaId) {
  const scheda = await prisma.schedaAllenamento.findUnique({
    where: { id: parseInt(schedaId) },
    include: {
      esercizi: {
        include: { esercizio: { select: { nome: true, gruppoMuscoloPrimario: true } } },
        orderBy: { ordineEsecuzione: 'asc' }
      }
    }
  });
  if (!scheda) throw new ErroreNonTrovato('Scheda');
  if (scheda.creatoreId !== utenteId && scheda.visibilita !== 'GLOBALE') {
    throw new ErroreNonTrovato('Scheda');
  }

  const righe = scheda.esercizi.map((e, i) => {
    const eCardio = e.riscaldamento || e.durataMinuti != null || e.velocitaKmh != null ||
                    e.livelloResistenza != null || e.distanzaKm != null;
    if (eCardio) {
      const parti = [];
      if (e.durataMinuti != null) parti.push(`${e.durataMinuti} min`);
      if (e.velocitaKmh != null) parti.push(`${e.velocitaKmh} km/h`);
      if (e.inclinazione != null) parti.push(`incl ${e.inclinazione}%`);
      if (e.livelloResistenza != null) parti.push(`liv ${e.livelloResistenza}`);
      if (e.distanzaKm != null) parti.push(`${e.distanzaKm} km`);
      const tag = e.riscaldamento ? '🔥' : '🏃';
      return `${i + 1}. ${tag} ${e.esercizio.nome}${parti.length ? ' — ' + parti.join(', ') : ''}`;
    }
    return `${i + 1}. ${e.esercizio.nome} — ${e.serieTarget}x${e.repTarget} (rec ${e.recuperoSecondi}s)`;
  });
  const testo = `📋 *${scheda.titolo}*\nLivello: ${scheda.livello}\n\n${righe.join('\n') || '(nessun esercizio)'}`;
  return { id: scheda.id, titolo: scheda.titolo, testo, numEsercizi: scheda.esercizi.length };
}

/** Riepilogo statistiche dell'utente, pronto da inviare su Telegram (Markdown). */
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
  const righe = [
    '*📊 Le tue statistiche*',
    '',
    `🏋️ Allenamenti totali: *${totSessioni}*`,
    `📅 Ultimi 7 giorni: *${sessioni7g}*`,
    `📦 Volume totale: *${volume.toLocaleString('it-IT')} kg*`,
    `⏱️ Tempo totale: *${ore} h*`,
    `🏆 Record personali: *${record}*`
  ];
  if (ultima) righe.push('', `_Ultimo allenamento: ${new Date(ultima.dataInizio).toLocaleDateString('it-IT')}_`);
  return { testo: righe.join('\n') };
}

// ─── Creazione guidata a pulsanti (categorie italiane) ───

/** Regioni del corpo disponibili nel catalogo (italiano). */
export async function categorieEsercizi() {
  const r = await prisma.esercizio.findMany({
    where: { bodyRegion: { not: null } },
    distinct: ['bodyRegion'], select: { bodyRegion: true }, orderBy: { bodyRegion: 'asc' }
  });
  return r.map(x => x.bodyRegion).filter(Boolean);
}

/** Gruppi muscolari di una regione del corpo. */
export async function gruppiPerRegione(bodyRegion) {
  const r = await prisma.esercizio.findMany({
    where: { bodyRegion },
    distinct: ['gruppoMuscoloPrimario'], select: { gruppoMuscoloPrimario: true }, orderBy: { gruppoMuscoloPrimario: 'asc' }
  });
  return r.map(x => x.gruppoMuscoloPrimario).filter(Boolean);
}

/** ID degli esercizi più usati dall'utente, ordinati per frequenza. */
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

/** Esercizi di un gruppo muscolare, con i più usati dall'utente in cima (C4). */
export async function eserciziPerGruppo(utenteId, gruppo, limite = 12) {
  const [esercizi, usatiIds] = await Promise.all([
    prisma.esercizio.findMany({ where: { gruppoMuscoloPrimario: gruppo }, select: { id: true, nome: true } }),
    eserciziPiuUsatiIds(utenteId)
  ]);
  const rank = new Map(usatiIds.map((id, i) => [id, i]));
  esercizi.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9));
  return esercizi.slice(0, limite);
}

/** I N esercizi più usati dall'utente (scorciatoia "più usati"). */
export async function eserciziPiuUsati(utenteId, limite = 12) {
  const ids = await eserciziPiuUsatiIds(utenteId);
  if (!ids.length) return [];
  const top = ids.slice(0, limite);
  const esercizi = await prisma.esercizio.findMany({ where: { id: { in: top } }, select: { id: true, nome: true } });
  const ordine = new Map(top.map((id, i) => [id, i]));
  return esercizi.sort((a, b) => ordine.get(a.id) - ordine.get(b.id));
}

/** Aggiunge un esercizio (per id) alla bozza, dalla creazione guidata. */
export async function aggiungiEsercizioGuidato(utenteId, esercizioId, serie = 3, ripetizioni = '8-12') {
  const es = await prisma.esercizio.findUnique({ where: { id: parseInt(esercizioId) }, select: { id: true, nome: true } });
  if (!es) throw new ErroreNonTrovato('Esercizio');
  const stato = await caricaStato(utenteId);
  stato.bozza.esercizi.push({
    tipo: 'FORZA', esercizioId: es.id, nome: es.nome,
    serie: parseInt(serie) || 3, ripetizioni: String(ripetizioni || '8-12'), recuperoSecondi: 90
  });
  await salvaStato(utenteId, stato);
  return { aggiunto: es.nome, totaleEsercizi: stato.bozza.esercizi.length };
}

/** Finalizza la bozza in una scheda (creazione guidata). */
export async function terminaSchedaGuidata(utenteId, titolo = null) {
  const stato = await caricaStato(utenteId);
  if (!stato.bozza.esercizi.length) throw new ErroreValidazione('La bozza è vuota: aggiungi almeno un esercizio.');
  const scheda = await prisma.schedaAllenamento.create({
    data: {
      titolo: titolo || 'Scheda da Telegram', descrizione: 'Creata via bot Telegram',
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
