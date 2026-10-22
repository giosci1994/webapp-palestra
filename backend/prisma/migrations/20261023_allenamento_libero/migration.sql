-- Free workouts: a workout without a plan (two merged into one, or done with
-- a plan that was then deleted), with a name of its own. Deleting a plan no
-- longer deletes the workouts done with it.
ALTER TABLE "sessioni_allenamento" ALTER COLUMN "scheda_id" DROP NOT NULL;
ALTER TABLE "sessioni_allenamento" ADD COLUMN "titolo" TEXT;
ALTER TABLE "sessioni_allenamento" DROP CONSTRAINT "sessioni_allenamento_scheda_id_fkey";
ALTER TABLE "sessioni_allenamento" ADD CONSTRAINT "sessioni_allenamento_scheda_id_fkey" FOREIGN KEY ("scheda_id") REFERENCES "schede_allenamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
