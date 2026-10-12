// ============================================
// GymMaster — Chat validation schemas
// Zod schemas for messages, contact requests
// ============================================
//
// The messages are translation keys: middleware/validazione.js translates
// them into the request's language when it builds the response.

import { z } from 'zod';

/** Schema for sending a contact request */
export const schemaRichiestaContatto = z.object({
  destinatarioId: z
    .number({ required_error: 'chatSchema.destinatarioIdObbligatorio' })
    .int()
    .positive('chatSchema.destinatarioIdNonValido')
});

/** Schema for the answer to a contact request */
export const schemaRispostaContatto = z.object({
  stato: z.enum(['ACCETTATA', 'RIFIUTATA', 'BLOCCATA'], {
    required_error: 'chatSchema.statoRispostaObbligatorio',
    invalid_type_error: 'chatSchema.statoRispostaNonValido'
  })
});

/** Schema for sending a message */
export const schemaMessaggio = z.object({
  conversazioneId: z
    .number({ required_error: 'chatSchema.conversazioneIdObbligatorio' })
    .int()
    .positive('chatSchema.conversazioneIdNonValido'),
  contenuto: z
    .string({ required_error: 'chatSchema.contenutoObbligatorio' })
    .min(1, 'chatSchema.messaggioVuoto')
    .max(2000, 'chatSchema.messaggioLungo')
    .trim()
});

/** Schema for updating the chat preferences */
export const schemaPreferenzeChat = z.object({
  chatRetentionGiorni: z
    .number()
    .int()
    .min(0, 'chatSchema.ritenzioneMinima')
    .max(365, 'chatSchema.ritenzioneMassima')
});
