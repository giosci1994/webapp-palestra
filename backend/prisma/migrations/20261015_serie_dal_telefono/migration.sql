-- Serie registrate senza rete: il telefono le tiene in coda e le manda quando
-- torna la connessione. Ognuna ha una chiave scelta dal telefono, unica
-- nell'allenamento: se la stessa serie arriva due volte (la prima risposta si
-- e' persa per strada) si registra una volta sola. Le serie gia' registrate
-- restano senza chiave.
ALTER TABLE "log_serie" ADD COLUMN "id_client" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "log_serie_sessione_id_id_client_key" ON "log_serie"("sessione_id", "id_client");
