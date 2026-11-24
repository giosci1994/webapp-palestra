// ============================================
// GymMaster — Authentication validation schemas
// Zod schemas for login, registration, refresh
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.

import { z } from 'zod';

/** The message when the field is missing; a wrong type keeps zod's own */
const seManca = chiave => problema => (problema.input === undefined ? chiave : undefined);

/** Schema for registering a new user */
export const schemaRegistrazione = z.object({
  email: z
    .string({ error: seManca('autenticazioneSchema.emailObbligatoria') })
    .email('autenticazioneSchema.emailNonValida')
    .max(255, 'autenticazioneSchema.emailTroppoLunga')
    .toLowerCase()
    .trim(),
  password: z
    .string({ error: seManca('autenticazioneSchema.passwordObbligatoria') })
    .min(8, 'autenticazioneSchema.passwordCorta')
    .max(128, 'autenticazioneSchema.passwordLunga')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'autenticazioneSchema.passwordDebole'
    ),
  nome: z
    .string({ error: seManca('autenticazioneSchema.nomeObbligatorio') })
    .min(2, 'autenticazioneSchema.nomeCorto')
    .max(100, 'autenticazioneSchema.nomeLungo')
    .trim(),
  palestraId: z
    .number()
    .int()
    .positive('autenticazioneSchema.palestraIdNonValido')
    .optional()
    .nullable()
});

/** Schema for the login */
export const schemaLogin = z.object({
  email: z
    .string({ error: seManca('autenticazioneSchema.emailObbligatoria') })
    .email('autenticazioneSchema.emailNonValida')
    .toLowerCase()
    .trim(),
  password: z
    .string({ error: seManca('autenticazioneSchema.passwordObbligatoria') })
    .min(1, 'autenticazioneSchema.passwordObbligatoria'),
  // It must be listed: valida() replaces the body with the validated one, and
  // zod drops the fields the schema does not know
  ricordaDispositivo: z.boolean().optional()
});
