// ============================================
// GymMaster — JWT authentication middleware
// Verifies the token and attaches the user to the request
// ============================================

import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { ErroreNonAutenticato } from '../utils/errori.js';
import logger from '../utils/logger.js';
import { linguaSupportata } from '../i18n/index.js';

/**
 * JWT authentication middleware.
 * Extracts the token from the Authorization: Bearer <token> header
 * Checks that it is valid and attaches the decoded user to req.utente
 */
export async function verificaToken(req, res, next) {
  try {
    const headerAuth = req.headers.authorization;

    if (!headerAuth || !headerAuth.startsWith('Bearer ')) {
      throw new ErroreNonAutenticato('Token di accesso mancante');
    }

    const token = headerAuth.split(' ')[1];

    // Verify and decode the token
    const payload = jwt.verify(token, process.env.JWT_SEGRETO_ACCESS);

    // Check that the user still exists and is active, and that their session
    // (the login's refresh token family) is still open: if it was closed from
    // another device, by a logout or because of a theft, the access token stops
    // working right away instead of staying valid until it expires
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
        lingua: true,
        linguaApp: true,
        ...(payload.famiglia && {
          refreshTokens: { where: { famiglia: payload.famiglia, revocato: false }, select: { id: true }, take: 1 }
        })
      }
    });

    if (!utente) {
      throw new ErroreNonAutenticato('Utente non trovato');
    }

    // Access tokens from before families existed have none: they expire on their own
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

    // The app's language, remembered for the messages sent outside a request
    // (push, reminders). It changes rarely: a write only when it does
    if (req.lingua && linguaSupportata(req.headers['accept-language']) && datiUtente.linguaApp !== req.lingua) {
      prisma.utente.update({ where: { id: utente.id }, data: { linguaApp: req.lingua } })
        .catch(err => logger.warn({ utenteId: utente.id, err: err.message }, 'Lingua dell\'app non salvata'));
      datiUtente.linguaApp = req.lingua;
    }

    // Attach the user to the request, with the session it comes from
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
 * Optional middleware: if the token is present it verifies it,
 * otherwise it goes on without an authenticated user.
 */
export async function verificaTokenOpzionale(req, res, next) {
  const headerAuth = req.headers.authorization;

  if (!headerAuth || !headerAuth.startsWith('Bearer ')) {
    req.utente = null;
    return next();
  }

  return verificaToken(req, res, next);
}
