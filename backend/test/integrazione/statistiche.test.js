// ============================================
// GymMaster — Statistics integration tests
// Verify period calculations are not affected by reset date
// ============================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { creaApp } from '../../src/app.js';
import prisma from '../../src/config/database.js';
import jwt from 'jsonwebtoken';

describe('Statistics period filtering', () => {
  let app, utente;

  before(async () => {
    app = creaApp();

    // Create test user
    utente = await prisma.utente.create({
      data: {
        email: `test-statistiche-${Date.now()}@example.com`,
        nome: 'Test Statistiche',
        passwordHash: 'dummy',
        emailVerificata: true
      }
    });

    // Create workouts: 2 old (100 days ago), 5 recent (last 30 days)
    const schedaId = (await prisma.schedaAllenamento.create({
      data: { creatoreId: utente.id, titolo: 'Test', esercizi: [] }
    })).id;

    const oggi = new Date();
    const allenamenti = [
      // Old workouts (before 90 days)
      new Date(oggi.getTime() - 100 * 86400000),
      new Date(oggi.getTime() - 95 * 86400000),
      // Recent workouts (last 30 days)
      new Date(oggi.getTime() - 25 * 86400000),
      new Date(oggi.getTime() - 20 * 86400000),
      new Date(oggi.getTime() - 15 * 86400000),
      new Date(oggi.getTime() - 10 * 86400000),
      new Date(oggi.getTime() - 5 * 86400000),
    ];

    for (const data of allenamenti) {
      await prisma.sessioneAllenamento.create({
        data: {
          utenteId: utente.id,
          schedaId,
          dataInizio: data,
          dataFine: new Date(data.getTime() + 3600000),
          durataMinuti: 60,
          volumeTotaleKg: 1000
        }
      });
    }

    // Set reset date to 40 days ago (between recent and old workouts)
    await prisma.utente.update({
      where: { id: utente.id },
      data: { dataResetStatistiche: new Date(oggi.getTime() - 40 * 86400000) }
    });
  });

  after(async () => {
    // Clean up: delete user and all related data
    await prisma.sessioneAllenamento.deleteMany({ where: { utenteId: utente.id } });
    await prisma.schedaAllenamento.deleteMany({ where: { creatoreId: utente.id } });
    await prisma.utente.delete({ where: { id: utente.id } });
  });

  const creaToken = (utenteId) => {
    return jwt.sign({ utenteId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  };

  it('should return correct workout count for 30 days period', async () => {
    const token = creaToken(utente.id);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/statistiche/sessioni?giorni=60',
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.ok(data.successo);

    // Should include 5 recent workouts only
    const totaleSessioni = data.dati.reduce((sum, day) => sum + day.sessioni, 0);
    assert.equal(totaleSessioni, 5, 'Should count 5 workouts in last 60 days');
  });

  it('should return correct workout count for 90 days period', async () => {
    const token = creaToken(utente.id);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/statistiche/sessioni?giorni=180',
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.ok(data.successo);

    // Should include all 7 workouts (2 old + 5 recent)
    const totaleSessioni = data.dati.reduce((sum, day) => sum + day.sessioni, 0);
    assert.equal(totaleSessioni, 7, 'Should count all 7 workouts in last 180 days');
  });

  it('should not be limited by dataResetStatistiche', async () => {
    // The bug was: dataResetStatistiche (40 days ago) would cap both periods
    // at the same 40 days, making 30-day and 90-day show the same count
    const token = creaToken(utente.id);

    const res30 = await app.inject({
      method: 'GET',
      url: '/api/v1/statistiche/sessioni?giorni=60',
      headers: { authorization: `Bearer ${token}` }
    });

    const res90 = await app.inject({
      method: 'GET',
      url: '/api/v1/statistiche/sessioni?giorni=180',
      headers: { authorization: `Bearer ${token}` }
    });

    const count30 = JSON.parse(res30.body).dati.reduce((s, d) => s + d.sessioni, 0);
    const count90 = JSON.parse(res90.body).dati.reduce((s, d) => s + d.sessioni, 0);

    assert.ok(count90 > count30,
      `90-day period (${count90}) should have more workouts than 30-day period (${count30})`);
  });
});
