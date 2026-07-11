-- AlterTable
ALTER TABLE "utenti" ADD COLUMN "immagine_profilo" TEXT;
ALTER TABLE "utenti" ADD COLUMN "data_nascita" TIMESTAMP(3);
ALTER TABLE "utenti" ADD COLUMN "peso_kg" DOUBLE PRECISION;
ALTER TABLE "utenti" ADD COLUMN "altezza_cm" INTEGER;
ALTER TABLE "utenti" ADD COLUMN "genere" TEXT;
ALTER TABLE "utenti" ADD COLUMN "bio" TEXT;
ALTER TABLE "utenti" ADD COLUMN "obiettivo_fitness" TEXT;
ALTER TABLE "utenti" ADD COLUMN "preferenze_visibilita" TEXT;
