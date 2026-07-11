-- Verifica email alla registrazione (attiva solo se RESEND_API_KEY configurata)
-- default true: gli account esistenti restano abilitati, i nuovi vengono impostati dal codice
ALTER TABLE "utenti" ADD COLUMN "email_verificata" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "utenti" ADD COLUMN "token_verifica_email" TEXT;
ALTER TABLE "utenti" ADD COLUMN "token_verifica_scadenza" TIMESTAMP(3);
