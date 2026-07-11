// ============================================
// GymMaster — Schemi Validazione Autenticazione
// Schemi Zod per login, registrazione, refresh
// ============================================

import { z } from 'zod';

/** Schema per la registrazione di un nuovo utente */
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

/** Schema per il login */
export const schemaLogin = z.object({
  email: z
    .string({ required_error: 'Email obbligatoria' })
    .email('Formato email non valido')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password obbligatoria' })
    .min(1, 'Password obbligatoria')
});

/** Schema per il refresh del token */
export const schemaRefresh = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token obbligatorio' })
    .min(1, 'Refresh token obbligatorio')
});
