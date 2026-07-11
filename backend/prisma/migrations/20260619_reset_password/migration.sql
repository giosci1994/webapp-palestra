-- Recupero password via email (token + scadenza)
ALTER TABLE "utenti" ADD COLUMN "token_reset_password" TEXT;
ALTER TABLE "utenti" ADD COLUMN "token_reset_scadenza" TIMESTAMP(3);
