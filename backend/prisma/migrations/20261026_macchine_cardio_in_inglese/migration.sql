-- The cardio machines created by the seed had their Italian name in "nome"
-- and no "nome_it", so the app showed "Tapis Roulant" in English too. Like the
-- rest of the catalogue, "nome" becomes English and "nome_it" Italian
-- (src/utils/macchineCardio.js). Only the seed's rows: Cardio, no Italian name.
UPDATE "esercizi" SET "nome" = 'Treadmill', "nome_it" = 'Tapis Roulant'
  WHERE "nome" = 'Tapis Roulant' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';
UPDATE "esercizi" SET "nome" = 'Exercise Bike', "nome_it" = 'Cyclette'
  WHERE "nome" = 'Cyclette' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';
UPDATE "esercizi" SET "nome" = 'Elliptical', "nome_it" = 'Ellittica'
  WHERE "nome" = 'Ellittica' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';
UPDATE "esercizi" SET "nome" = 'Rowing Machine', "nome_it" = 'Vogatore'
  WHERE "nome" = 'Vogatore (Rower)' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';
UPDATE "esercizi" SET "nome_it" = 'Stepper'
  WHERE "nome" = 'Stepper' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';
UPDATE "esercizi" SET "nome_it" = 'Air Bike'
  WHERE "nome" = 'Air Bike' AND "nome_it" IS NULL AND "gruppo_muscolare_primario" = 'Cardio';

-- Their description, written by the seed in Italian
UPDATE "esercizi" SET "descrizione" = 'Cardio machine: ' || "nome"
  WHERE "gruppo_muscolare_primario" = 'Cardio' AND "descrizione" LIKE 'Macchina cardio: %'
    AND "nome" IN ('Treadmill', 'Exercise Bike', 'Elliptical', 'Rowing Machine', 'Stepper', 'Air Bike');
