// ============================================
// GymMaster — Opaque tokens (refresh, email verification, password reset)
// ============================================
//
// The client gets the token; the database keeps only its hash. So a copy
// of the database (a backup, a dump) holds no working tokens.

import crypto from 'crypto';

/** A new token: random, hexadecimal */
export function nuovoToken(byte = 32) {
  return crypto.randomBytes(byte).toString('hex');
}

/**
 * The hash to save and to look up in the database. SHA-256 is enough: the
 * token is long and random, a slow function like argon2 would add nothing.
 * The migration 20261010_token_come_impronta computes the same thing in SQL.
 */
export function improntaToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * The refresh token that takes the place of `token` on rotation.
 *
 * It is derived from the previous one with a server secret, not drawn at
 * random: if the phone repeats the renewal within the grace period (the
 * response was lost, two tabs renew at once) it gets the same replacement
 * back by computing it again, because the database only holds its hash.
 * Without the secret it cannot be predicted.
 */
export function tokenSuccessivo(token) {
  const segreto = process.env.JWT_SEGRETO_REFRESH;
  if (!segreto) throw new Error('JWT_SEGRETO_REFRESH non impostato');
  return crypto.createHmac('sha256', segreto).update(String(token)).digest('hex');
}
