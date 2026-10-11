-- Dispositivi che ricevono le notifiche push (Web Push)
CREATE TABLE "iscrizioni_push" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "dispositivo" TEXT,
    "creata_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iscrizioni_push_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iscrizioni_push_endpoint_key" ON "iscrizioni_push"("endpoint");
CREATE INDEX "iscrizioni_push_utente_id_idx" ON "iscrizioni_push"("utente_id");

ALTER TABLE "iscrizioni_push" ADD CONSTRAINT "iscrizioni_push_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
