// ============================================
// GymMaster — Authentication validation schemas
// Zod schemas for login, registration, refresh
// ============================================

import { z } from 'zod';

/** Schema for registering a new user */
export const schemaRegistrazione = z.object({
  email: z
    .string({ required_error: 'Email obbligatoria' })
    .email('Formato email non valido')
    .max(255, 'Email troppo lunga')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password obbligatoria' })
    .min(8, 'La password deve avere almeno 8 caratteri')
    .max(128, 'La password non può superare 128 caratteri')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'La password deve contenere almeno una maiuscola, una minuscola e un numero'
    ),
  nome: z
    .string({ required_error: 'Nome obbligatorio' })
    .min(2, 'Il nome deve avere almeno 2 caratteri')
    .max(100, 'Il nome non può superare 100 caratteri')
    .trim(),
  palestraId: z
    .number()
    .int()
    .positive('ID palestra non valido')
    .optional()
    .nullable()
});

/** Schema for the login */
export const schemaLogin = z.object({
  email: z
    .string({ required_error: 'Email obbligatoria' })
    .email('Formato email non valido')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password obbligatoria' })
    .min(1, 'Password obbligatoria'),
  // It must be listed: valida() replaces the body with the validated one, and
  // zod drops the fields the schema does not know
  ricordaDispositivo: z.boolean().optional()
});

/** Schema for the token refresh */
export const schemaRefresh = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token obbligatorio' })
    .min(1, 'Refresh token obbligatorio')
});
