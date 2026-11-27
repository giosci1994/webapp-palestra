-- Supersets and circuits: the group of an exercise in a plan, and the group
-- the exercise was in when a set was logged. Empty = no group, as before.
ALTER TABLE "esercizi_scheda" ADD COLUMN "gruppo" INTEGER;

ALTER TABLE "log_serie" ADD COLUMN "gruppo" INTEGER;
