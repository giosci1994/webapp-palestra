-- Voci cardio/riscaldamento nelle schede: serie/rep/recupero diventano opzionali
ALTER TABLE "esercizi_scheda" ALTER COLUMN "serie_target" DROP NOT NULL;
ALTER TABLE "esercizi_scheda" ALTER COLUMN "rep_target" DROP NOT NULL;
ALTER TABLE "esercizi_scheda" ALTER COLUMN "recupero_secondi" DROP NOT NULL;

-- Campi target cardio (opzionali)
ALTER TABLE "esercizi_scheda" ADD COLUMN "riscaldamento" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "esercizi_scheda" ADD COLUMN "durata_minuti" INTEGER;
ALTER TABLE "esercizi_scheda" ADD COLUMN "velocita_kmh" DOUBLE PRECISION;
ALTER TABLE "esercizi_scheda" ADD COLUMN "inclinazione" DOUBLE PRECISION;
ALTER TABLE "esercizi_scheda" ADD COLUMN "livello_resistenza" INTEGER;
ALTER TABLE "esercizi_scheda" ADD COLUMN "distanza_km" DOUBLE PRECISION;
