// The AI assistant must see the most recent messages in long conversations,
// not the first ones: with orderBy asc + take 20 it would lose the thread.
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock dependencies before importing the service
const mockPrisma = {
  conversazioneAI: {
    findUnique: mock.fn(),
    create: mock.fn()
  },
  messaggioAI: {
    create: mock.fn()
  },
  utente: {
    findUnique: mock.fn()
  },
  sessioneAllenamento: {
    findMany: mock.fn()
  },
  recordPersonale: {
    findMany: mock.fn()
  }
};

const mockAI = {
  models: {
    generateContent: mock.fn()
  }
};

const mockGoogleGenAI = mock.fn(() => mockAI);

// Setup mocks
mock.module('../../src/config/database.js', {
  namedExports: { default: mockPrisma }
});

mock.module('@google/genai', {
  namedExports: { GoogleGenAI: mockGoogleGenAI }
});

const { chiediAssistente } = await import('../../src/services/assistente.service.js');

describe('assistente AI - ordine messaggi', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key-123';
    // Reset all mocks
    mockPrisma.conversazioneAI.findUnique.mock.resetCalls();
    mockPrisma.messaggioAI.create.mock.resetCalls();
    mockPrisma.utente.findUnique.mock.resetCalls();
    mockPrisma.sessioneAllenamento.findMany.mock.resetCalls();
    mockPrisma.recordPersonale.findMany.mock.resetCalls();
    mockAI.models.generateContent.mock.resetCalls();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('prende gli ultimi 20 messaggi, non i primi', async () => {
    const conversazioneId = 'conv-123';
    const utenteId = 1;

    // Simulate a conversation with 25 messages (numbered 1-25)
    // The query with 'desc' + take 20 returns messages 25, 24, ..., 6
    const messaggiDalDatabase = Array.from({ length: 20 }, (_, i) => ({
      id: 25 - i, // 25, 24, 23, ..., 6
      contenuto: `Messaggio ${25 - i}`,
      ruolo: i % 2 === 0 ? 'utente' : 'assistente',
      inviatoIl: new Date(2026, 0, 25 - i)
    }));

    mockPrisma.conversazioneAI.findUnique.mock.mockImplementationOnce(() =>
      Promise.resolve({
        id: conversazioneId,
        utenteId,
        messaggi: messaggiDalDatabase
      })
    );

    mockPrisma.messaggioAI.create.mock.mockImplementation(() =>
      Promise.resolve({ id: 26, contenuto: 'Test', ruolo: 'utente' })
    );

    mockPrisma.utente.findUnique.mock.mockImplementation(() =>
      Promise.resolve({ nome: 'Test User', palestra: null })
    );

    mockPrisma.sessioneAllenamento.findMany.mock.mockImplementation(() =>
      Promise.resolve([])
    );

    mockPrisma.recordPersonale.findMany.mock.mockImplementation(() =>
      Promise.resolve([])
    );

    mockAI.models.generateContent.mock.mockImplementation(() =>
      Promise.resolve({ text: 'Risposta AI' })
    );

    await chiediAssistente(utenteId, 'Nuovo messaggio', conversazioneId);

    // Verify generateContent was called
    assert.equal(mockAI.models.generateContent.mock.callCount(), 1);

    const chiamataAI = mockAI.models.generateContent.mock.calls[0].arguments[0];
    const storicoInviato = chiamataAI.contents;

    // The history should contain the 20 messages in chronological order
    // (after reverse), plus the new message: 21 total
    assert.equal(storicoInviato.length, 21);

    // First message in history should be #6 (the oldest of the last 20)
    assert.equal(storicoInviato[0].parts[0].text, 'Messaggio 6');

    // Last message before the new one should be #25
    assert.equal(storicoInviato[19].parts[0].text, 'Messaggio 25');

    // The new message is at the end
    assert.equal(storicoInviato[20].parts[0].text, 'Nuovo messaggio');
  });

  it('gestisce conversazioni con meno di 20 messaggi', async () => {
    const conversazioneId = 'conv-456';
    const utenteId = 2;

    // Short conversation: 5 messages
    const messaggiDalDatabase = Array.from({ length: 5 }, (_, i) => ({
      id: 5 - i, // 5, 4, 3, 2, 1 (from database with desc)
      contenuto: `Msg ${5 - i}`,
      ruolo: i % 2 === 0 ? 'utente' : 'assistente',
      inviatoIl: new Date(2026, 0, 5 - i)
    }));

    mockPrisma.conversazioneAI.findUnique.mock.mockImplementationOnce(() =>
      Promise.resolve({
        id: conversazioneId,
        utenteId,
        messaggi: messaggiDalDatabase
      })
    );

    mockPrisma.messaggioAI.create.mock.mockImplementation(() =>
      Promise.resolve({ id: 6, contenuto: 'Test', ruolo: 'utente' })
    );

    mockPrisma.utente.findUnique.mock.mockImplementation(() =>
      Promise.resolve({ nome: 'Test User', palestra: null })
    );

    mockPrisma.sessioneAllenamento.findMany.mock.mockImplementation(() =>
      Promise.resolve([])
    );

    mockPrisma.recordPersonale.findMany.mock.mockImplementation(() =>
      Promise.resolve([])
    );

    mockAI.models.generateContent.mock.mockImplementation(() =>
      Promise.resolve({ text: 'Risposta AI' })
    );

    await chiediAssistente(utenteId, 'Sesto messaggio', conversazioneId);

    const chiamataAI = mockAI.models.generateContent.mock.calls[0].arguments[0];
    const storicoInviato = chiamataAI.contents;

    // Should have all 5 messages + the new one
    assert.equal(storicoInviato.length, 6);

    // Should be in chronological order after reverse
    assert.equal(storicoInviato[0].parts[0].text, 'Msg 1');
    assert.equal(storicoInviato[4].parts[0].text, 'Msg 5');
    assert.equal(storicoInviato[5].parts[0].text, 'Sesto messaggio');
  });
});
