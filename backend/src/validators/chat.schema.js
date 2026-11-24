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
    .number({ error: problema => (problema.input === undefined ? 'chatSchema.destinatarioIdObbligatorio' : undefined) })
    .int()
    .positive('chatSchema.destinatarioIdNonValido')
    .max(ID_MASSIMO, 'chatSchema.destinatarioIdNonValido')
});

/** Schema for the answer to a contact request */
export const schemaRispostaContatto = z.object({
  stato: z.enum(['ACCETTATA', 'RIFIUTATA', 'BLOCCATA'], {
    // A value that is not one of the three keeps zod's own message, as before
    error: problema => {
      if (problema.input === undefined) return 'chatSchema.statoRispostaObbligatorio';
      if (typeof problema.input !== 'string') return 'chatSchema.statoRispostaNonValido';
      return undefined;
    }
  })
});
