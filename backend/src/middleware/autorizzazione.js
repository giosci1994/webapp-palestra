// ============================================
// GymMaster — RBAC authorization middleware
// Role-based checks (UTENTE, PERSONAL_TRAINER, SUPERADMIN)
// ============================================

import { ErroreNonAutorizzato } from '../utils/errori.js';
import { t, localeDi } from '../i18n/index.js';

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
      return next(new ErroreNonAutorizzato(t('autorizzazione.autenticazioneRichiesta')));
    }

    if (!ruoliConsentiti.includes(req.utente.ruolo)) {
      return next(
        new ErroreNonAutorizzato(t('autorizzazione.ruoloNonAutorizzato', {
          ruolo: req.utente.ruolo,
          // "A or B" / "A o B", in the request's language
          richiesti: new Intl.ListFormat(localeDi(), { type: 'disjunction' }).format(ruoliConsentiti)
        }))
      );
    }

    next();
  };
}
