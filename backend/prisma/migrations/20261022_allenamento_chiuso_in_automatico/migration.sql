-- Workouts closed by the server because they were forgotten open, and when a workout was last resumed
ALTER TABLE "sessioni_allenamento" ADD COLUMN "chiusa_automaticamente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessioni_allenamento" ADD COLUMN "riaperta_il" TIMESTAMP(3);
