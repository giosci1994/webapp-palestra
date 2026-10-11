-- Quando e' stata registrata ogni serie: serve a capire quando e' finito un
-- allenamento lasciato aperto. Le serie gia' registrate restano senza orario
-- (la colonna si aggiunge vuota, il valore predefinito vale da qui in poi).
ALTER TABLE "log_serie" ADD COLUMN "registrata_il" TIMESTAMP(3);
ALTER TABLE "log_serie" ALTER COLUMN "registrata_il" SET DEFAULT CURRENT_TIMESTAMP;
