// ============================================
// GymMaster — RBAC authorization middleware
// Role-based checks (UTENTE, PERSONAL_TRAINER, SUPERADMIN)
// ============================================

import { ErroreNonAutorizzato } from '../utils/errori.js';

/**
 * Creates a middleware that checks whether the user has one of the allowed roles.
 * @param  {...string} ruoliConsentiti - List of allowed roles (e.g. 'SUPERADMIN', 'PERSONAL_TRAINER')
 * @returns {Function} Middleware Express
 *
 * @example
 * // SuperAdmin only
 * router.get('/admin', verificaToken, autorizza('SUPERADMIN'), controller);
 *
 * // SuperAdmin and Personal Trainer
 * router.get('/schede', verificaToken, autorizza('SUPERADMIN', 'PERSONAL_TRAINER'), controller);
 */
export function autorizza(...ruoliConsentiti) {
  return (req, res, next) => {
    if (!req.utente) {
      return next(new ErroreNonAutorizzato('Autenticazione richiesta'));
    }

    if (!ruoliConsentiti.includes(req.utente.ruolo)) {
      return next(
        new ErroreNonAutorizzato(
          `Ruolo '${req.utente.ruolo}' non autorizzato. Richiesto: ${ruoliConsentiti.join(' o ')}`
        )
      );
    }

    next();
  };
}
