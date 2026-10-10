// ============================================
// GymMaster — Token opachi (refresh, verifica email, reset password)
// ============================================
//
// Il client riceve il token; il database ne conserva solo l'impronta. Cosi'
// una copia del database (un backup, un dump) non contiene token funzionanti.

import crypto from 'crypto';

/** Un token nuovo: casuale, esadecimale */
export function nuovoToken(byte = 32) {
  return crypto.randomBytes(byte).toString('hex');
}

/**
 * L'impronta da salvare e da cercare nel database. SHA-256 basta: il token e'
 * lungo e casuale, una funzione lenta come argon2 non aggiungerebbe nulla.
 * La migrazione 20261010_token_come_impronta calcola la stessa cosa in SQL.
 */
export function improntaToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Il refresh token che prende il posto di `token` alla rotazione.
 *
 * E' derivato dal precedente con un segreto del server, non estratto a caso:
 * se il telefono ripete il rinnovo entro il periodo di grazia (la risposta si
 * era persa, due schede rinnovano insieme) gli si restituisce lo stesso
 * sostituto ricalcolandolo, perche' nel database c'e' solo la sua impronta.
 * Senza il segreto non si puo' prevedere.
 */
export function tokenSuccessivo(token) {
  const segreto = process.env.JWT_SEGRETO_REFRESH;
  if (!segreto) throw new Error('JWT_SEGRETO_REFRESH non impostato');
  return crypto.createHmac('sha256', segreto).update(String(token)).digest('hex');
}
