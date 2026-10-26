// ============================================
// GymMaster — Chat validation schemas
// Zod schemas for messages, contact requests
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.

import { z } from 'zod';
import { ID_MASSIMO } from '../middleware/validazione.js';

/** Schema for sending a contact request */
export const schemaRichiestaContatto = z.object({
  destinatarioId: z
    .number({ required_error: 'chatSchema.destinatarioIdObbligatorio' })
    .int()
    .positive('chatSchema.destinatarioIdNonValido')
    .max(ID_MASSIMO, 'chatSchema.destinatarioIdNonValido')
});

/** Schema for the answer to a contact request */
export const schemaRispostaContatto = z.object({
  stato: z.enum(['ACCETTATA', 'RIFIUTATA', 'BLOCCATA'], {
    required_error: 'chatSchema.statoRispostaObbligatorio',
    invalid_type_error: 'chatSchema.statoRispostaNonValido'
  })
});
