-- Allenamenti messi in calendario: occorrenze concrete, una riga per giorno
-- pianificato. Spostare o rimandare un allenamento e' un semplice UPDATE della
-- colonna "data", senza eccezioni a regole di ricorrenza da gestire.
CREATE TYPE "StatoAllenamentoPianificato" AS ENUM ('PIANIFICATO', 'COMPLETATO', 'SALTATO');

CREATE TABLE "allenamenti_pianificati" (
  "id" SERIAL NOT NULL,
  "utente_id" INTEGER NOT NULL,
  "scheda_id" INTEGER NOT NULL,
  "data" DATE NOT NULL,
  "stato" "StatoAllenamentoPianificato" NOT NULL DEFAULT 'PIANIFICATO',
  "creato_da_id" INTEGER NOT NULL,
  "sessione_id" INTEGER,
  "note" TEXT,
  "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "allenamenti_pianificati_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "allenamenti_pianificati_sessione_id_key"
  ON "allenamenti_pianificati"("sessione_id");

-- La stessa scheda due volte nello stesso giorno per lo stesso utente non ha senso
CREATE UNIQUE INDEX "allenamenti_pianificati_utente_id_data_scheda_id_key"
  ON "allenamenti_pianificati"("utente_id", "data", "scheda_id");

CREATE INDEX "allenamenti_pianificati_utente_id_data_idx"
  ON "allenamenti_pianificati"("utente_id", "data");

ALTER TABLE "allenamenti_pianificati"
  ADD CONSTRAINT "allenamenti_pianificati_utente_id_fkey"
  FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "allenamenti_pianificati"
  ADD CONSTRAINT "allenamenti_pianificati_creato_da_id_fkey"
  FOREIGN KEY ("creato_da_id") REFERENCES "utenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "allenamenti_pianificati"
  ADD CONSTRAINT "allenamenti_pianificati_scheda_id_fkey"
  FOREIGN KEY ("scheda_id") REFERENCES "schede_allenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "allenamenti_pianificati"
  ADD CONSTRAINT "allenamenti_pianificati_sessione_id_fkey"
  FOREIGN KEY ("sessione_id") REFERENCES "sessioni_allenamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
