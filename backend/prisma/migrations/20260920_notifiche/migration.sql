-- Notifiche in-app persistite: prima esistevano solo come evento socket
-- volatile e chi non era collegato in quel momento le perdeva.
CREATE TYPE "TipoNotifica" AS ENUM (
  'ALLENAMENTO_PIANIFICATO', 'PROMEMORIA_ALLENAMENTO', 'MESSAGGIO',
  'SCHEDA_ASSEGNATA', 'RICHIESTA_PT', 'SISTEMA'
);

CREATE TABLE "notifiche" (
  "id" SERIAL NOT NULL,
  "utente_id" INTEGER NOT NULL,
  "tipo" "TipoNotifica" NOT NULL DEFAULT 'SISTEMA',
  "titolo" TEXT NOT NULL,
  "messaggio" TEXT NOT NULL,
  "percorso" TEXT,
  "letta" BOOLEAN NOT NULL DEFAULT false,
  "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifiche_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifiche_utente_id_letta_idx" ON "notifiche"("utente_id", "letta");
CREATE INDEX "notifiche_utente_id_creato_il_idx" ON "notifiche"("utente_id", "creato_il");

ALTER TABLE "notifiche"
  ADD CONSTRAINT "notifiche_utente_id_fkey"
  FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
