// Admin must be able to delete users even when other users have trained with
// their workout plans. The RESTRICT foreign key on SessioneAllenamento.scheda
// would block the deletion: plans in use should be transferred instead.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eliminaUtente } from '../../src/services/utenti.service.js';
import prisma from '../../src/config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato } from '../../src/utils/errori.js';

describe('eliminaUtente - admin deletion', () => {
  it('elimina un utente le cui schede sono state usate da altri', async () => {
    // Setup: create a SUPERADMIN, a regular user (creator), and a client
    const admin = await prisma.utente.create({
      data: {
        email: 'admin-test-delete@example.com',
        nome: 'Admin Test',
        passwordHash: 'dummy',
        ruolo: 'SUPERADMIN',
        emailVerificata: true
      }
    });

    const creatore = await prisma.utente.create({
      data: {
        email: 'creator-test-delete@example.com',
        nome: 'Creator Test',
        passwordHash: 'dummy',
        ruolo: 'UTENTE',
        emailVerificata: true
      }
    });

    const client = await prisma.utente.create({
      data: {
        email: 'client-test-delete@example.com',
        nome: 'Client Test',
        passwordHash: 'dummy',
        ruolo: 'UTENTE',
        emailVerificata: true
      }
    });

    // Creator creates a workout plan
    const scheda = await prisma.schedaAllenamento.create({
      data: {
        titolo: 'Plan Test Delete',
        creatoreId: creatore.id,
        visibilita: 'GLOBALE'
      }
    });

    // Client trains with the creator's plan (this triggers the RESTRICT constraint)
    const sessione = await prisma.sessioneAllenamento.create({
      data: {
        utenteId: client.id,
        schedaId: scheda.id,
        dataInizio: new Date()
      }
    });

    // Admin tries to delete the creator: should succeed without errors
    const risultato = await eliminaUtente(creatore.id);
    assert.equal(risultato, true);

    // Verify the creator is gone
    const creatoreEliminato = await prisma.utente.findUnique({ where: { id: creatore.id } });
    assert.equal(creatoreEliminato, null);

    // Verify the plan was transferred to the admin, not deleted
    const schedaAggiornata = await prisma.schedaAllenamento.findUnique({ where: { id: scheda.id } });
    assert.notEqual(schedaAggiornata, null);
    assert.equal(schedaAggiornata.creatoreId, admin.id);

    // Verify the client's workout session still exists
    const sessioneEsiste = await prisma.sessioneAllenamento.findUnique({ where: { id: sessione.id } });
    assert.notEqual(sessioneEsiste, null);

    // Cleanup
    await prisma.sessioneAllenamento.delete({ where: { id: sessione.id } });
    await prisma.schedaAllenamento.delete({ where: { id: scheda.id } });
    await prisma.utente.delete({ where: { id: client.id } });
    await prisma.utente.delete({ where: { id: admin.id } });
  });

  it('rifiuta l\'eliminazione di un SUPERADMIN', async () => {
    const admin = await prisma.utente.create({
      data: {
        email: 'admin-noremove@example.com',
        nome: 'Admin NoRemove',
        passwordHash: 'dummy',
        ruolo: 'SUPERADMIN',
        emailVerificata: true
      }
    });

    await assert.rejects(
      async () => eliminaUtente(admin.id),
      (err) => err instanceof ErroreNonAutorizzato
    );

    // Cleanup
    await prisma.utente.delete({ where: { id: admin.id } });
  });

  it('restituisce errore se l\'utente non esiste', async () => {
    await assert.rejects(
      async () => eliminaUtente(999999),
      (err) => err instanceof ErroreNonTrovato
    );
  });
});
