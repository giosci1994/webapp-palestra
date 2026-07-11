-- Profilo Personal Trainer: campi professionali raccolti nell'onboarding PT
ALTER TABLE "utenti" ADD COLUMN "specializzazioni" TEXT;
ALTER TABLE "utenti" ADD COLUMN "anni_esperienza" INTEGER;
ALTER TABLE "utenti" ADD COLUMN "certificazioni" TEXT;
ALTER TABLE "utenti" ADD COLUMN "contatto_pubblico" TEXT;
ALTER TABLE "utenti" ADD COLUMN "tariffa_indicativa" TEXT;
