-- Sessioni (famiglie di refresh token) e dispositivo da cui sono nate.
--
-- Una famiglia raccoglie i token nati dallo stesso login, rotazione dopo
-- rotazione: e' quello che l'utente vede come "un dispositivo collegato" e puo'
-- chiudere. Il suo identificativo viaggia anche nell'access token.

ALTER TABLE "refresh_tokens" ADD COLUMN "famiglia" TEXT,
ADD COLUMN "dispositivo" TEXT,
ADD COLUMN "iniziata_il" TIMESTAMP(3);

-- I token gia' emessi non sanno da quale login vengono: ognuno diventa la
-- famiglia di se stesso, iniziata quando e' stato creato
UPDATE "refresh_tokens" SET "famiglia" = gen_random_uuid()::text, "iniziata_il" = "creato";

ALTER TABLE "refresh_tokens" ALTER COLUMN "famiglia" SET NOT NULL,
ALTER COLUMN "iniziata_il" SET NOT NULL,
ALTER COLUMN "iniziata_il" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "refresh_tokens_famiglia_idx" ON "refresh_tokens"("famiglia");
