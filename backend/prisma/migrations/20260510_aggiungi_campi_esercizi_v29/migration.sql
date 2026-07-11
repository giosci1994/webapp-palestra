-- AlterTable: Aggiungi campi dal database Functional Fitness Exercise v2.9
-- Nuovi campi opzionali per categorizzazione avanzata degli esercizi

ALTER TABLE "esercizi" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "body_region" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "mechanics" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "posture" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "movement_pattern" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "laterality" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "force_type" TEXT;
ALTER TABLE "esercizi" ADD COLUMN "classification" TEXT;
