// ============================================
// GymMaster — AI assistant service (Gemini)
// Google Gemini API integration for fitness tips
// ============================================

import { GoogleGenAI } from '@google/genai';
import prisma from '../config/database.js';
import { ErroreApp, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';

// Initializes the Gemini client (lazily)
let clientAI = null;

function ottieniClientAI() {
  if (!clientAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'LA_TUA_API_KEY_GEMINI') {
      throw new ErroreApp(
        'API Key di Google Gemini non configurata. Visita https://aistudio.google.com/apikey per ottenerne una gratuita.',
        503,
        'AI_NON_CONFIGURATA'
      );
    }
    clientAI = new GoogleGenAI({ apiKey });
  }
  return clientAI;
}

// System prompt that gives the assistant its context
const SYSTEM_PROMPT = `Sei GymBot, un assistente fitness virtuale integrato nell'app GymMaster.

Le tue competenze:
- Analisi schede di allenamento e suggerimenti per migliorarle
- Consigli sulla progressione dei carichi basati sui dati dell'utente
- Identificazione di squilibri muscolari dai log di allenamento
- Suggerimenti su tecnica, nutrizione base e recupero
- Sostituzione esercizi (es. se un macchinario è occupato)

Regole:
1. Rispondi SEMPRE in italiano
2. Sii conciso e pratico, non accademico
3. Se non sei sicuro di un consiglio medico, suggerisci di consultare un professionista
4. Usa emoji per rendere le risposte più leggibili
5. Quando suggerisci esercizi, menziona il gruppo muscolare bersaglio
6. Non inventare dati: usa solo le informazioni fornite dal contesto utente`;

/**
 * Sends a message to the AI assistant along with the user's context.
 */
export async function chiediAssistente(utenteId, messaggio, conversazioneAiId = null) {
  if (!messaggio || messaggio.trim().length === 0) {
    throw new ErroreValidazione('Il messaggio non può essere vuoto');
  }

  if (messaggio.length > 1000) {
    throw new ErroreValidazione('Il messaggio non può superare 1000 caratteri');
  }

  const ai = ottieniClientAI();

  // Load the user's context to personalize the answer
  const contestoUtente = await costruisciContestoUtente(utenteId);

  // Handle the conversation (new or existing)
  let conversazioneAI;

  if (conversazioneAiId) {
    conversazioneAI = await prisma.conversazioneAI.findUnique({
      where: { id: conversazioneAiId },
      include: {
        messaggi: {
          orderBy: { inviatoIl: 'asc' },
          take: 20 // Last 20 messages for context
        }
      }
    });

    if (!conversazioneAI || conversazioneAI.utenteId !== utenteId) {
      throw new ErroreValidazione('Conversazione AI non trovata');
    }
  } else {
    conversazioneAI = await prisma.conversazioneAI.create({
      data: {
        utenteId,
        contesto: 'domanda_libera'
      },
      include: { messaggi: true }
    });
  }

  // Save the user's message
  await prisma.messaggioAI.create({
    data: {
      conversazioneAiId: conversazioneAI.id,
      ruolo: 'utente',
      contenuto: messaggio
    }
  });

  // Build the history for Gemini
  const storicoConversazione = (conversazioneAI.messaggi || []).map(m => ({
    role: m.ruolo === 'utente' ? 'user' : 'model',
    parts: [{ text: m.contenuto }]
  }));

  // Add the current message
  storicoConversazione.push({
    role: 'user',
    parts: [{ text: messaggio }]
  });

  try {
    // Call the Gemini API
    const risposta = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: storicoConversazione,
      config: {
        systemInstruction: SYSTEM_PROMPT + '\n\n' + contestoUtente,
        maxOutputTokens: 1024,
        temperature: 0.7
      }
    });

    const testoRisposta = risposta.text || 'Mi dispiace, non sono riuscito a generare una risposta.';

    // Save the assistant's answer
    await prisma.messaggioAI.create({
      data: {
        conversazioneAiId: conversazioneAI.id,
        ruolo: 'assistente',
        contenuto: testoRisposta
      }
    });

    logger.info({ utenteId, conversazioneAiId: conversazioneAI.id }, 'Risposta assistente AI generata');

    return {
      conversazioneAiId: conversazioneAI.id,
      risposta: testoRisposta
    };
  } catch (errore) {
    logger.error({ utenteId, errore: errore.message }, 'Errore chiamata Gemini API');

    if (errore.message?.includes('429') || errore.message?.includes('quota')) {
      throw new ErroreApp(
        'Limite di richieste AI raggiunto, riprova tra qualche minuto.',
        429,
        'AI_RATE_LIMIT'
      );
    }

    throw new ErroreApp(
      'Errore nella comunicazione con l\'assistente AI. Riprova più tardi.',
      502,
      'AI_ERRORE'
    );
  }
}

/**
 * Gets the user's AI conversation history.
 */
export async function ottieniConversazioniAI(utenteId) {
  return prisma.conversazioneAI.findMany({
    where: { utenteId },
    include: {
      messaggi: {
        orderBy: { inviatoIl: 'desc' },
        take: 1 // Only the latest message, for the preview
      }
    },
    orderBy: { creatoIl: 'desc' },
    take: 20
  });
}

/**
 * Builds a personalized context from the user's data.
 */
async function costruisciContestoUtente(utenteId) {
  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: {
      nome: true,
      palestra: { select: { nomeCatena: true, citta: true } }
    }
  });

  if (!utente) return '';

  let contesto = `\n--- CONTESTO UTENTE ---\nNome: ${utente.nome}`;

  if (utente.palestra) {
    contesto += `\nPalestra: ${utente.palestra.nomeCatena} (${utente.palestra.citta})`;
  }

  // Load the last 5 workouts for context
  const ultimeSessioni = await prisma.sessioneAllenamento.findMany({
    where: { utenteId },
    orderBy: { dataInizio: 'desc' },
    take: 5,
    select: {
      dataInizio: true,
      durataMinuti: true,
      volumeTotaleKg: true,
      scheda: { select: { titolo: true } }
    }
  });

  if (ultimeSessioni.length > 0) {
    contesto += '\n\nUltime sessioni:';
    for (const s of ultimeSessioni) {
      contesto += `\n- ${s.scheda.titolo} (${s.dataInizio.toLocaleDateString('it-IT')}) - ${s.durataMinuti || '?'} min, ${s.volumeTotaleKg || '?'} kg volume`;
    }
  }

  // Recent personal records
  const records = await prisma.recordPersonale.findMany({
    where: { utenteId },
    orderBy: { dataRecord: 'desc' },
    take: 5,
    include: { esercizio: { select: { nome: true } } }
  });

  if (records.length > 0) {
    contesto += '\n\nRecord personali recenti:';
    for (const r of records) {
      contesto += `\n- ${r.esercizio.nome}: ${r.pesoMaxRaggiunto} kg`;
    }
  }

  return contesto;
}
