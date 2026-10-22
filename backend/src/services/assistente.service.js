// ============================================
// GymMaster — AI assistant service (Gemini)
// Google Gemini API integration for fitness tips
// ============================================

import { GoogleGenAI } from '@google/genai';
import prisma from '../config/database.js';
import { ErroreApp, ErroreValidazione } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { t, linguaCorrente, localeDi } from '../i18n/index.js';
import { fusoCorrente } from '../utils/date.js';
import { titoloAllenamento } from '../utils/titoloAllenamento.js';

// Initializes the Gemini client (lazily)
let clientAI = null;

function ottieniClientAI() {
  if (!clientAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'LA_TUA_API_KEY_GEMINI') {
      throw new ErroreApp(
        t('assistenteService.chiaveNonConfigurata'),
        503,
        'AI_NON_CONFIGURATA'
      );
    }
    clientAI = new GoogleGenAI({ apiKey });
  }
  return clientAI;
}

// The system prompt (assistenteService.promptSistema) gives the assistant its
// context. It is written in each language and tells the model to answer in
// that one: the language of the request (linguaCorrente()), so the app's.

/**
 * Sends a message to the AI assistant along with the user's context.
 */
export async function chiediAssistente(utenteId, messaggio, conversazioneAiId = null) {
  if (!messaggio || messaggio.trim().length === 0) {
    throw new ErroreValidazione(t('assistenteService.messaggioVuoto'));
  }

  if (messaggio.length > 1000) {
    throw new ErroreValidazione(t('assistenteService.messaggioTroppoLungo'));
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
          orderBy: { inviatoIl: 'desc' },
          take: 20 // Last 20 messages for context
        }
      }
    });

    if (!conversazioneAI || conversazioneAI.utenteId !== utenteId) {
      throw new ErroreValidazione(t('assistenteService.conversazioneNonTrovata'));
    }

    // Reverse the array to get chronological order (oldest first)
    if (conversazioneAI.messaggi) {
      conversazioneAI.messaggi.reverse();
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
        systemInstruction: t('assistenteService.promptSistema') + '\n\n' + contestoUtente,
        maxOutputTokens: 1024,
        temperature: 0.7
      }
    });

    const testoRisposta = risposta.text || t('assistenteService.rispostaVuota');

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
        t('assistenteService.limiteRichieste'),
        429,
        'AI_RATE_LIMIT'
      );
    }

    throw new ErroreApp(
      t('assistenteService.erroreComunicazione'),
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

  let contesto = `\n${t('assistenteService.contesto.intestazione')}\n${t('assistenteService.contesto.nome', { nome: utente.nome })}`;

  if (utente.palestra) {
    contesto += `\n${t('assistenteService.contesto.palestra', { nomeCatena: utente.palestra.nomeCatena, citta: utente.palestra.citta })}`;
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
      titolo: true,
      scheda: { select: { titolo: true } }
    }
  });

  if (ultimeSessioni.length > 0) {
    contesto += `\n\n${t('assistenteService.contesto.ultimeSessioni')}`;
    for (const s of ultimeSessioni) {
      contesto += `\n- ${t('assistenteService.contesto.sessione', {
        titolo: titoloAllenamento(s),
        data: s.dataInizio.toLocaleDateString(localeDi(), { timeZone: fusoCorrente() }),
        durata: s.durataMinuti || '?',
        volume: s.volumeTotaleKg || '?'
      })}`;
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
    contesto += `\n\n${t('assistenteService.contesto.recordRecenti')}`;
    for (const r of records) {
      contesto += `\n- ${t('assistenteService.contesto.record', { esercizio: r.esercizio.nome, peso: r.pesoMaxRaggiunto })}`;
    }
  }

  return contesto;
}
