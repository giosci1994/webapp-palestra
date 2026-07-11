// ============================================
// GymMaster — Middleware Autenticazione JWT
// Verifica token e attacca utente alla richiesta
// ============================================

import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { ErroreNonAutenticato } from '../utils/errori.js';
import logger from '../utils/logger.js';

/**
 * Middleware di autenticazione JWT.
 * Estrae il token dall'header Authorization: Bearer <token>
 * Verifica la validità e attacca l'utente decodificato a req.utente
 */
export async function verificaToken(req, res, next) {
  try {
    const headerAuth = req.headers.authorization;

    if (!headerAuth || !headerAuth.startsWith('Bearer ')) {
      throw new ErroreNonAutenticato('Token di accesso mancante');
    }

    const token = headerAuth.split(' ')[1];

    // Verifica e decodifica il token
    const payload = jwt.verify(token, process.env.JWT_SEGRETO_ACCESS);

    // Verifica che l'utente esista ancora e sia attivo
    const utente = await prisma.utente.findUnique({
      where: { id: payload.utenteId },
      select: {
        id: true,
        email: true,
        nome: true,
        ruolo: true,
        stato: true,
        palestraId: true,
        chatRetentionGiorni: true
      }
    });

    if (!utente) {
      throw new ErroreNonAutenticato('Utente non trovato');
    }

    if (utente.stato !== 'ATTIVO') {
      throw new ErroreNonAutenticato(
        utente.stato === 'BANNATO'
          ? 'Il tuo account è stato sospeso'
          : 'Il tuo account è in attesa di approvazione'
      );
    }

    // Attacca l'utente alla richiesta
    req.utente = utente;
    next();
  } catch (errore) {
    if (errore instanceof ErroreNonAutenticato) {
      return next(errore);
    }

    if (errore.name === 'TokenExpiredError') {
      return next(new ErroreNonAutenticato('Token di accesso scaduto'));
    }

    if (errore.name === 'JsonWebTokenError') {
      return next(new ErroreNonAutenticato('Token di accesso non valido'));
    }

    logger.error({ errore: errore.message }, 'Errore imprevisto nella verifica del token');
    return next(new ErroreNonAutenticato('Errore di autenticazione'));
  }
}

/**
 * Middleware opzionale: se il token è presente lo verifica,
 * altrimenti prosegue senza utente autenticato.
 */
export async function verificaTokenOpzionale(req, res, next) {
  const headerAuth = req.headers.authorization;

  if (!headerAuth || !headerAuth.startsWith('Bearer ')) {
    req.utente = null;
    return next();
  }

  return verificaToken(req, res, next);
}
