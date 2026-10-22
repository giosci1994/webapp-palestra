-- When an admin checked a workout from the list of the ones to check
ALTER TABLE "sessioni_allenamento" ADD COLUMN "controllata_il" TIMESTAMP(3);
