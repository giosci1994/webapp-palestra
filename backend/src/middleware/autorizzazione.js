// ============================================
// GymMaster — Middleware Autorizzazione RBAC
// Controllo basato sui ruoli (UTENTE, PERSONAL_TRAINER, SUPERADMIN)
// ============================================

import { ErroreNonAutorizzato } from '../utils/errori.js';

/**
 * Crea un middleware che verifica se l'utente ha uno dei ruoli consentiti.
 * @param  {...string} ruoliConsentiti - Lista di ruoli ammessi (es. 'SUPERADMIN', 'PERSONAL_TRAINER')
 * @returns {Function} Middleware Express
 *
 * @example
 * // Solo SuperAdmin
 * router.get('/admin', verificaToken, autorizza('SUPERADMIN'), controller);
 *
 * // SuperAdmin e Personal Trainer
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
