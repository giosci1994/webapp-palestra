// ============================================
// GymMaster — Chat validation schemas
// Zod schemas for messages, contact requests
// ============================================

import { z } from 'zod';

/** Schema for sending a contact request */
export const schemaRichiestaContatto = z.object({
  destinatarioId: z
    .number({ required_error: 'ID destinatario obbligatorio' })
    .int()
    .positive('ID destinatario non valido')
});

/** Schema for the answer to a contact request */
export const schemaRispostaContatto = z.object({
  stato: z.enum(['ACCETTATA', 'RIFIUTATA', 'BLOCCATA'], {
    required_error: 'Stato risposta obbligatorio',
    invalid_type_error: 'Stato deve essere: ACCETTATA, RIFIUTATA o BLOCCATA'
  })
});

/** Schema for sending a message */
export const schemaMessaggio = z.object({
  conversazioneId: z
    .number({ required_error: 'ID conversazione obbligatorio' })
    .int()
    .positive('ID conversazione non valido'),
  contenuto: z
    .string({ required_error: 'Contenuto messaggio obbligatorio' })
    .min(1, 'Il messaggio non può essere vuoto')
    .max(2000, 'Il messaggio non può superare 2000 caratteri')
    .trim()
});

/** Schema for updating the chat preferences */
export const schemaPreferenzeChat = z.object({
  chatRetentionGiorni: z
    .number()
    .int()
    .min(0, 'Il valore minimo è 0 (conservazione permanente)')
    .max(365, 'Il valore massimo è 365 giorni')
});
