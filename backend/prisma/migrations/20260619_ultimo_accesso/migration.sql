-- Tracciamento ultimo accesso (presenza/last seen)
ALTER TABLE "utenti" ADD COLUMN "ultimo_accesso" TIMESTAMP(3);
