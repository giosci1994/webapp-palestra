// ============================================
// GymMaster — Schemi Validazione Chat
// Schemi Zod per messaggi, richieste contatto
// ============================================

import { z } from 'zod';

/** Schema per l'invio di una richiesta di contatto */
export const schemaRichiestaContatto = z.object({
  destinatarioId: z
    .number({ required_error: 'ID destinatario obbligatorio' })
    .int()
    .positive('ID destinatario non valido')
});

/** Schema per la risposta a una richiesta di contatto */
export const schemaRispostaContatto = z.object({
  stato: z.enum(['ACCETTATA', 'RIFIUTATA', 'BLOCCATA'], {
    required_error: 'Stato risposta obbligatorio',
    invalid_type_error: 'Stato deve essere: ACCETTATA, RIFIUTATA o BLOCCATA'
  })
});

/** Schema per l'invio di un messaggio */
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

/** Schema per aggiornamento preferenze chat */
export const schemaPreferenzeChat = z.object({
  chatRetentionGiorni: z
    .number()
    .int()
    .min(0, 'Il valore minimo è 0 (conservazione permanente)')
    .max(365, 'Il valore massimo è 365 giorni')
});
