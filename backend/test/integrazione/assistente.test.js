// The AI assistant must see the most recent messages in long conversations,
// not the first ones: with orderBy asc + take 20 it would lose the thread.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../src/config/database.js';

describe('assistente AI - ordine messaggi nella query', () => {
  it('la query prende gli ultimi 20 messaggi con desc, non i primi con asc', async () => {
    // Create a test user
    const utente = await prisma.utente.create({
      data: {
        email: 'test-assistente@example.com',
        nome: 'Test Assistente',
        passwordHash: 'dummy',
        emailVerificata: true
      }
    });

    // Create a conversation with 25 messages
    const conversazione = await prisma.conversazioneAI.create({
      data: {
        utenteId: utente.id,
        contesto: 'test'
      }
    });

    // Add 25 messages, numbered 1-25
    for (let i = 1; i <= 25; i++) {
      await prisma.messaggioAI.create({
        data: {
          conversazioneAiId: conversazione.id,
          ruolo: i % 2 === 1 ? 'utente' : 'assistente',
          contenuto: `Messaggio ${i}`,
          inviatoIl: new Date(2026, 0, i) // Sequential dates
        }
      });
    }

    // Query with desc + take 20 (what the fixed code does)
    const messaggiDesc = await prisma.conversazioneAI.findUnique({
      where: { id: conversazione.id },
      include: {
        messaggi: {
          orderBy: { inviatoIl: 'desc' },
          take: 20
        }
      }
    });

    // Should return messages 25, 24, 23, ..., 6 (the last 20)
    assert.equal(messaggiDesc.messaggi.length, 20);
    assert.equal(messaggiDesc.messaggi[0].contenuto, 'Messaggio 25'); // Most recent first
    assert.equal(messaggiDesc.messaggi[19].contenuto, 'Messaggio 6'); // Oldest of the 20

    // After reversing (what the code does), should be 6, 7, ..., 25
    const messaggiOrdinati = [...messaggiDesc.messaggi].reverse();
    assert.equal(messaggiOrdinati[0].contenuto, 'Messaggio 6');
    assert.equal(messaggiOrdinati[19].contenuto, 'Messaggio 25');

    // Query with asc + take 20 (what the OLD buggy code did)
    const messaggiAsc = await prisma.conversazioneAI.findUnique({
      where: { id: conversazione.id },
      include: {
        messaggi: {
          orderBy: { inviatoIl: 'asc' },
          take: 20
        }
      }
    });

    // Would return messages 1, 2, 3, ..., 20 (the FIRST 20, wrong!)
    assert.equal(messaggiAsc.messaggi[0].contenuto, 'Messaggio 1');
    assert.equal(messaggiAsc.messaggi[19].contenuto, 'Messaggio 20');

    // Cleanup
    await prisma.messaggioAI.deleteMany({ where: { conversazioneAiId: conversazione.id } });
    await prisma.conversazioneAI.delete({ where: { id: conversazione.id } });
    await prisma.utente.delete({ where: { id: utente.id } });
  });
});
