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

    // Verifica che l'utente esista ancora e sia attivo, e che la sua sessione
    // (la famiglia di refresh token del login) sia ancora aperta: chiusa da un
    // altro dispositivo, con un logout o per un furto, l'access token smette
    // subito di valere invece di restare buono fino alla scadenza
    const utente = await prisma.utente.findUnique({
      where: { id: payload.utenteId },
      select: {
        id: true,
        email: true,
        nome: true,
        ruolo: true,
        stato: true,
        palestraId: true,
        chatRetentionGiorni: true,
        ...(payload.famiglia && {
          refreshTokens: { where: { famiglia: payload.famiglia, revocato: false }, select: { id: true }, take: 1 }
        })
      }
    });

    if (!utente) {
      throw new ErroreNonAutenticato('Utente non trovato');
    }

    // Gli access token di prima delle famiglie non ne hanno: scadono da soli
    const { refreshTokens, ...datiUtente } = utente;
    if (payload.famiglia && refreshTokens.length === 0) {
      throw new ErroreNonAutenticato('Sessione chiusa: accedi di nuovo');
    }

    if (utente.stato !== 'ATTIVO') {
      throw new ErroreNonAutenticato(
        utente.stato === 'BANNATO'
          ? 'Il tuo account è stato sospeso'
          : 'Il tuo account è in attesa di approvazione'
      );
    }

    // Attacca l'utente alla richiesta, con la sessione da cui arriva
    req.utente = { ...datiUtente, famiglia: payload.famiglia ?? null };
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
